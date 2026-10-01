#!/usr/bin/env python3
"""Give every team headshot the same white background.

    python3 scripts/normalize-headshots.py          # report only
    python3 scripts/normalize-headshots.py --write  # apply

Some of the headshots are cut-outs saved with a transparent background. On the
page that transparency let the section colour show through, so those portraits
sat on ivory while the studio shots sat on white. Compositing them onto white
settles the difference. Photographs taken against a real background cannot be
fixed here and are reported instead.

Requires Pillow:  python3 -m pip install Pillow
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed. Run:  python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
TEAM = ROOT / "assets" / "img" / "team"
WHITE = (255, 255, 255)
MIN_EDGE = 400  # below this a portrait looks soft in the grid


def main() -> int:
    write = "--write" in sys.argv[1:]
    changed, flagged = [], []

    for path in sorted(TEAM.iterdir()):
        if path.name.startswith("."):
            continue
        img = Image.open(path)
        rgba = img.convert("RGBA")
        alpha = rgba.getchannel("A")
        clear = sum(1 for v in alpha.get_flattened_data() if v < 16) / (img.width * img.height)

        notes = []
        if clear > 0.01:
            notes.append(f"{clear:.0%} transparent")
        if min(img.size) < MIN_EDGE:
            notes.append(f"only {img.width}x{img.height}")

        if clear > 0.01:
            flat = Image.new("RGB", img.size, WHITE)
            flat.paste(rgba, mask=alpha)
            if write:
                flat.save(path.with_suffix(".png"), "PNG", optimize=True)
                if path.suffix.lower() != ".png":
                    path.unlink()
            changed.append((path.name, ", ".join(notes)))
        elif min(img.size) < MIN_EDGE:
            flagged.append((path.name, ", ".join(notes)))

    if changed:
        print(("Composited onto white:" if write else "Would composite onto white:"))
        for name, note in changed:
            print(f"  {name}  ({note})")
    else:
        print("No transparent headshots — all backgrounds already match.")

    if flagged:
        print("\nNeeds a replacement photograph (cannot be fixed here):")
        for name, note in flagged:
            print(f"  {name}  ({note})")

    if changed and not write:
        print("\nRe-run with --write to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
