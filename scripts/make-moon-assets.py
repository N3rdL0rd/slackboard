"""Builds the MoonBoard hold-art layers the app bundles (assets/moonboard/*.webp) from the full-size source images.

Sources: two folders of 5200 px wide transparent PNGs, one per hold set plus an `all-holds` composite per setup, named
`<setup>__<set>.png` (for example `moonboard-masters-2019__all-holds.png`). Only the composites are used: a board has every set.
  - full size boards: 5200 x 8000, 18 rows
  - mini boards:      5200 x 5552, 12 rows

Each image's hold lattice is measured from the hold centroids (11 columns, `rows` rows, uniform pitch), so no position is assumed.
The app draws a layer stretched over the board's edges, x in [0, 12] and y in [0, rows + 1] grid units, with hole (col, row) at
unit (col + 1, row). Each output is the source cropped to that window and resized.

Run: python3 scripts/make-moon-assets.py /path/to/moonboard_assets_free /path/to/moonboard_assets_free_mini
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
OUT = Path(__file__).resolve().parent.parent / "assets" / "moonboard"
OUT_W = 560  # px; height follows the board's aspect: 12 wide by rows + 1 high
COLS = 11

FULL = {  # app setup key -> source file stem
    "2024": "moonboard-2024__all-holds",  # first: it has every hole, so it calibrates the others
    "2016": "moonboard-2016__all-holds",
    "2017": "moonboard-masters-2017__all-holds",
    "2019": "moonboard-masters-2019__all-holds",
}
MINI = {
    "mini2020": "mini-moonboard-2020__all-holds",
    "mini2025": "mini-moonboard-2025__all-holds",
}


def lattice(path: Path, rows: int) -> tuple[float, float, float, float]:
    """(x of column A, pitch_x, y of the top row, pitch_y) in source pixels, fitted to the hold centroids.

    Centroids are grouped into columns and rows by gaps (a hole spacing is about 400 px; a hold is at most about 300 wide), so a
    composite with a few holds missing still calibrates as long as every row and column has some.
    """
    alpha = np.asarray(Image.open(path))[:, :, 3][::4, ::4] > 40
    labels, n = ndi.label(alpha)
    sizes = ndi.sum(alpha, labels, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 300]
    cy, cx = (np.array(ndi.center_of_mass(alpha, labels, keep)) * 4).T

    def axis(values: np.ndarray, count: int, name: str) -> tuple[float, float]:
        order = np.sort(values)
        groups: list[list[float]] = [[order[0]]]
        for v in order[1:]:
            (groups[-1].append(v) if v - groups[-1][-1] < 150 else groups.append([v]))
        groups = [g for g in groups if len(g) >= 3]  # a stray blob is not a row
        assert len(groups) == count, f"{path.name}: expected {count} {name}, found {len(groups)}"
        pitch, first = np.polyfit(np.arange(count), [np.mean(g) for g in groups], 1)
        return first, pitch

    x0, px = axis(cx, COLS, "columns")
    y_top, py = axis(cy, rows, "rows")
    return x0, px, y_top, py


def calibrate(src: Path, stems: list[str], rows: int) -> tuple[float, float, float, float]:
    """Some composites lack holes (the 2016 setup has 139 of 198), so the lattice is measured on the first one that has every
    hole. All images of one board size share a canvas, so it applies to the rest."""
    for stem in stems:
        try:
            return lattice(src / f"{stem}.png", rows)
        except AssertionError as e:
            print("skipped for calibration:", e)
    raise SystemExit(f"no composite in {src} has all {COLS * rows} holes")


def build(src: Path, setups: dict[str, str], rows: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    x0, px, y_top, py = calibrate(src, list(setups.values()), rows)
    print(f"{rows} rows: lattice x0={x0:.1f} px={px:.2f} y_top={y_top:.1f} py={py:.2f}")
    for key, stem in setups.items():
        path = src / f"{stem}.png"
        # Window: unit x in [0, 12] is column index -1 .. 11; unit y in [0, rows + 1] runs from the row below row 1 to above the top row.
        box = tuple(round(v) for v in (x0 - px, y_top - py, x0 + 11 * px, y_top + rows * py))
        img = Image.open(path).convert("RGBA").crop(box)
        out = img.resize((OUT_W, round(OUT_W * (rows + 1) / 12)), Image.LANCZOS)
        target = OUT / f"{key}.webp"
        out.save(target, "WEBP", quality=88, method=6)
        print(f"{target.name}: window={box} -> {out.size} {target.stat().st_size // 1024} KB")


def main(full: Path, mini: Path) -> None:
    build(full, FULL, 18)
    build(mini, MINI, 12)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
