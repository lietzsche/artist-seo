# theme.jpg(그림만 남긴 판)에서 사이트 아이콘을 만든다. Pillow가 필요해 API 이미지로 실행한다:
#   docker run --rm -v "$PWD":/repo -w /repo artist-portfolio-api python apps/web/scripts/make-icons.py theme.jpg apps/web/public
# 만든 icon-512/192.png는 public/icons/ 로 옮긴다.
import sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

src, out = sys.argv[1], sys.argv[2]
art = Image.open(src).convert("RGB")
BG, BONE = (11, 10, 8), (227, 218, 203)

def tone(img, contrast, bright):
    return ImageEnhance.Brightness(ImageEnhance.Contrast(img).enhance(contrast)).enhance(bright)

def big(size=512):
    S = size * 4  # 크게 그린 뒤 줄여 테두리를 매끄럽게
    canvas = Image.new("RGB", (S, S), BG)
    r = int(S * 0.392)
    head = tone(art.crop((90, 60, 870, 840)), 1.25, 1.08).resize((2 * r, 2 * r), Image.LANCZOS)
    mask = Image.new("L", (2 * r, 2 * r), 0); ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
    c = S // 2
    canvas.paste(head, (c - r, c - r), mask.filter(ImageFilter.GaussianBlur(S * 0.002)))
    d = ImageDraw.Draw(canvas, "RGBA")
    ring = int(S * 0.418); w = max(2, S // 170)
    d.ellipse((c - ring, c - ring, c + ring, c + ring), outline=BONE + (150,), width=w)
    t = int(S * 0.035)  # 고리 바깥 네 방향 맞춤 표시
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        x0, y0 = c + dx * (ring + S * 0.012), c + dy * (ring + S * 0.012)
        d.line((x0, y0, x0 + dx * t, y0 + dy * t), fill=BONE + (150,), width=w)
    return canvas.resize((size, size), Image.LANCZOS)

def small(size):
    S = 256
    img = tone(art.crop((200, 70, 800, 670)), 1.6, 1.15).resize((S, S), Image.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
    mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=S // 5, fill=255)
    out_img = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out_img.paste(img, (0, 0), mask)
    return out_img.resize((size, size), Image.LANCZOS)

big(512).save(f"{out}/icon-512.png", optimize=True)
big(192).save(f"{out}/icon-192.png", optimize=True)
big(180).save(f"{out}/apple-touch-icon.png", optimize=True)
small(32).save(f"{out}/favicon-32.png", optimize=True)
small(48).save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


