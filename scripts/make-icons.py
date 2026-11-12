"""Draws the Slackboard mark (a sagging rope between two anchors) into the app icon assets. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

BG = (18, 22, 24, 255)
CHALK = (237, 235, 228, 255)
S = 4  # supersampling for smooth edges


def mark(size, scale, bg, color=CHALK):
    """The mark centred in a size x size image (by its own bounding box, not its anchor line), spanning `scale` of its width."""
    big = size * S
    im = Image.new("RGBA", (big, big), bg)
    d = ImageDraw.Draw(im)
    w = big * scale
    x0, x1 = (big - w) / 2, (big + w) / 2
    sag = w * 0.34
    stroke = max(2, int(w * 0.034))
    r = stroke * 1.55
    # The curve dips sag/2 below the anchors, and the anchor dots stick out by r: centre that whole box.
    top = big / 2 - (sag / 2 + stroke / 2 - r) / 2
    pts = []
    for i in range(121):
        t = i / 120
        x = x0 + (x1 - x0) * t
        y = top + 2 * sag * t * (1 - t)  # quadratic curve through both anchors, control point at depth 2*sag... peak sag
        pts.append((x, y))
    d.line(pts, fill=color, width=stroke, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=color)
    return im.resize((size, size), Image.LANCZOS)


mark(1024, 0.74, BG).convert("RGB").save("assets/icon.png")
mark(1024, 0.54, (0, 0, 0, 0)).save("assets/adaptive-icon-foreground.png")  # Android masks to a circle or squircle; the safe zone is a circle 61% of the width
mark(1024, 0.54, (0, 0, 0, 0), (255, 255, 255, 255)).save("assets/adaptive-icon-monochrome.png")
mark(1024, 0.6, (0, 0, 0, 0)).save("assets/splash-icon.png")
mark(48, 0.72, BG).convert("RGB").save("assets/favicon.png")
print("ok")
