#!/usr/bin/env python3
"""
Genererar platshållarbilder och data/products.json för den virtuella butiken.

  python3 scripts/generate_placeholders.py

Skapar:
  assets/products/<id>-1.webp, <id>-2.webp   produktbilder (images[])
  assets/products/<id>-tryon.png             transparent PNG för AR-provning
  assets/campaign/campaign-N.jpg             bilder till digitala skärmar
  assets/photos/photo-N.jpg                  inramade "modefoton"
  data/products.json                         20 platshållarprodukter

Alla bilder är enkla illustrationer – byt ut dem mot riktiga produktbilder.
Inga riktiga varumärkesbilder används.
"""
import json
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PRODUCTS = os.path.join(ROOT, "assets", "products")
OUT_CAMPAIGN = os.path.join(ROOT, "assets", "campaign")
OUT_PHOTOS = os.path.join(ROOT, "assets", "photos")
DATA = os.path.join(ROOT, "data", "products.json")

W, H = 600, 800  # tryOn-bildens storlek
SS = 2           # supersampling för mjuka kanter

COLORS = {
    "Svart": "#1d1d1f", "Vit": "#f4f2ee", "Offwhite": "#ece6da", "Beige": "#d8c7ae",
    "Kamel": "#b98a5a", "Champagne": "#e6d3b3", "Ljusblå": "#a9c1d9", "Mellanblå": "#5f7fa6",
    "Mörkblå": "#2f4466", "Ljus denim": "#9db6cf", "Grå": "#9b9b9b", "Gråmelerad": "#b3b1ad",
    "Marinblå": "#24304a", "Smaragd": "#1f5c4a", "Cognac": "#8a4f2a", "Rosa": "#e7b9b6",
    "Brun": "#5a3d2b", "Röd": "#a4262c", "Oliv": "#6b6b45",
}

FONT_DIRS = ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/dejavu"]


def font(size, weight="Regular"):
    for name in (f"Inter-{weight}.otf", "Inter-Regular.otf", "DejaVuSans.ttf"):
        for d in FONT_DIRS:
            p = os.path.join(d, name)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def hex_rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(rgb, f):
    return tuple(max(0, min(255, int(c * f))) for c in rgb[:3]) + (rgb[3] if len(rgb) > 3 else 255,)


def P(pts):
    """Normaliserade koordinater (0–1) -> pixlar i supersamplad duk."""
    return [(x * W * SS, y * H * SS) for x, y in pts]


def canvas():
    return Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))


def finish(img):
    return img.resize((W, H), Image.LANCZOS)


def fabric_shading(img, base):
    """Mjuk vertikal skuggning + lätt brus så att plagget inte ser platt ut."""
    w, h = img.size
    alpha = img.split()[3]
    grad = Image.new("RGBA", (w, h))
    gd = ImageDraw.Draw(grad)
    for x in range(0, w, 4):
        t = x / w
        f = 0.88 + 0.16 * math.sin(t * math.pi)  # ljusare mitt
        gd.rectangle([x, 0, x + 4, h], fill=shade(base, f))
    rnd = random.Random(42)
    nd = ImageDraw.Draw(grad)
    for _ in range(2500):
        x, y = rnd.randrange(w), rnd.randrange(h)
        nd.point((x, y), fill=shade(base, 0.8 + rnd.random() * 0.35))
    return Image.composite(grad, Image.new("RGBA", (w, h), (0, 0, 0, 0)), alpha)


def mask_poly(polys):
    m = canvas()
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon(P(poly), fill=(255, 255, 255, 255))
    return m


def garment(polys, base_hex, details=None, pattern=None):
    base = hex_rgb(base_hex)
    m = mask_poly(polys)
    img = fabric_shading(m, base)
    if pattern:
        pattern(img, m)
    if details:
        d = ImageDraw.Draw(img)
        details(d, base)
    return finish(img)


def line(d, pts, base, f=0.7, width=3):
    d.line(P(pts), fill=shade(base, f), width=width * SS, joint="curve")


# ---------------------------------------------------------------- former

