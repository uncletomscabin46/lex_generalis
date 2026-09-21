#!/usr/bin/env python3
"""Generate the hero image derivatives from a source photograph.

    python3 scripts/make-hero.py path/to/new-photo.jpg

Writes assets/img/hero-1920.{webp,jpg}, hero-1200.{webp,jpg} and keeps the
original as hero-source.jpg. The stylesheet already points at these names, so
nothing else needs to change.

Requires Pillow:  python3 -m pip install Pillow
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed. Run:  python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img"
WIDTHS = (1920, 1200)


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    src_path = Path(sys.argv[1]).expanduser()
    if not src_path.is_file():
        sys.exit(f"No such file: {src_path}")

    img = Image.open(src_path).convert("RGB")
    print(f"source: {src_path.name}  {img.width}x{img.height}")

    if img.width < max(WIDTHS):
        print(
            f"  note: source is only {img.width}px wide, so the 1920px version "
            f"will be upscaled and may look soft."
        )

    for width in WIDTHS:
        height = round(img.height * width / img.width)
        resized = img.resize((width, height), Image.LANCZOS)
        for ext, opts in (
            ("webp", dict(quality=78, method=6)),
            ("jpg", dict(quality=82, optimize=True, progressive=True)),
        ):
            dest = OUT / f"hero-{width}.{ext}"
            resized.save(dest, **opts)
            print(f"  wrote {dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.0f} KB")

    original = OUT / "hero-source.jpg"
    img.save(original, quality=92, optimize=True, progressive=True)
    print(f"  wrote {original.relative_to(ROOT)}  {original.stat().st_size / 1024:.0f} KB")

    print(
        "\nDone. Check the crop at both sizes — `background-position` in the\n"
        "`.hero--photo::before` rule is tuned to the current photo and a new\n"
        "one will probably want a different value."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
