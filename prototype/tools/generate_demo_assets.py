from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def canvas(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    a = tuple(int(top[i : i + 2], 16) for i in (1, 3, 5))
    b = tuple(int(bottom[i : i + 2], 16) for i in (1, 3, 5))
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(round(a[c] * (1 - t) + b[c] * t) for c in range(3))
        draw.line((0, y, width, y), fill=color)
    return image


def add_grain(image: Image.Image, amount: int = 12) -> Image.Image:
    random.seed(17)
    noise = Image.new("L", image.size)
    pixels = noise.load()
    for y in range(image.height):
        for x in range(image.width):
            pixels[x, y] = 128 + random.randint(-amount, amount)
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(image, noise_rgb, 0.06)


def save(image: Image.Image, name: str) -> None:
    add_grain(image).save(OUT / name, quality=90, optimize=True)


def portrait() -> None:
    image = canvas((720, 980), "#bcd7e4", "#edf4f5")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((175, 120, 545, 490), fill=(48, 34, 33, 255))
    draw.ellipse((225, 170, 495, 515), fill=(225, 180, 151, 255))
    draw.polygon([(205, 300), (250, 90), (360, 170), (480, 80), (520, 330)], fill=(36, 30, 30, 255))
    draw.ellipse((278, 320, 320, 340), fill=(50, 45, 45, 220))
    draw.ellipse((400, 320, 442, 340), fill=(50, 45, 45, 220))
    draw.arc((315, 360, 405, 440), 15, 165, fill=(132, 69, 70, 230), width=5)
    draw.rounded_rectangle((105, 475, 615, 980), 170, fill=(98, 145, 166, 255))
    draw.polygon([(230, 500), (360, 760), (490, 500)], fill=(238, 236, 229, 255))
    save(image, "portrait-editorial.jpg")


def anime() -> None:
    image = canvas((720, 900), "#160f35", "#521f62")
    draw = ImageDraw.Draw(image, "RGBA")
    for i in range(22):
        x = 20 + i * 39
        draw.line((x, 0, x - 260, 900), fill=(255, 61, 155, 65), width=11)
    draw.ellipse((180, 120, 540, 500), fill=(247, 228, 216, 255))
    draw.polygon([(150, 260), (220, 75), (350, 155), (500, 65), (565, 270), (480, 225), (420, 330), (330, 210), (240, 315)], fill=(225, 239, 249, 255))
    draw.polygon([(320, 275), (355, 320), (270, 315)], fill=(43, 60, 96, 255))
    draw.polygon([(420, 275), (455, 315), (375, 315)], fill=(43, 60, 96, 255))
    draw.rounded_rectangle((110, 465, 610, 900), 110, fill=(32, 46, 76, 255))
    draw.polygon([(145, 545), (300, 465), (360, 660), (445, 470), (595, 565), (540, 900), (180, 900)], fill=(238, 243, 247, 255))
    draw.line((260, 530, 470, 770), fill=(32, 213, 219, 255), width=22)
    draw.line((445, 515, 275, 780), fill=(242, 80, 166, 255), width=18)
    save(image, "anime-neon.jpg")


def coast() -> None:
    image = canvas((900, 1120), "#91cfe8", "#f4ebd9")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.polygon([(0, 680), (180, 590), (350, 650), (520, 535), (720, 640), (900, 560), (900, 1120), (0, 1120)], fill=(43, 157, 176, 255))
    for r in range(9):
        y = 710 + r * 44
        draw.arc((40, y, 860, y + 110), 195, 345, fill=(231, 250, 244, 180), width=8)
    draw.polygon([(200, 670), (315, 325), (650, 300), (780, 700)], fill=(238, 232, 208, 255))
    draw.rounded_rectangle((340, 250, 680, 560), 18, fill=(250, 249, 237, 255))
    draw.rectangle((390, 335, 470, 445), fill=(59, 133, 164, 255))
    draw.rectangle((550, 335, 630, 445), fill=(59, 133, 164, 255))
    draw.ellipse((220, 120, 440, 390), fill=(64, 111, 76, 255))
    draw.ellipse((610, 125, 850, 415), fill=(73, 124, 78, 255))
    for x, y in [(295, 510), (340, 560), (655, 550), (710, 600)]:
        draw.ellipse((x - 35, y - 60, x + 35, y + 10), fill=(229, 106, 147, 220))
    save(image, "coastal-house.jpg")


def rabbit() -> None:
    image = canvas((760, 980), "#9fc8d8", "#edf3ef")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((190, 360, 590, 860), fill=(240, 240, 231, 255))
    draw.ellipse((205, 200, 555, 570), fill=(246, 246, 238, 255))
    draw.ellipse((235, 15, 350, 325), fill=(246, 246, 238, 255))
    draw.ellipse((415, 15, 530, 325), fill=(246, 246, 238, 255))
    draw.ellipse((260, 60, 320, 275), fill=(224, 173, 179, 190))
    draw.ellipse((445, 60, 505, 275), fill=(224, 173, 179, 190))
    draw.ellipse((285, 335, 330, 380), fill=(50, 65, 73, 255))
    draw.ellipse((430, 335, 475, 380), fill=(50, 65, 73, 255))
    draw.polygon([(365, 400), (400, 400), (383, 425)], fill=(195, 113, 122, 255))
    draw.arc((335, 410, 385, 465), 0, 120, fill=(75, 75, 72, 220), width=4)
    draw.arc((382, 410, 432, 465), 60, 180, fill=(75, 75, 72, 220), width=4)
    draw.ellipse((120, 650, 305, 895), fill=(245, 245, 236, 255))
    draw.ellipse((470, 650, 655, 895), fill=(245, 245, 236, 255))
    save(image, "rabbit-studio.jpg")


def celestial() -> None:
    image = canvas((980, 660), "#0d1831", "#44285a")
    draw = ImageDraw.Draw(image, "RGBA")
    random.seed(7)
    for _ in range(210):
        x = random.randrange(980)
        y = random.randrange(660)
        r = random.choice([1, 1, 1, 2, 3])
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(240, 244, 255, random.randrange(80, 230)))
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer, "RGBA")
    for i in range(22):
        y = 150 + i * 13
        points = []
        for x in range(-20, 1020, 18):
            points.append((x, y + math.sin(x / 80 + i / 3) * 55))
        ld.line(points, fill=(57 + i * 5, 165, 230, 32), width=18)
    layer = layer.filter(ImageFilter.GaussianBlur(14))
    image = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((650, 80, 890, 320), fill=(243, 187, 105, 225))
    draw.ellipse((700, 60, 920, 280), fill=(38, 29, 61, 255))
    save(image, "celestial-river.jpg")