def shape_tee(long_sleeve=False, loose=1.0):
    sl = 0.62 if long_sleeve else 0.32
    sw = 0.04 if long_sleeve else 0.08
    return [[
        (0.40, 0.08), (0.46, 0.115), (0.54, 0.115), (0.60, 0.08),   # hals
        (0.76, 0.12), (0.92 if long_sleeve else 0.95, sl - 0.02),       # höger ärm
        (0.92 - sw * 2 if long_sleeve else 0.83, sl + 0.02),
        (0.74, 0.30), (0.75 * loose + 0.25 * (1 - loose), 0.88), (0.25 + (1 - loose) * 0.02, 0.88),
        (0.26, 0.30), (0.08 + sw * 2 if long_sleeve else 0.17, sl + 0.02),
        (0.08 if long_sleeve else 0.05, sl - 0.02), (0.24, 0.12),
    ]]


def shape_shirt():
    return [[
        (0.41, 0.07), (0.50, 0.13), (0.59, 0.07), (0.78, 0.12), (0.94, 0.62), (0.85, 0.65),
        (0.75, 0.32), (0.77, 0.90), (0.50, 0.93), (0.23, 0.90), (0.25, 0.32),
        (0.15, 0.65), (0.06, 0.62), (0.22, 0.12),
    ]]


def shape_coat(length=0.95, puffer=False):
    w = 0.06 if puffer else 0.0
    return [[
        (0.40, 0.06), (0.50, 0.10), (0.60, 0.06), (0.79 + w, 0.11), (0.95 + w, 0.66),
        (0.85 + w, 0.69), (0.76 + w, 0.34), (0.80 + w * 0.5, length), (0.20 - w * 0.5, length),
        (0.24 - w, 0.34), (0.15 - w, 0.69), (0.05 - w, 0.66), (0.21 - w, 0.11),
    ]]


def shape_jeans(kind="straight"):
    hem = {"straight": (0.10, 0.36), "wide": (0.02, 0.45), "boot": (0.06, 0.40), "mom": (0.16, 0.33)}[kind]
    knee = {"straight": (0.15, 0.36), "wide": (0.08, 0.43), "boot": (0.17, 0.35), "mom": (0.13, 0.38)}[kind]
    lo, li = hem
    ko, ki = knee
    return [[
        (0.16, 0.02), (0.84, 0.02), (0.86, 0.12), (1 - ko, 0.55), (1 - lo, 0.98),
        (1 - li, 0.98), (0.52, 0.30), (0.48, 0.30), (li, 0.98), (lo, 0.98), (ko, 0.55), (0.14, 0.12),
    ]]


def shape_skirt():
    return [[(0.24, 0.03), (0.76, 0.03), (0.90, 0.62), (0.10, 0.62)]]


def shape_dress(strap=True, flare=0.08):
    top = [(0.36, 0.02), (0.40, 0.02), (0.42, 0.10), (0.58, 0.10), (0.60, 0.02), (0.64, 0.02)] if strap else \
          [(0.30, 0.04), (0.42, 0.06), (0.50, 0.12), (0.58, 0.06), (0.70, 0.04)]
    return [top + [
        (0.70, 0.20), (0.66, 0.36), (0.78 + flare, 0.97), (0.22 - flare, 0.97), (0.34, 0.36), (0.30, 0.20),
    ]]


def shape_dress_sleeved():
    return [[
        (0.40, 0.04), (0.50, 0.09), (0.60, 0.04), (0.74, 0.08), (0.90, 0.42), (0.82, 0.45),
        (0.70, 0.22), (0.66, 0.38), (0.80, 0.97), (0.20, 0.97), (0.34, 0.38), (0.30, 0.22),
        (0.18, 0.45), (0.10, 0.42), (0.26, 0.08),
    ]]


# ---------------------------------------------------------------- detaljer/mönster

