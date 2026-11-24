"""Генерирует PNG-иконки PWA из того же рисунка, что и icon.svg.

Запуск: python tools/make_icons.py   (нужен Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (197, 207, 156)
DARK = (38, 48, 26)
# координаты блоков в сетке 64x64 (как в icon.svg)
BLOCKS = [(8, 40), (22, 40), (36, 40), (22, 26), (36, 10)]
OUT = Path(__file__).resolve().parent.parent / "icons"


def render(size, content_scale=1.0, rounded=True):
    ss = 4  # суперсэмплинг для сглаживания
    S = size * ss
    k = S / 64
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=10 * k, fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)

    def box(x, y, w, color):
        # масштабирование содержимого относительно центра (для maskable)
        cx = 32 + (x - 32) * content_scale
        cy = 32 + (y - 32) * content_scale
        ww = w * content_scale
        d.rectangle([cx * k, cy * k, (cx + ww) * k - 1, (cy + ww) * k - 1], fill=color)

    for x, y in BLOCKS:
        box(x, y, 14, DARK)
        box(x + 2.5, y + 2.5, 9, BG)
        box(x + 4, y + 4, 6, DARK)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    render(192).save(OUT / "icon-192.png")
    render(512).save(OUT / "icon-512.png")
    # maskable: фон на весь квадрат, рисунок внутри безопасной зоны
    render(512, content_scale=0.68, rounded=False).save(OUT / "icon-maskable-512.png")
    # iOS сам скругляет углы, прозрачность там не нужна
    render(180, content_scale=0.85, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("ok:", ", ".join(p.name for p in sorted(OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