def fashion() -> None:
    image = canvas((760, 1080), "#31131a", "#090a0d")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((205, 85, 555, 500), fill=(56, 18, 25, 255))
    draw.ellipse((250, 160, 510, 500), fill=(218, 178, 151, 255))
    draw.polygon([(160, 290), (255, 45), (380, 110), (530, 35), (600, 325), (500, 250), (430, 330), (330, 210), (240, 345)], fill=(73, 18, 25, 255))
    draw.ellipse((303, 320, 345, 338), fill=(40, 35, 35, 230))
    draw.ellipse((410, 320, 452, 338), fill=(40, 35, 35, 230))
    draw.polygon([(130, 500), (630, 500), (720, 1080), (40, 1080)], fill=(105, 16, 27, 255))
    for y in range(560, 1030, 75):
        draw.arc((90, y, 670, y + 180), 200, 340, fill=(217, 177, 96, 150), width=8)
    draw.polygon([(290, 490), (380, 760), (475, 490)], fill=(42, 34, 35, 255))
    save(image, "crimson-fashion.jpg")


def ceramics() -> None:
    image = canvas((980, 720), "#d2ddd8", "#b5c4c0")
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 500, 980, 720), fill=(125, 104, 86, 255))
    draw.ellipse((150, 430, 830, 610), fill=(64, 57, 52, 60))
    draw.ellipse((180, 215, 450, 570), fill=(218, 201, 171, 255))
    draw.ellipse((180, 180, 450, 285), fill=(236, 222, 193, 255))
    draw.ellipse((250, 200, 380, 250), fill=(134, 114, 91, 255))
    draw.rounded_rectangle((520, 260, 770, 565), 70, fill=(62, 92, 94, 255))
    draw.ellipse((520, 225, 770, 330), fill=(83, 119, 119, 255))
    draw.ellipse((600, 250, 690, 295), fill=(35, 63, 65, 255))
    draw.line((495, 80, 530, 410), fill=(50, 69, 55, 255), width=12)
    for x, y, c in [(470, 90, (220, 172, 118, 255)), (555, 125, (187, 92, 93, 255)), (505, 180, (239, 218, 162, 255))]:
        draw.ellipse((x - 70, y - 45, x + 70, y + 45), fill=c)
    save(image, "ceramic-still-life.jpg")


def misty_forest() -> None:
    image = canvas((820, 1060), "#93b1ad", "#d9ddd4")
    draw = ImageDraw.Draw(image, "RGBA")
    random.seed(12)
    for depth in range(5):
        alpha = 70 + depth * 30
        base = 870 - depth * 115
        color = (32, 68, 58, alpha)
        for x in range(-60, 880, 120 - depth * 8):
            h = 280 + random.randrange(260)
            draw.polygon([(x, base), (x + 55, base - h), (x + 110, base)], fill=color)
    draw.polygon([(0, 790), (180, 700), (330, 755), (520, 640), (820, 735), (820, 1060), (0, 1060)], fill=(47, 82, 68, 220))
    draw.polygon([(0, 930), (250, 850), (420, 910), (660, 820), (820, 865), (820, 1060), (0, 1060)], fill=(32, 58, 49, 240))
    draw.line((355, 1060, 430, 705, 500, 1060), fill=(202, 206, 186, 170), width=22)
    save(image, "misty-forest.jpg")


if __name__ == "__main__":
    portrait()
    anime()
    coast()
    rabbit()
    celestial()
    fashion()
    ceramics()
    misty_forest()
    print(f"Generated demo assets in {OUT}")
