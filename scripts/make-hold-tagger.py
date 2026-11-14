"""Builds a hold-tagging kit: one cropped picture per hold, a CSV per board, and a single-file web page for tagging them.

Boards: MoonBoard 2016 (the bundled hold art) and Tension Board 2 Spray 12 high x 8 wide (images and holes from the official app's
data). Output goes to research/holds/ (git-ignored). Run: python3 scripts/make-hold-tagger.py [--xapk PATH]

The tagged result is a JSON file, one per board: {"board": ..., "version": 1, "holds": {"<key>": "<type>"}}. Keys are the cell name
("H9") for the MoonBoard and the placement id for the Tension Board. Types are in src/core/holdTypes.ts.
"""
import argparse, csv, json, os, shutil, sqlite3, subprocess, sys, tempfile, zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "research" / "holds"
BG = (42, 47, 51, 255)
TYPES = ["jug", "incut", "crimp", "sloper", "pinch", "pocket", "volume", "foot"]

# MoonBoard grid: 11 columns A-K, 18 rows; the art is stretched over x in [0, 12], y in [0, 19] with cell (col, row) at (col + 1, row).
COLS, ROWS, COL_LETTERS = 11, 18, "ABCDEFGHIJK"
# Tension Board 2 Spray: layout 11, product size 8 (12 high x 8 wide), hold sets Wood (12) and Plastic (13), edges -44..44 by 0..144.
TB2_LAYOUT, TB2_SIZE = 11, 8
TB2_EDGES = dict(left=-44, right=44, bottom=0, top=144)
TB2_SETS = {12: "Wood", 13: "Plastic"}


def composite(img):
    bg = Image.new("RGBA", img.size, BG)
    bg.alpha_composite(img.convert("RGBA"))
    return bg


def isolate(base, alpha, labels, center, radius, min_half, folder, name, size=240):
    """Crops one hold: the connected piece of the art nearest `center`, with everything else blanked to the background.

    Returns (note, pixels). The note is "" for a clean crop, "merged" when the piece also reaches a neighbouring centre (two touching
    holds were one shape, so the crop is left unmasked and centred on the cell), or "none" when no art lies near the centre.
    """
    cx, cy = center
    h, w = alpha.shape
    x0, x1 = max(0, int(cx - radius)), min(w, int(cx + radius) + 1)
    y0, y1 = max(0, int(cy - radius)), min(h, int(cy + radius) + 1)
    win = labels[y0:y1, x0:x1]
    ys, xs = np.nonzero(win)
    if len(xs) == 0:
        return "none", 0
    d = np.hypot(xs + x0 - cx, ys + y0 - cy)
    label = win[ys[d.argmin()], xs[d.argmin()]]
    mask = labels == label
    py, px = np.nonzero(mask)
    box = (px.min(), py.min(), px.max(), py.max())
    half = max(box[2] - box[0], box[3] - box[1]) / 2 + 3
    half = max(half, min_half)
    mx, my = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    folder.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGBA", base.size, BG)
    canvas.paste(base, mask=Image.fromarray((mask * 255).astype("uint8")))
    return (label, mask, (mx, my, half), canvas), int(mask.sum())


def write_crop(canvas, mx, my, half, folder, name, mark=None, size=240):
    """Crops a square around (mx, my), filling anything outside the picture with the background rather than black.

    `mark` is the hole's own position: a small dot there shows which hold is meant when a neighbour touches it in the picture.
    """
    side = int(round(half * 2))
    out = Image.new("RGBA", (side, side), BG)
    left, top = int(round(mx - half)), int(round(my - half))
    out.alpha_composite(canvas.crop((left, top, left + side, top + side)))
    out = out.resize((size, size), Image.LANCZOS)
    if mark is not None:
        d = ImageDraw.Draw(out)
        x, y = (mark[0] - left) / side * size, (mark[1] - top) / side * size
        r = 7
        d.ellipse((x - r - 2, y - r - 2, x + r + 2, y + r + 2), fill=(18, 22, 24, 255))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(232, 199, 102, 255))
    out.convert("RGB").save(folder / f"{name}.png", optimize=True)


