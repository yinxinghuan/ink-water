from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_production" / "poster-source.webp"
OUTPUT = ROOT / "public" / "poster.png"
THUMB = ROOT / "_production" / "poster-thumb.png"

image = (
    Image.open(SOURCE)
    .convert("RGB")
    .crop((36, 36, 988, 988))
    .resize((1024, 1024), Image.Resampling.LANCZOS)
)

veil = Image.new("RGBA", image.size, (0, 0, 0, 0))
pixels = veil.load()
for y in range(320):
    alpha = round(184 * (1 - y / 320) ** 1.55)
    for x in range(1024):
        pixels[x, y] = (6, 8, 12, alpha)
image = Image.alpha_composite(image.convert("RGBA"), veil)

draw = ImageDraw.Draw(image)
title = ImageFont.truetype(
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    78,
)
small = ImageFont.truetype(
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    15,
)
draw.text(
    (56, 42),
    "ALTERU / FLUID STUDY 11",
    font=small,
    fill=(195, 237, 240, 190),
)
draw.multiline_text(
    (51, 68),
    "INK /\nWATER",
    font=title,
    fill=(242, 238, 229, 255),
    spacing=-18,
)

rgb = image.convert("RGB")
rgb.quantize(
    colors=256,
    method=Image.Quantize.MEDIANCUT,
    dither=Image.Dither.FLOYDSTEINBERG,
).save(OUTPUT, "PNG", optimize=True)
rgb.resize((160, 160), Image.Resampling.LANCZOS).save(
    THUMB,
    "PNG",
    optimize=True,
)

