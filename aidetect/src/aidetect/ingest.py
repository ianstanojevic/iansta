"""Read text from .txt, .docx and .pdf files."""

from __future__ import annotations

from pathlib import Path

SUPPORTED = (".txt", ".md", ".docx", ".pdf")


class UnsupportedFileError(ValueError):
    """The file type cannot be read."""


def read_file(path: Path) -> str:
    """Extract plain text from a supported file.

    Raises:
        UnsupportedFileError: For other extensions, or a PDF without a text layer.
    """
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        raw = path.read_bytes()
        # UTF-16 only with a byte-order mark: nearly any even-length byte
        # string "decodes" as UTF-16, so trying it blindly produces garbage.
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            return raw.decode("utf-16")
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return raw.decode("cp1252", errors="replace")
    if suffix == ".docx":
        import docx

        document = docx.Document(str(path))
        return "\n\n".join(p.text for p in document.paragraphs if p.text.strip())
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        if not text.strip():
            raise UnsupportedFileError(
                "This PDF has no selectable text (it is probably a scan), so it cannot be read."
            )
        return text
    raise UnsupportedFileError(f"Unsupported file type {suffix!r}. Use {', '.join(SUPPORTED)}.")