def stripes(color_hex, step=0.05, width=0.018):
    def fn(img, mask):
        layer = canvas()
        d = ImageDraw.Draw(layer)
        y = 0.14
        while y < 1:
            d.rectangle([0, y * H * SS, W * SS, (y + width) * H * SS], fill=hex_rgb(color_hex))
            y += step
        layer.putalpha(Image.composite(mask.split()[3], Image.new("L", mask.size, 0), mask.split()[3]))
        img.alpha_composite(layer)
    return fn


def florals(colors):
    def fn(img, mask):
        layer = canvas()
        d = ImageDraw.Draw(layer)
        rnd = random.Random(7)
        for _ in range(170):
            x, y = rnd.random() * W * SS, rnd.random() * H * SS
            r = (6 + rnd.random() * 10) * SS
            c = hex_rgb(rnd.choice(colors))
            for k in range(5):
                a = k / 5 * math.tau
                d.ellipse([x + math.cos(a) * r - r * 0.6, y + math.sin(a) * r - r * 0.6,
                           x + math.cos(a) * r + r * 0.6, y + math.sin(a) * r + r * 0.6], fill=c)
            d.ellipse([x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4], fill=(240, 220, 150, 255))
        a = mask.split()[3]
        la = layer.split()[3]
        layer.putalpha(Image.composite(la, Image.new("L", mask.size, 0), a))
        img.alpha_composite(layer)
    return fn


def quilting(img, mask):
    layer = canvas()
    d = ImageDraw.Draw(layer)
    for i in range(1, 12):
        y = (0.1 + i * 0.075) * H * SS
        d.line([(0, y), (W * SS, y)], fill=(0, 0, 0, 70), width=3 * SS)
    layer.putalpha(Image.composite(layer.split()[3], Image.new("L", mask.size, 0), mask.split()[3]))
    img.alpha_composite(layer)


def knit(img, mask):
    layer = canvas()
    d = ImageDraw.Draw(layer)
    for x in range(0, W * SS, 9 * SS):
        d.line([(x, 0), (x, H * SS)], fill=(0, 0, 0, 28), width=2 * SS)
    layer.putalpha(Image.composite(layer.split()[3], Image.new("L", mask.size, 0), mask.split()[3]))
    img.alpha_composite(layer)


def pleats(img, mask):
    layer = canvas()
    d = ImageDraw.Draw(layer)
    for i in range(14):
        t = i / 13
        x0 = (0.24 + t * 0.52) * W * SS
        x1 = (0.10 + t * 0.80) * W * SS
        d.line([(x0, 0.06 * H * SS), (x1, 0.62 * H * SS)], fill=(0, 0, 0, 55), width=3 * SS)
    layer.putalpha(Image.composite(layer.split()[3], Image.new("L", mask.size, 0), mask.split()[3]))
    img.alpha_composite(layer)


def jeans_details(d, base):
    line(d, [(0.15, 0.08), (0.85, 0.08)], base, 0.7)
    line(d, [(0.50, 0.08), (0.50, 0.28)], base, 0.65)
    line(d, [(0.20, 0.10), (0.30, 0.20), (0.40, 0.10)], base, 0.75, 2)
    line(d, [(0.60, 0.10), (0.70, 0.20), (0.80, 0.10)], base, 0.75, 2)
    for x in (0.25, 0.38, 0.62, 0.75):
        line(d, [(x, 0.02), (x, 0.08)], base, 0.6, 3)
    d.ellipse(P([(0.485, 0.035), (0.515, 0.06)]), fill=(185, 150, 90, 255))


def shirt_details(d, base):
    line(d, [(0.50, 0.13), (0.50, 0.92)], base, 0.78, 2)
    for i in range(6):
        y = 0.18 + i * 0.12
        d.ellipse(P([(0.488, y), (0.512, y + 0.016)]), fill=shade(base, 0.7))
    line(d, [(0.41, 0.07), (0.47, 0.16), (0.50, 0.13)], base, 0.7, 2)
    line(d, [(0.59, 0.07), (0.53, 0.16), (0.50, 0.13)], base, 0.7, 2)