def moon_2016():
    art = Image.open(ROOT / "assets" / "moonboard" / "2016.webp").convert("RGBA")
    w, h = art.size
    alpha = np.array(art)[:, :, 3] > 40
    labels, _ = ndimage.label(ndimage.binary_dilation(alpha, iterations=3))
    labels = labels * alpha  # the dilation only joins pieces of one hold; the pixels kept are the art's own
    base = composite(art)
    pitch_x, pitch_y = w / 12, h / 19
    folder = OUT / "crops" / "moon2016"
    folder.mkdir(parents=True, exist_ok=True)
    found, rows, notes = {}, [], []
    for col in range(COLS):
        for row in range(1, ROWS + 1):
            cell = f"{COL_LETTERS[col]}{row}"
            center = ((col + 1) * pitch_x, (19 - row) * pitch_y)
            res, pixels = isolate(base, alpha, labels, center, pitch_x * 0.3, pitch_x * 0.55, folder, cell)
            if res in ("none",):
                continue
            label, mask, (mx, my, half), canvas = res
            found.setdefault(int(label), []).append(cell)
            rows.append({"key": cell, "col": COL_LETTERS[col], "row": row, "image": f"crops/moon2016/{cell}.png", "label": int(label), "mask": mask, "geom": (mx, my, half), "canvas": canvas, "pixels": pixels, "center": center})
    merged = {lab: cells for lab, cells in found.items() if len(cells) > 1}
    for r in rows:
        merged_with = merged.get(r["label"])
        if merged_with:
            # Two touching holds came out as one shape: crop a fixed window on the cell itself, unmasked, and flag it.
            cx, cy = (COL_LETTERS.index(r["col"]) + 1) * pitch_x, (19 - r["row"]) * pitch_y
            write_crop(base, cx, cy, pitch_x * 0.75, folder, r["key"], mark=(cx, cy))
            r["note"] = "touches " + ", ".join(c for c in merged_with if c != r["key"])
            notes.append(f"{r['key']} {r['note']}")
        else:
            write_crop(r["canvas"], *r["geom"], folder, r["key"], mark=r["center"])
            r["note"] = ""
        for k in ("label", "mask", "geom", "canvas", "center"):
            del r[k]
    return rows, notes


def find_tb2_sources(xapk):
    work = Path(tempfile.mkdtemp(prefix="tb2-"))
    with zipfile.ZipFile(xapk) as z:
        apk = next(n for n in z.namelist() if n.endswith("com.auroraclimbing.tensionboard2.apk"))
        z.extract(apk, work)
    apk_path = work / apk
    with zipfile.ZipFile(apk_path) as z:
        z.extract("assets/db.sqlite3", work)
        for name in ("8x12-tb2-wood.png", "8x12-tb2-plastic.png"):
            z.extract(f"assets/img/product_sizes_layouts_sets/{name}", work)
    return work


