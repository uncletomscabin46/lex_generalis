#!/usr/bin/env python3
"""Give every team headshot the same white background.

    python3 scripts/normalize-headshots.py          # report only
    python3 scripts/normalize-headshots.py --write  # apply

Two things are normalised.

Some headshots are cut-outs saved with a transparent background. On the page
that transparency let the section colour show through, so those portraits sat
on ivory while the studio shots sat on white. Compositing them onto white
settles the difference.

Some carry a dark hairline along one or more edges, left over from however
they were exported. Scaled into a square frame that reads as a stray line down
the side of the portrait, so those rows and columns are trimmed off.

Photographs taken against a real background cannot be fixed here and are
reported instead.

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
MIN_EDGE = 400   # below this a portrait looks soft in the grid
EDGE_DROP = 40   # an edge this much darker than just inside it is an artefact
MAX_TRIM = 4     # only ever a hairline; more than this is real picture


def edge_trim(img):
    """Count dark artefact lines on each side: (left, top, right, bottom)."""
    px = img.convert("RGB").load()
    w, h = img.size

    def row(y):
        return sum(sum(px[x, y]) / 3 for x in range(0, w, max(1, w // 200))) / len(
            range(0, w, max(1, w // 200)))

    def col(x):
        return sum(sum(px[x, y]) / 3 for y in range(0, h, max(1, h // 200))) / len(
            range(0, h, max(1, h // 200)))

    def count(read, start, step, limit):
        n = 0
        while n < MAX_TRIM:
            here = read(start + n * step)
            inside = read(start + (n + limit) * step)
            if here < inside - EDGE_DROP:
                n += 1
            else:
                break
        return n

    return (count(col, 0, 1, 3), count(row, 0, 1, 3),
            count(col, w - 1, -1, 3), count(row, h - 1, -1, 3))


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

        left, top, right, bottom = edge_trim(img)
        trimming = any((left, top, right, bottom))

        notes = []
        if clear > 0.01:
            notes.append(f"{clear:.0%} transparent")
        if trimming:
            sides = [n for n, v in
                     (("left", left), ("top", top), ("right", right), ("bottom", bottom)) if v]
            notes.append("dark edge on " + "/".join(sides))
        if min(img.size) < MIN_EDGE:
            notes.append(f"only {img.width}x{img.height}")

        if clear > 0.01 or trimming:
            flat = Image.new("RGB", img.size, WHITE)
            flat.paste(rgba, mask=alpha)
            if trimming:
                flat = flat.crop((left, top, img.width - right, img.height - bottom))
            if write:
                if path.suffix.lower() in (".jpg", ".jpeg"):
                    flat.save(path, "JPEG", quality=92, optimize=True, progressive=True)
                else:
                    flat.save(path.with_suffix(".png"), "PNG", optimize=True)
                    if path.suffix.lower() != ".png":
                        path.unlink()
            changed.append((path.name, ", ".join(notes)))
        elif min(img.size) < MIN_EDGE:
            flagged.append((path.name, ", ".join(notes)))

    if changed:
        print("Fixed:" if write else "Would fix:")
        for name, note in changed:
            print(f"  {name}  ({note})")
    else:
        print("Nothing to fix — all backgrounds already match.")

    if flagged:
        print("\nNeeds a replacement photograph (cannot be fixed here):")
        for name, note in flagged:
            print(f"  {name}  ({note})")

    if changed and not write:
        print("\nRe-run with --write to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
