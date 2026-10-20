"""The desktop window: paste or drop text, get a calibrated, explained estimate."""

from __future__ import annotations

import html
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

from PySide6.QtCore import QObject, QSettings, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QAction, QColor, QDragEnterEvent, QDropEvent, QIcon, QPalette
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSplitter,
    QTextBrowser,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from aidetect import __version__
from aidetect.core.text import count_words
from aidetect.detector import Detector, Result
from aidetect.ingest import SUPPORTED, UnsupportedFileError, read_file
from aidetect.texts import APP_NAME, HOW_IT_WORKS, LIMITATIONS, PRIVACY

RELEASES_API = "https://api.github.com/repos/ianstanojevic/iansta/releases/latest"
RELEASES_PAGE = "https://github.com/ianstanojevic/iansta/releases"
BAND_COLOURS = {
    "likely_ai": "#c62828",
    "inconclusive": "#546e7a",
    "likely_human": "#2e7d32",
}
BAND_NOTES = {
    "likely_ai": "Strong resemblance to AI writing. Still not proof: ask the author about it.",
    "inconclusive": "Mixed signals. Plenty of human writing scores like this, so no verdict.",
    "likely_human": "Little resemblance to AI writing. This does not prove a person wrote it.",
}
INK, MUTED, LINE, PAPER, CANVAS, ACCENT = (
    "#1f2933",
    "#5f6b7a",
    "#d9dee5",
    "#ffffff",
    "#eef1f5",
    "#2563eb",
)
# Every widget gets explicit colours, so a dark system theme (which hands Qt a
# light text colour) can never leave light text on these light backgrounds.
STYLE = f"""
* {{ color: {INK}; font-size: 14px; }}
QMainWindow, QWidget#root, QStatusBar {{ background: {CANVAS}; }}
QStatusBar {{ color: {MUTED}; font-size: 12px; }}
QMenuBar {{ background: {CANVAS}; }}
QMenuBar::item:selected, QMenu::item:selected {{ background: #dbe4f3; color: {INK}; }}
QMenu {{ background: {PAPER}; border: 1px solid {LINE}; }}
QLabel#title {{ font-size: 22px; font-weight: 700; }}
QLabel#subtitle, QLabel#muted {{ color: {MUTED}; }}
QLabel#score {{ font-size: 44px; font-weight: 700; }}
QTextEdit, QTextBrowser {{ background: {PAPER}; color: {INK}; border: 1px solid {LINE};
    border-radius: 12px; padding: 12px; selection-background-color: #bcd3f7;
    selection-color: {INK}; }}
QPushButton {{ padding: 9px 18px; border-radius: 8px; border: 1px solid {LINE};
    background: {PAPER}; color: {INK}; }}
QPushButton:hover {{ background: #f3f6fa; }}
QPushButton#primary {{ background: {ACCENT}; color: white; border: none; font-weight: 600;
    padding: 10px 28px; }}
QPushButton#primary:hover {{ background: #1d4ed8; }}
QPushButton#primary:disabled {{ background: #9db7ec; color: white; }}
QFrame#card {{ background: {PAPER}; border: 1px solid {LINE}; border-radius: 14px; }}
QProgressBar {{ border: none; border-radius: 6px; background: #e6eaf0; max-height: 12px; }}
QSplitter::handle {{ background: transparent; width: 14px; }}
QScrollBar:vertical {{ background: transparent; width: 10px; }}
QScrollBar::handle:vertical {{ background: #c5ccd6; border-radius: 5px; min-height: 30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QMessageBox {{ background: {PAPER}; }}
"""


def apply_theme(app: QApplication) -> None:
    """Fixed light look on every platform, whatever the system theme."""
    hints = app.styleHints()
    if hasattr(hints, "setColorScheme"):  # Qt 6.8+
        hints.setColorScheme(Qt.ColorScheme.Light)
    app.setStyle("Fusion")
    palette = QPalette()
    for role, colour in (
        (QPalette.ColorRole.Window, CANVAS),
        (QPalette.ColorRole.WindowText, INK),
        (QPalette.ColorRole.Base, PAPER),
        (QPalette.ColorRole.AlternateBase, CANVAS),
        (QPalette.ColorRole.Text, INK),
        (QPalette.ColorRole.Button, PAPER),
        (QPalette.ColorRole.ButtonText, INK),
        (QPalette.ColorRole.ToolTipBase, PAPER),
        (QPalette.ColorRole.ToolTipText, INK),
        (QPalette.ColorRole.PlaceholderText, "#8a94a3"),
        (QPalette.ColorRole.Highlight, "#bcd3f7"),
        (QPalette.ColorRole.HighlightedText, INK),
        (QPalette.ColorRole.Link, ACCENT),
    ):
        palette.setColor(role, QColor(colour))
    app.setPalette(palette)
    app.setStyleSheet(STYLE)


