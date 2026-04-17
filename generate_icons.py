from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

BG = (201, 100, 66, 255)
FG = (255, 245, 238, 255)


def render(size: int, path: str) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = size * 0.22
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=BG)

    cx, cy = size / 2, size / 2
    track_w = max(2, int(size * 0.08))
    pad = size * 0.18
    bbox = [pad, pad, size - pad, size - pad]

    track_color = (255, 245, 238, 70)
    d.arc(bbox, start=135, end=405, fill=track_color, width=track_w)
    d.arc(bbox, start=135, end=135 + int(270 * 0.62), fill=FG, width=track_w)

    if size >= 32:
        try:
            font_size = int(size * 0.34)
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size
            )
        except Exception:
            font = ImageFont.load_default()
        text = "C"
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), text, fill=FG, font=font)
    else:
        dot = max(2, int(size * 0.18))
        d.ellipse(
            [(cx - dot / 2, cy - dot / 2), (cx + dot / 2, cy + dot / 2)], fill=FG
        )

    img.save(path, "PNG", optimize=True)


for s in (16, 48, 128):
    render(s, os.path.join(OUT_DIR, f"icon{s}.png"))

print("ok")