def tb2_spray(xapk):
    work = find_tb2_sources(xapk)
    db = sqlite3.connect(work / "assets" / "db.sqlite3")
    e = TB2_EDGES
    q = """select p.id, p.hole_id, h.x, h.y, p.set_id from placements p join holes h on h.id = p.hole_id
           where p.layout_id = ? and p.set_id in (12, 13) and h.x between ? and ? and h.y between ? and ? order by h.y desc, h.x"""
    holes = db.execute(q, (TB2_LAYOUT, e["left"], e["right"], e["bottom"], e["top"])).fetchall()
    raw = {12: Image.open(work / "assets/img/product_sizes_layouts_sets/8x12-tb2-wood.png").convert("RGBA"),
           13: Image.open(work / "assets/img/product_sizes_layouts_sets/8x12-tb2-plastic.png").convert("RGBA")}
    images = {k: composite(v) for k, v in raw.items()}
    alphas = {k: np.array(v)[:, :, 3] > 40 for k, v in raw.items()}
    labels = {}
    for k, a in alphas.items():
        lab, _ = ndimage.label(ndimage.binary_dilation(a, iterations=3))
        labels[k] = lab * a
    w, h = images[12].size
    sx, sy = w / (e["right"] - e["left"]), h / (e["top"] - e["bottom"])
    pts = [(x, y) for _, _, x, y, _ in holes]
    spacing = min(np.hypot(a[0] - b[0], a[1] - b[1]) for i, a in enumerate(pts) for b in pts[i + 1:] if a != b)
    folder = OUT / "crops" / "tb2-spray-12x8"
    folder.mkdir(parents=True, exist_ok=True)
    rows, notes = [], []
    for pid, hid, x, y, sid in holes:
        center = ((x - e["left"]) * sx, (e["top"] - y) * sy)
        res, pixels = isolate(images[sid], alphas[sid], labels[sid], center, spacing * sx * 0.45, spacing * sx * 0.5, folder, str(pid))
        row = {"key": str(pid), "hole": hid, "x": x, "y": y, "set": TB2_SETS[sid], "image": f"crops/tb2-spray-12x8/{pid}.png", "note": ""}
        if res == "none":
            # No art at the hole: draw the plain window so the hold can still be looked at, and say so.
            write_crop(images[sid], center[0], center[1], spacing * sx * 0.7, folder, str(pid), mark=center)
            row["note"] = "no art found"
            notes.append(f"{pid} no art found")
        else:
            label, mask, (mx, my, half), canvas = res
            write_crop(canvas, mx, my, half, folder, str(pid), mark=center)
        rows.append(row)
    shutil.rmtree(work, ignore_errors=True)
    return rows, notes


def write_csv(path, rows, fields):
    with open(path, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=fields + ["type"])
        wr.writeheader()
        for r in rows:
            wr.writerow({**{k: r[k] for k in fields}, "type": ""})


def contact_sheet(board, rows, per_row=10, cell=150):
    """A printable overview: every hold with its key, in board order, so it can be tagged on paper or compared on screen."""
    font = ImageFont.load_default()
    pages = []
    per_page = per_row * 8
    for start in range(0, len(rows), per_page):
        chunk = rows[start:start + per_page]
        sheet = Image.new("RGB", (per_row * cell, 8 * (cell + 18)), (24, 28, 30))
        d = ImageDraw.Draw(sheet)
        for i, r in enumerate(chunk):
            im = Image.open(OUT / r["image"]).resize((cell - 6, cell - 6))
            x, y = (i % per_row) * cell, (i // per_row) * (cell + 18)
            sheet.paste(im, (x + 3, y + 3))
            d.text((x + 6, y + cell), r["key"], fill=(237, 235, 228), font=font)
        p = OUT / f"sheet-{board}-{start // per_page + 1}.png"
        sheet.save(p, optimize=True)
        pages.append(p.name)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xapk", default=str(Path.home() / "Downloads" / "Tension+Board_5.0.7_APKPure.xapk"))
    args = ap.parse_args()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    moon, moon_notes = moon_2016()
    write_csv(OUT / "moon2016.csv", moon, ["key", "col", "row", "note"])
    tb2, tb2_notes = tb2_spray(args.xapk)
    write_csv(OUT / "tb2-spray-12x8.csv", tb2, ["key", "hole", "x", "y", "set", "note"])
    data = {
        "types": TYPES,
        "boards": [
            {"id": "moon2016", "name": "MoonBoard 2016", "keyLabel": "Cell", "holds": moon},
            {"id": "tb2-spray-12x8", "name": "Tension Board 2 Spray 12x8", "keyLabel": "Placement", "holds": tb2},
        ],
    }
    (OUT / "holds.json").write_text(json.dumps(data))
    sheets = {"moon2016": contact_sheet("moon2016", moon), "tb2-spray-12x8": contact_sheet("tb2-spray-12x8", tb2)}
    template = (ROOT / "scripts" / "hold-tagger.html").read_text()
    (OUT / "tagger.html").write_text(template.replace("/*DATA*/null", json.dumps(data)))
    print(f"MoonBoard 2016: {len(moon)} holds", *moon_notes, sep="\n  ")
    print(f"Tension Board 2 Spray 12x8: {len(tb2)} holds", *tb2_notes, sep="\n  ")
    print("sheets:", sheets)
    print(f"written to {OUT}")


if __name__ == "__main__":
    main()
