"""Draw the app icon (a magnifier over lines of text) and export .png/.ico/.icns."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024


def draw() -> Image.Image:
    """Render the icon at 1024 px."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((64, 64, SIZE - 64, SIZE - 64), radius=200, fill=(31, 95, 191, 255))
    for i, width in enumerate((560, 640, 480, 600, 380)):
        y = 230 + i * 110
        d.rounded_rectangle((180, y, 180 + width, y + 46), radius=23, fill=(255, 255, 255, 235))
    cx, cy, r = 610, 600, 190
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 196, 0, 255), width=64)
    d.line((cx + 130, cy + 130, cx + 235, cy + 235), fill=(255, 196, 0, 255), width=90)
    return img


def main(out: Path) -> None:
    """Write icon.png, icon.ico and icon.icns into ``out``."""
    out.mkdir(parents=True, exist_ok=True)
    img = draw()
    img.save(out / "icon.png")
    img.save(out / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    img.save(out / "icon.icns")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "packaging/build"))