def resource(name: str) -> Path:
    """Path to a bundled resource, both from source and inside a frozen app."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    candidate = base / "aidetect" / "app" / name
    return candidate if candidate.exists() else Path(__file__).resolve().parent / name


class Worker(QObject):
    """Loads the model and runs analyses off the UI thread."""

    loaded = Signal(str)
    finished = Signal(object)
    failed = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.detector: Detector | None = None

    def load(self) -> None:
        try:
            self.detector = Detector()
            self.loaded.emit(self.detector.version)
        except Exception as error:
            self.failed.emit(f"The detector model could not be loaded: {error}")

    def analyse(self, text: str) -> None:
        if self.detector is None:
            return
        try:
            self.finished.emit(self.detector.analyse(text))
        except Exception as error:
            self.failed.emit(f"Analysis failed: {error}")


class Input(QTextEdit):
    """Text box that also accepts dropped files."""

    file_dropped = Signal(Path)

    def __init__(self) -> None:
        super().__init__()
        self.setAcceptRichText(False)
        self.setPlaceholderText(
            "Paste text here, or drop a .txt, .docx or .pdf file.\n\n"
            "For a meaningful result use at least 150 words of continuous prose."
        )

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:  # noqa: N802 - Qt API
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dropEvent(self, event: QDropEvent) -> None:  # noqa: N802 - Qt API
        urls = event.mimeData().urls()
        if urls and urls[0].isLocalFile():
            self.file_dropped.emit(Path(urls[0].toLocalFile()))
            event.acceptProposedAction()
        else:
            super().dropEvent(event)


class MainWindow(QMainWindow):
    """Input on the left, result on the right."""

    request = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(f"{APP_NAME} {__version__}")
        self.resize(1180, 760)
        self.settings = QSettings("aidetect", "aidetect")

        self.input = Input()
        self.input.file_dropped.connect(self.open_path)
        open_button = QPushButton("Open file…")
        open_button.clicked.connect(self.choose_file)
        clear_button = QPushButton("Clear")
        clear_button.clicked.connect(self.clear)
        self.analyse_button = QPushButton("Loading detector…")
        self.analyse_button.setObjectName("primary")
        self.analyse_button.setEnabled(False)
        self.analyse_button.clicked.connect(self.run)
        self.word_count = QLabel("0 words")
        self.word_count.setObjectName("muted")
        self.input.textChanged.connect(self._update_word_count)
        buttons = QHBoxLayout()
        buttons.addWidget(open_button)
        buttons.addWidget(clear_button)
        buttons.addSpacing(12)
        buttons.addWidget(self.word_count)
        buttons.addStretch()
        buttons.addWidget(self.analyse_button)
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.addWidget(self.input)
        left_layout.addLayout(buttons)

        self.verdict = QLabel("No text analysed yet")
        self.verdict.setObjectName("title")
        self.verdict.setWordWrap(True)
        self.score = QLabel("")
        self.score.setObjectName("score")
        self.score_caption = QLabel("")
        self.score_caption.setObjectName("muted")
        self.meter = QProgressBar()
        self.meter.setRange(0, 100)
        self.meter.setTextVisible(False)
        self.meter.hide()
        self.detail = QLabel("Paste at least 150 words on the left and press Analyse.")
        self.detail.setObjectName("muted")
        self.detail.setWordWrap(True)
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 18, 20, 18)
        score_row = QHBoxLayout()
        score_row.addWidget(self.score)
        score_row.addWidget(self.score_caption, 1)
        card_layout.addWidget(self.verdict)
        card_layout.addLayout(score_row)
        card_layout.addWidget(self.meter)
        card_layout.addWidget(self.detail)
        self.report = QTextBrowser()
        self.report.setOpenExternalLinks(True)
        self.report.setHtml(EMPTY_REPORT)
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.addWidget(card)
        right_layout.addWidget(self.report, 1)

        title = QLabel(APP_NAME)
        title.setObjectName("title")
        subtitle = QLabel(
            "Estimates whether a text was written by AI. Everything stays on this computer."
        )
        subtitle.setObjectName("subtitle")
        header = QVBoxLayout()
        header.setSpacing(2)
        header.addWidget(title)
        header.addWidget(subtitle)

        splitter = QSplitter()
        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([540, 640])
        root = QWidget()
        root.setObjectName("root")
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(22, 16, 22, 10)
        root_layout.setSpacing(14)
        root_layout.addLayout(header)
        root_layout.addWidget(splitter, 1)
        self.setCentralWidget(root)
        self._menus()
        self.statusBar().showMessage(PRIVACY)

        self.worker_thread = QThread(self)
        self.worker = Worker()
        self.worker.moveToThread(self.worker_thread)
        self.worker.loaded.connect(self.on_loaded)
        self.worker.finished.connect(self.show_result)
        self.worker.failed.connect(self.on_error)
        self.request.connect(self.worker.analyse)
        self.worker_thread.started.connect(self.worker.load)
        self.worker_thread.start()
        if self.settings.value("check_updates", True, type=bool):
            QTimer.singleShot(3000, lambda: self.check_updates(quiet=True))

    # -- menus -------------------------------------------------------------
    def _menus(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        open_action = QAction("&Open…", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self.choose_file)
        file_menu.addAction(open_action)
        quit_action = QAction("&Quit", self)
        quit_action.setShortcut("Ctrl+Q")
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)
        help_menu = self.menuBar().addMenu("&Help")
        for label, slot in (
            ("About and accuracy…", self.show_about),
            ("Limitations…", self.show_limitations),
            ("Check for updates", lambda: self.check_updates(quiet=False)),
        ):
            action = QAction(label, self)
            action.triggered.connect(slot)
            help_menu.addAction(action)
        self.auto_update = QAction("Check for updates at start-up", self, checkable=True)
        self.auto_update.setChecked(bool(self.settings.value("check_updates", True, type=bool)))
        self.auto_update.toggled.connect(lambda on: self.settings.setValue("check_updates", on))
        help_menu.addAction(self.auto_update)

    # -- actions -------------------------------------------------------------
    def on_loaded(self, version: str) -> None:
        self.analyse_button.setText("Analyse")
        self.analyse_button.setEnabled(True)
        self.statusBar().showMessage(f"Detector model {version} ready. {PRIVACY}")

    def on_error(self, message: str) -> None:
        self.analyse_button.setEnabled(self.worker.detector is not None)
        self.analyse_button.setText("Analyse")
        QMessageBox.warning(self, APP_NAME, message)

    def choose_file(self) -> None:
        patterns = " ".join(f"*{s}" for s in SUPPORTED)
        name, _ = QFileDialog.getOpenFileName(
            self, "Open a document", "", f"Documents ({patterns})"
        )
        if name:
            self.open_path(Path(name))

    def open_path(self, path: Path) -> None:
        try:
            self.input.setPlainText(read_file(path))
        except (OSError, UnsupportedFileError) as error:
            QMessageBox.warning(self, APP_NAME, str(error))
            return
        self.statusBar().showMessage(f"Loaded {path.name}")

    def _update_word_count(self) -> None:
        n = count_words(self.input.toPlainText())
        self.word_count.setText(
            f"{n} words" + ("  (150+ needed for a verdict)" if 0 < n < 150 else "")
        )

    def clear(self) -> None:
        self.input.clear()
        self.report.clear()
        self.meter.hide()
        self.score.clear()
        self.score_caption.clear()
        self.detail.setText("Paste at least 150 words on the left and press Analyse.")
        self.verdict.setText("No text analysed yet")
        self.verdict.setStyleSheet("")
        self.report.setHtml(EMPTY_REPORT)

    def run(self) -> None:
        text = self.input.toPlainText()
        if not text.strip():
            return
        self.analyse_button.setEnabled(False)
        self.analyse_button.setText("Analysing…")
        self.request.emit(text)

    # -- results -------------------------------------------------------------
    def show_result(self, result: Result) -> None:
        self.analyse_button.setEnabled(True)
        self.analyse_button.setText("Analyse")
        colour = BAND_COLOURS[result.band]
        self.verdict.setText(result.band_label)
        self.verdict.setStyleSheet(f"color: {colour};")
        if result.probability is not None:
            self.score.setText(f"{result.probability:.0%}")
            self.score.setStyleSheet(f"color: {colour};")
            low, high = result.low or 0.0, result.high or 0.0
            spread = f"plausible range {low:.0%}-{high:.0%}" if high - low >= 0.01 else ""
            self.score_caption.setText(f"AI-likeness\n{spread}".rstrip())
            self.meter.setValue(round(100 * result.probability))
            self.meter.setStyleSheet(
                "QProgressBar::chunk { background: " + colour + "; border-radius: 6px; }"
            )
            self.meter.show()
            self.detail.setText(f"{BAND_NOTES[result.band]}  ·  {result.n_words} words")
        else:
            self.score.clear()
            self.score_caption.clear()
            self.meter.hide()
            self.detail.setText(f"{result.n_words} words")
        self.report.setHtml(render_report(result))

    # -- dialogs -------------------------------------------------------------
    def show_about(self) -> None:
        detector = self.worker.detector
        metrics = detector.metrics if detector else {}
        QMessageBox.about(self, f"About {APP_NAME}", about_html(detector, metrics))

    def show_limitations(self) -> None:
        QMessageBox.information(self, "Limitations", LIMITATIONS)

    def check_updates(self, quiet: bool) -> None:
        latest = latest_release()
        if latest and _newer(latest, __version__):
            QMessageBox.information(
                self,
                "Update available",
                f"Version {latest} is available (you have {__version__}).<br>"
                f'<a href="{RELEASES_PAGE}">Download it here</a>.',
            )
        elif not quiet:
            msg = "You have the latest version." if latest else "Could not reach the update server."
            QMessageBox.information(self, "Check for updates", msg)


def latest_release() -> str | None:
    """Latest released version number, or None if offline. Sends no user data."""
    try:
        with urllib.request.urlopen(RELEASES_API, timeout=5) as response:
            tag = str(json.load(response).get("tag_name", ""))
    except (OSError, ValueError):
        return None
    return tag.removeprefix("aidetect-v").removeprefix("v") or None


def _newer(candidate: str, current: str) -> bool:
    def parts(v: str) -> tuple[int, ...]:
        return tuple(int(p) for p in v.split(".") if p.isdigit())

    return parts(candidate) > parts(current)


EMPTY_REPORT = (
    f"<div style='color:{MUTED}; margin-top:40px; text-align:center'>"
    "<p style='font-size:16px'><b>Your result will appear here.</b></p>"
    "<p>Paste text on the left, or drop a .txt, .docx or .pdf file onto it.</p>"
    "<p>You will see a verdict, what the detector noticed, and which sentences look most "
    "AI-like.</p></div>"
)


def _heat_colour(heat: float) -> str:
    # White (relatively human-like) to orange-red (relatively AI-like).
    r, g, b = 255, round(255 - 120 * heat), round(255 - 190 * heat)
    return f"rgb({r},{g},{b})"


def render_report(result: Result) -> str:
    """HTML for the result panel: warnings, reasons, heatmap, how it works."""
    parts: list[str] = [f"<div style='color:{INK}'>"]
    warnings = [w for w in result.warnings if w.code != "always"]
    if warnings:
        items = "".join(f"<li>{html.escape(w.message)}</li>" for w in warnings)
        parts.append(f"<h3 style='color:#b26a00'>Reliability warnings</h3><ul>{items}</ul>")
    if result.reasons_ai or result.reasons_human:
        parts.append("<h3>What the detector noticed</h3>")
        if result.reasons_ai:
            items = "".join(f"<li>{html.escape(r)}</li>" for r in result.reasons_ai)
            parts.append(f"<p><b>Pointing towards AI</b></p><ul>{items}</ul>")
        if result.reasons_human:
            items = "".join(f"<li>{html.escape(r)}</li>" for r in result.reasons_human)
            parts.append(f"<p><b>Pointing towards human</b></p><ul>{items}</ul>")
    if result.sentences:
        parts.append(
            "<h3>Sentence view</h3><p style='color:#555'>Darker = looks more AI-like "
            "<i>than the rest of this text</i>; colours are faint when the overall score is "
            "low. Much less reliable than the overall result.</p><p style='line-height:150%'>"
        )
        cursor = 0
        for s in result.sentences:
            parts.append(html.escape(result.text[cursor : s.span.start]).replace("\n", "<br>"))
            parts.append(
                f"<span style='background:{_heat_colour(s.heat)}'>"
                f"{html.escape(s.span.text(result.text))}</span>"
            )
            cursor = s.span.end
        parts.append(html.escape(result.text[cursor:]).replace("\n", "<br>") + "</p>")
    note = next((w for w in result.warnings if w.code == "always"), None)
    if note:
        parts.append(f"<p style='color:#555'><i>{html.escape(note.message)}</i></p>")
    parts.append(
        "<p style='color:#555'><b>This is an estimate, not proof.</b> Never use it as the only "
        "basis for accusing someone. See Help → Limitations.</p>"
    )
    parts.append("</div>")
    return "".join(parts)


def _p(x: Any) -> str:
    return f"{100 * float(x):.1f}%" if isinstance(x, int | float) else "n/a"


def about_html(detector: Detector | None, metrics: dict[str, Any]) -> str:
    """About / accuracy dialog content, generated from the evaluation stored in the model."""
    rows = []
    test, ood = metrics.get("test", {}), metrics.get("ood", {})
    if test:
        rows.append(("Texts like the training data", test))
    if "all" in ood:
        rows.append(("Unfamiliar texts (other datasets)", ood["all"]))
    table = "".join(
        f"<tr><td>{name}</td><td>{_p(m.get('fpr'))}</td><td>{_p(m.get('tpr'))}</td></tr>"
        for name, m in rows
    )
    non_native = metrics.get("non_native", {})
    nn = "".join(
        f"<li>{k.split('=')[-1].removeprefix('gb_')}: {_p(v.get('fpr'))} wrongly flagged</li>"
        for k, v in non_native.items()
    )
    trained = html.escape(detector.trained_on) if detector else ""
    return (
        f"<h3>{APP_NAME} {__version__}</h3>"
        f"<p>{html.escape(PRIVACY)}</p>"
        f"<p>{html.escape(HOW_IT_WORKS).replace(chr(10) + chr(10), '<br><br>')}</p>"
        "<h4>Measured accuracy (texts of 150+ words)</h4>"
        "<table cellpadding='4'><tr><th></th><th>Human texts wrongly flagged</th>"
        f"<th>AI texts caught</th></tr>{table}</table>"
        f"<p>Writing by non-native English speakers:</p><ul>{nn}</ul>"
        f"<p>Trained on: {trained}.</p>"
        "<p>Full report: <a href='https://github.com/ianstanojevic/iansta/blob/"
        f"aidetect-v{__version__}/aidetect/reports/EVALUATION.md'>EVALUATION.md</a></p>"
    )


def self_test(log: Path) -> int:
    """Headless check of a frozen build: load the model, analyse, build the window.

    Never opens a dialog (with no screen it would wait forever); writes the
    outcome, or the full traceback, to ``log``, since windowed apps on Windows
    have no console.
    """
    import traceback

    try:
        result = Detector().analyse(SELF_TEST_TEXT)
        if result.probability is None:
            raise RuntimeError("self-test text produced no score")
        app = QApplication.instance() or QApplication(sys.argv)
        window = MainWindow()
        window.show_result(result)
        window.worker_thread.quit()
        window.worker_thread.wait(10000)
        del app
        log.write_text(f"self-test OK: {result.band_label} {result.probability:.3f}\n")
        return 0
    except Exception:
        log.write_text("self-test FAILED\n" + traceback.format_exc())
        return 1


def main() -> int:
    """Start the app."""
    if "--self-test" in sys.argv:
        return self_test(Path("selftest.log").resolve())
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    icon = resource("icon.png")
    if icon.exists():
        app.setWindowIcon(QIcon(str(icon)))
    apply_theme(app)
    window = MainWindow()
    window.show()
    return app.exec()


SELF_TEST_TEXT = (
    "The old harbour was quiet that morning. "
    * 2
    + "Fishermen mended their nets while gulls argued over scraps, and the smell of tar and salt "
    "hung over everything. I had come to find my grandfather's boat, which he sold the year I "
    "was born, and which nobody in the village seemed to remember. "
) * 6


if __name__ == "__main__":
    raise SystemExit(main())
