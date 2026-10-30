"""데모용 '작품' 이미지와 영상을 코드로 그린다.

외부 이미지(실제 작가의 작품 사진)를 쓰지 않으므로 저작권 문제가 없고 저장소 용량도 늘지 않는다.
같은 이름으로 그리면 항상 같은 결과가 나오도록 난수 시드를 고정한다.
"""
import random
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

Color = tuple[int, int, int]


def _hex(value: str) -> Color:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _layer(base: Image.Image, color: str, draw_mask, blur: float, opacity: float) -> Image.Image:
    """마스크(모양)를 흐린 뒤 그 모양대로 단색을 덮는다. 가장자리가 붓 자국처럼 부드럽게 번진다."""
    mask = Image.new("L", base.size, 0)
    draw_mask(ImageDraw.Draw(mask))
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    if opacity < 1:
        mask = mask.point(lambda a: int(a * opacity))
    return Image.composite(Image.new("RGB", base.size, _hex(color)), base, mask)


def _finish(image: Image.Image, size: tuple[int, int], grain: float = 18) -> bytes:
    """작게 그린 그림을 원래 크기로 키우고 캔버스 질감(입자)을 더한다."""
    image = image.convert("RGB").resize(size, Image.Resampling.BICUBIC)
    noise = Image.effect_noise(size, grain).convert("RGB")
    textured = ImageChops.soft_light(image, noise)
    image = Image.blend(image, textured, 0.55)
    buffer = BytesIO()
    image.save(buffer, "PNG", compress_level=3)
    return buffer.getvalue()


def color_field(size: tuple[int, int], seed: str) -> bytes:
    """따뜻한 색면 회화: 가로 띠가 번지듯 겹친다 (아침의 빛)."""
    rng = random.Random(seed)
    w, h = size[0] // 3, size[1] // 3
    image = Image.new("RGB", (w, h), _hex("#efe6d2"))
    y = h * 0.08
    for color in ["#e9c46a", "#f4dfa6", "#f7efe0", "#e3a857", "#f2d79b"]:
        band_h = h * rng.uniform(0.14, 0.24)
        image = _layer(image, color, lambda d, t=y, bh=band_h: d.rectangle([w * 0.07, t, w * 0.93, t + bh], fill=255), blur=w * 0.02, opacity=0.92)
        y += band_h * rng.uniform(0.7, 0.9)
        if y > h * 0.86:
            break
    # 화면 위쪽에서 스며드는 빛
    image = _layer(image, "#fffaf0", lambda d: d.ellipse([w * 0.5, -h * 0.5, w * 1.3, h * 0.45], fill=255), blur=w * 0.12, opacity=0.6)
    return _finish(image, size)


def stacked_fields(size: tuple[int, int], seed: str) -> bytes:
    """세로 화면에 색층을 쌓는다 (겹쳐진 표면)."""
    rng = random.Random(seed)
    w, h = size[0] // 3, size[1] // 3
    image = Image.new("RGB", (w, h), _hex("#3f5a4a"))
    for color, top, bottom in [("#8ab17d", 0.06, 0.40), ("#d8cfb3", 0.45, 0.62), ("#c46d4f", 0.67, 0.94)]:
        box = [w * rng.uniform(0.07, 0.1), h * top, w * rng.uniform(0.9, 0.93), h * bottom]
        image = _layer(image, color, lambda d, b=box: d.rectangle(b, fill=255), blur=w * 0.03, opacity=0.95)
        # 같은 색 계열을 얇게 덧칠해 붓질의 얼룩을 만든다
        strokes = []
        for _ in range(14):
            x0 = rng.uniform(box[0], box[2] - w * 0.25)
            y0 = rng.uniform(box[1], box[3] - h * 0.04)
            strokes.append([x0, y0, min(box[2], x0 + w * rng.uniform(0.2, 0.6)), y0 + h * rng.uniform(0.01, 0.04)])
        tint = "#ffffff" if color != "#c46d4f" else "#8f3f2a"
        image = _layer(image, tint, lambda d, st=strokes: [d.rectangle(r, fill=255) for r in st], blur=w * 0.012, opacity=0.12)
    return _finish(image, size, grain=22)