def coat_details(belt=False, buttons=True, length=0.94):
    def fn(d, base):
        line(d, [(0.40, 0.06), (0.44, 0.30), (0.50, 0.40)], base, 0.7, 3)
        line(d, [(0.60, 0.06), (0.56, 0.30), (0.50, 0.40)], base, 0.7, 3)
        line(d, [(0.50, 0.40), (0.50, length - 0.01)], base, 0.72, 2)
        if buttons:
            for i in range(3):
                y = 0.44 + i * 0.12
                for x in (0.44, 0.56):
                    d.ellipse(P([(x - 0.012, y), (x + 0.012, y + 0.016)]), fill=shade(base, 0.55))
        if belt:
            d.rectangle(P([(0.23, 0.52), (0.77, 0.56)]), fill=shade(base, 0.85))
            line(d, [(0.23, 0.52), (0.77, 0.52)], base, 0.65, 2)
    return fn


def tee_details(d, base):
    line(d, [(0.40, 0.08), (0.46, 0.115), (0.54, 0.115), (0.60, 0.08)], base, 0.75, 4)


def dress_details(d, base):
    line(d, [(0.34, 0.36), (0.66, 0.36)], base, 0.75, 2)


# ---------------------------------------------------------------- accessoarer

def bag(base_hex, kind="shoulder"):
    base = hex_rgb(base_hex)
    img = canvas()
    d = ImageDraw.Draw(img)
    if kind == "shoulder":
        d.arc(P([(0.28, 0.12), (0.72, 0.72)]), 180, 360, fill=shade(base, 0.8), width=10 * SS)
        d.rounded_rectangle(P([(0.18, 0.42), (0.82, 0.80)]), radius=28 * SS, fill=base)
        d.rounded_rectangle(P([(0.18, 0.42), (0.82, 0.58)]), radius=28 * SS, fill=shade(base, 0.88))
        d.rectangle(P([(0.46, 0.55), (0.54, 0.60)]), fill=(200, 170, 110, 255))
    else:  # shopper
        d.arc(P([(0.30, 0.18), (0.50, 0.50)]), 180, 360, fill=shade(base, 0.75), width=9 * SS)
        d.arc(P([(0.50, 0.18), (0.70, 0.50)]), 180, 360, fill=shade(base, 0.75), width=9 * SS)
        d.polygon(P([(0.20, 0.34), (0.80, 0.34), (0.86, 0.86), (0.14, 0.86)]), fill=base)
        d.line(P([(0.20, 0.40), (0.80, 0.40)]), fill=shade(base, 0.8), width=3 * SS)
    return finish(img)


def shoes(base_hex, kind="loafer"):
    base = hex_rgb(base_hex)
    img = canvas()
    d = ImageDraw.Draw(img)
    for dx, dy, s in ((0.0, 0.0, 0.92), (0.06, 0.16, 1.0)):
        def T(pts):
            return [(0.5 + (x - 0.5) * s + dx - 0.03, 0.42 + (y - 0.5) * s + dy) for x, y in pts]
        if kind == "loafer":
            upper = [(0.10, 0.62), (0.12, 0.52), (0.30, 0.48), (0.55, 0.42), (0.75, 0.44), (0.90, 0.52), (0.92, 0.62)]
            d.polygon(P(T(upper)), fill=base)
            d.rectangle(P(T([(0.08, 0.61), (0.94, 0.66)])), fill=shade(base, 0.6))
            d.line(P(T([(0.55, 0.46), (0.75, 0.47)])), fill=(190, 160, 100, 255), width=4 * SS)
        else:
            upper = [(0.10, 0.62), (0.12, 0.45), (0.30, 0.38), (0.50, 0.40), (0.78, 0.46), (0.92, 0.54), (0.92, 0.62)]
            d.polygon(P(T(upper)), fill=base)
            d.rectangle(P(T([(0.08, 0.60), (0.94, 0.67)])), fill=(235, 235, 232, 255))
            for i in range(4):
                x = 0.34 + i * 0.07
                d.line(P(T([(x, 0.42), (x + 0.04, 0.50)])), fill=(150, 150, 150, 255), width=3 * SS)
    return finish(img)


# ---------------------------------------------------------------- produktbilder

def product_shot(cutout, bg="#f1ece4", variant=1):
    size = (900, 1200)
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    # mjuk golv/vägg-gradient
    for y in range(size[1]):
        t = y / size[1]
        f = 1.02 - 0.06 * t
        c = tuple(min(255, int(v * f)) for v in hex_rgb(bg)[:3])
        d.line([(0, y), (size[0], y)], fill=c)
    if variant == 1:
        g = cutout.resize((720, 960), Image.LANCZOS)
        shadow = Image.new("RGBA", g.size, (0, 0, 0, 0))
        shadow.putalpha(g.split()[3].point(lambda a: int(a * 0.22)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
        img.paste(shadow, (100, 135), shadow)
        img.paste(g, (90, 120), g)
    else:  # detaljbild: inzoomad
        g = cutout.resize((1500, 2000), Image.LANCZOS).crop((300, 300, 1200, 1500))
        img.paste(g, (0, 0), g)
    return img


# ---------------------------------------------------------------- produkter

SIZES_TOP = ["XS", "S", "M", "L", "XL"]
SIZES_JEANS = ["32", "34", "36", "38", "40", "42", "44"]
SIZES_SHOES = ["36", "37", "38", "39", "40", "41"]

# tryOnAnchors: normaliserade punkter i tryOn-bilden som ska matchas mot kroppen.
#   upper/full: "left"/"right" = axlar, "bottomY" = höftlinje (upper) eller knälinje (full)
#   lower:      "left"/"right" = höfter, "bottomY" = knälinje
A_UPPER = {"left": [0.30, 0.13], "right": [0.70, 0.13], "bottomY": 0.80}
A_COAT = {"left": [0.30, 0.12], "right": [0.70, 0.12], "bottomY": 0.62}
A_LOWER = {"left": [0.33, 0.14], "right": [0.67, 0.14], "bottomY": 0.56}
A_SKIRT = {"left": [0.33, 0.12], "right": [0.67, 0.12], "bottomY": 0.62}
A_DRESS = {"left": [0.36, 0.06], "right": [0.64, 0.06], "bottomY": 0.86}

PRODUCTS = [
    # --- toppar
    dict(id="gt-001", name="Basic t-shirt", price=149.95, category="tops", colors=["Vit", "Svart", "Gråmelerad"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_tee(), c, tee_details), anchors=A_UPPER),
    dict(id="gt-002", name="Satinblus", price=399.95, category="tops", colors=["Champagne", "Svart"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_shirt(), c, shirt_details), anchors=A_UPPER),
    dict(id="gt-003", name="Stickad tröja", price=349.95, category="tops", colors=["Beige", "Offwhite", "Brun"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_tee(True, 0.96), c, tee_details, knit), anchors=A_UPPER),
    dict(id="gt-004", name="Randig långärmad topp", price=199.95, category="tops", colors=["Offwhite", "Marinblå"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_tee(True), c, tee_details, stripes("#24304a")), anchors=A_UPPER),
    # --- denim
    dict(id="gt-005", name="Straight jeans", price=499.95, category="jeans", colors=["Mellanblå", "Svart"],
         sizes=SIZES_JEANS, art=lambda c: garment(shape_jeans("straight"), c, jeans_details), anchors=A_LOWER),
    dict(id="gt-006", name="Wide leg jeans", price=549.95, category="jeans", colors=["Ljus denim", "Mellanblå"],
         sizes=SIZES_JEANS, art=lambda c: garment(shape_jeans("wide"), c, jeans_details), anchors=A_LOWER),
    dict(id="gt-007", name="Bootcut jeans", price=499.95, category="jeans", colors=["Svart", "Mörkblå"],
         sizes=SIZES_JEANS, art=lambda c: garment(shape_jeans("boot"), c, jeans_details), anchors=A_LOWER),
    dict(id="gt-008", name="Mom jeans", price=449.95, category="jeans", colors=["Mörkblå", "Ljus denim"],
         sizes=SIZES_JEANS, art=lambda c: garment(shape_jeans("mom"), c, jeans_details), anchors=A_LOWER),
    dict(id="gt-009", name="Oversize jeansskjorta", price=449.95, category="jeans", colors=["Ljus denim"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_shirt(), c, shirt_details), anchors=A_UPPER, tryOnType="upper"),
    # --- klänningar & kjolar
    dict(id="gt-010", name="Midiklänning", price=499.95, category="dresses", colors=["Svart", "Smaragd"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_dress(), c, dress_details), anchors=A_DRESS),
    dict(id="gt-011", name="Satinklänning", price=599.95, category="dresses", colors=["Smaragd", "Champagne"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_dress(True, 0.12), c, dress_details), anchors=A_DRESS),
    dict(id="gt-012", name="Blommig maxiklänning", price=549.95, category="dresses", colors=["Offwhite", "Rosa"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_dress_sleeved(), c, None, florals(["#c46f6a", "#6f8a5d", "#e2a3a0"])),
         anchors={"left": [0.36, 0.06], "right": [0.64, 0.06], "bottomY": 0.80}),
    dict(id="gt-013", name="Plisserad kjol", price=399.95, category="skirts", colors=["Kamel", "Svart"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_skirt(), c, None, pleats), anchors=A_SKIRT),
    # --- ytterkläder
    dict(id="gt-014", name="Trenchcoat", price=899.95, category="outerwear", colors=["Beige", "Svart"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_coat(0.95), c, coat_details(belt=True)), anchors=A_COAT),
    dict(id="gt-015", name="Ullkappa", price=999.95, category="outerwear", colors=["Kamel", "Grå"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_coat(0.97), c, coat_details()), anchors=A_COAT),
    dict(id="gt-016", name="Pufferjacka", price=799.95, category="outerwear", colors=["Svart", "Oliv"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_coat(0.70, puffer=True), c, coat_details(buttons=False, length=0.70), quilting),
         anchors={"left": [0.30, 0.12], "right": [0.70, 0.12], "bottomY": 0.66}),
    dict(id="gt-017", name="Jeansjacka", price=599.95, category="outerwear", colors=["Mellanblå"],
         sizes=SIZES_TOP, art=lambda c: garment(shape_coat(0.66), c, coat_details(length=0.66)),
         anchors={"left": [0.30, 0.12], "right": [0.70, 0.12], "bottomY": 0.64}),
    # --- accessoarer
    dict(id="gt-018", name="Axelremsväska", price=299.95, category="bags", colors=["Svart", "Cognac"],
         sizes=["One size"], art=lambda c: bag(c, "shoulder")),
    dict(id="gt-019", name="Shopper i skinnimitation", price=349.95, category="bags", colors=["Cognac", "Svart"],
         sizes=["One size"], art=lambda c: bag(c, "shopper")),
    dict(id="gt-020", name="Loafers", price=449.95, category="shoes", colors=["Svart", "Brun"],
         sizes=SIZES_SHOES, art=lambda c: shoes(c, "loafer")),
]


def campaign_images(cutouts):
    os.makedirs(OUT_CAMPAIGN, exist_ok=True)
    specs = [
        ("Höstens nyheter", "Ny kollektion i butik", "#e9e1d5", ["gt-014", "gt-005"]),
        ("denim", "Hitta din favoritpassform", "#dfe6ee", ["gt-006", "gt-009"]),
        ("Klänningar", "För varje tillfälle", "#efe4e1", ["gt-011"]),
        ("Ytterkläder", "Varma lager för säsongen", "#e3e0d8", ["gt-015", "gt-003"]),
    ]
    for i, (title, sub, bg, ids) in enumerate(specs, 1):
        img = Image.new("RGB", (720, 1280), bg)
        d = ImageDraw.Draw(img)
        for y in range(1280):
            f = 1.03 - 0.10 * (y / 1280)
            d.line([(0, y), (720, y)], fill=tuple(min(255, int(v * f)) for v in hex_rgb(bg)[:3]))
        n = len(ids)
        for k, pid in enumerate(ids):
            g = cutouts[pid].resize((480, 640), Image.LANCZOS)
            x = 120 + (k - (n - 1) / 2) * 230
            img.paste(g, (int(x), 380 + k * 40), g)
        f1 = font(92 if len(title) < 10 else 70, "Light")
        f2 = font(30, "Regular")
        tw = d.textlength(title, font=f1)
        d.text(((720 - tw) / 2, 120), title, font=f1, fill=(25, 25, 25))
        sw = d.textlength(sub, font=f2)
        d.text(((720 - sw) / 2, 245), sub, font=f2, fill=(60, 60, 60))
        d.text((40, 1220), "PLATSHÅLLARBILD", font=font(18, "Medium"), fill=(120, 120, 120))
        img.save(os.path.join(OUT_CAMPAIGN, f"campaign-{i}.jpg"), quality=82)


def photo_images(cutouts):
    """Abstrakta 'modefoton' till ramarna på väggarna."""
    os.makedirs(OUT_PHOTOS, exist_ok=True)
    specs = [
        ((1200, 800), "#cdbba4", ["gt-014", "gt-010", "gt-002"]),
        ((1200, 800), "#a9b8c6", ["gt-006", "gt-004", "gt-008"]),
        ((800, 1200), "#d9c9c2", ["gt-011"]),
        ((800, 1200), "#b9b3a6", ["gt-015"]),
        ((1200, 800), "#e2d6c6", ["gt-012", "gt-003", "gt-013"]),
    ]
    for i, (size, bg, ids) in enumerate(specs, 1):
        img = Image.new("RGB", size, bg)
        d = ImageDraw.Draw(img)
        w, h = size
        for y in range(h):
            f = 1.08 - 0.22 * (y / h)
            d.line([(0, y), (w, y)], fill=tuple(min(255, int(v * f)) for v in hex_rgb(bg)[:3]))
        d.ellipse([w * 0.55, -h * 0.2, w * 1.2, h * 0.5], fill=tuple(min(255, int(v * 1.12)) for v in hex_rgb(bg)[:3]))
        img = img.filter(ImageFilter.GaussianBlur(30))
        n = len(ids)
        gh = int(h * 0.82)
        gw = int(gh * 0.75)
        for k, pid in enumerate(ids):
            g = cutouts[pid].resize((gw, gh), Image.LANCZOS)
            x = int(w / 2 - gw / 2 + (k - (n - 1) / 2) * gw * 0.78)
            img.paste(g, (x, int(h * 0.12)), g)
        img.save(os.path.join(OUT_PHOTOS, f"photo-{i}.jpg"), quality=80)


def main():
    os.makedirs(OUT_PRODUCTS, exist_ok=True)
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    out = []
    cutouts = {}
    for p in PRODUCTS:
        hexc = COLORS[p["colors"][0]]
        cut = p["art"](hexc)
        cutouts[p["id"]] = cut
        cut.save(os.path.join(OUT_PRODUCTS, f"{p['id']}-tryon.png"), optimize=True)
        product_shot(cut, variant=1).save(os.path.join(OUT_PRODUCTS, f"{p['id']}-1.webp"), quality=78)
        product_shot(cut, bg="#e8e4de", variant=2).save(os.path.join(OUT_PRODUCTS, f"{p['id']}-2.webp"), quality=78)
        entry = {
            "id": p["id"],
            "name": p["name"],
            "price": p["price"],
            "currency": "SEK",
            "category": p["category"],
            "colors": p["colors"],
            "sizes": p["sizes"],
            "images": [f"/assets/products/{p['id']}-1.webp", f"/assets/products/{p['id']}-2.webp"],
            "tryOnImage": f"/assets/products/{p['id']}-tryon.png",
            "productUrl": "https://www.ginatricot.com/se",
        }
        if "tryOnType" in p:
            entry["tryOnType"] = p["tryOnType"]
        if "anchors" in p:
            entry["tryOnAnchors"] = p["anchors"]
        out.append(entry)
    campaign_images(cutouts)
    photo_images(cutouts)
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Skrev {len(out)} produkter till {DATA}")


if __name__ == "__main__":
    main()