def night_windows(size: tuple[int, int], seed: str) -> bytes:
    """어두운 건물 면에 불 켜진 창들이 번진다 (밤의 창)."""
    rng = random.Random(seed)
    w, h = size[0] // 3, size[1] // 3
    image = Image.new("RGB", (w, h), _hex("#121a28"))
    image = _layer(image, "#1e2a40", lambda d: d.rectangle([0, h * 0.6, w, h], fill=255), blur=h * 0.1, opacity=1)
    cols, rows = 9, 9
    cell_w, cell_h = w / (cols + 1), h / (rows + 1)
    groups: dict[str, list[list[float]]] = {}
    for r in range(rows):
        for c in range(cols):
            if rng.random() < 0.34:
                x, y = cell_w * (c + 0.75), cell_h * (r + 0.7)
                color = rng.choice(["#f2c56b", "#f6dfa1", "#e8a55a", "#f2c56b", "#c9d4e6"])
                groups.setdefault(color, []).append([x, y, x + cell_w * 0.5, y + cell_h * 0.6])
    for color, boxes in groups.items():
        image = _layer(image, color, lambda d, bs=boxes: [d.rectangle(b, fill=255) for b in bs], blur=w * 0.035, opacity=0.55)
        image = _layer(image, color, lambda d, bs=boxes: [d.rectangle(b, fill=255) for b in bs], blur=w * 0.004, opacity=0.95)
    return _finish(image, size, grain=26)


def pencil_study(size: tuple[int, int], seed: str) -> bytes:
    """종이 위의 연필 습작: 가는 곡선이 겹쳐 형태를 이룬다 (비공개 습작)."""
    rng = random.Random(seed)
    w, h = size
    image = Image.new("RGB", size, _hex("#f3efe6"))
    draw = ImageDraw.Draw(image)
    cx, cy = w * 0.5, h * 0.5
    for _ in range(220):
        rx = min(w, h) * rng.uniform(0.2, 0.36)
        ry = rx * rng.uniform(0.55, 0.85)
        ox, oy = rng.uniform(-0.05, 0.05) * w, rng.uniform(-0.04, 0.04) * h
        start = rng.uniform(0, 360)
        tone = rng.randint(70, 160)
        draw.arc([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], start, start + rng.uniform(30, 140),
                 fill=(tone, tone, tone - 4), width=rng.choice([1, 1, 2]))
    for _ in range(70):  # 그림자 빗금
        x = rng.uniform(w * 0.2, w * 0.8)
        y = rng.uniform(h * 0.8, h * 0.88)
        draw.line([x, y, x + w * 0.04, y - h * 0.025], fill=(160, 157, 150), width=1)
    image = image.filter(ImageFilter.GaussianBlur(0.5))
    return _finish(image, size, grain=10)


PAINTERS = {"color_field": color_field, "stacked_fields": stacked_fields, "night_windows": night_windows, "pencil_study": pencil_study}


def paint(style: str, size: tuple[int, int], seed: str) -> bytes:
    return PAINTERS[style](size, seed)


def light_video(size: tuple[int, int], seconds: int = 8) -> bytes | None:
    """천천히 움직이는 빛 그라디언트 영상과 낮은 배경음 (움직이는 빛). ffmpeg가 없으면 None."""
    if not shutil.which("ffmpeg"):
        return None
    w, h = size
    video = (
        f"gradients=s={w}x{h}:r=24:d={seconds}:speed=0.008:n=3:"
        "c0=0x1d2a3a:c1=0xe9c46a:c2=0xf4e3c1:x0=0:y0=0:x1={w}:y1={h}".replace("{w}", str(w)).replace("{h}", str(h))
    )
    with tempfile.TemporaryDirectory() as temp_dir:
        out = Path(temp_dir) / "light.mp4"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", video,
             "-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.05:d={seconds}",
             "-vf", f"noise=alls=8:allf=t,vignette=PI/5,fade=t=in:d=1,fade=t=out:st={seconds - 1}:d=1",
             "-af", f"lowpass=f=600,afade=t=in:d=1,afade=t=out:st={seconds - 1}:d=1",
             "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
            check=True, timeout=180,
        )
        return out.read_bytes()
