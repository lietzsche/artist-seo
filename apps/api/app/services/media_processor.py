from io import BytesIO
from pathlib import Path
from PIL import Image, ImageCms, ImageOps
from app.core.config import settings
from app.models import MediaAsset
from app.services.storage import LocalStorage

IMAGE_WIDTHS = (800, 1600, 2400)


def _srgb(image: Image.Image) -> Image.Image:
    icc = image.info.get("icc_profile")
    if icc:
        try:
            source_profile = ImageCms.ImageCmsProfile(BytesIO(icc))
            target_profile = ImageCms.createProfile("sRGB")
            mode = "RGBA" if "A" in image.getbands() else "RGB"
            image = ImageCms.profileToProfile(image, source_profile, target_profile, outputMode=mode)
        except (ImageCms.PyCMSError, OSError, ValueError) as exc:
            raise ValueError("내장 ICC 프로필을 sRGB로 변환하지 못했습니다") from exc
    elif image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    return image


def _jpeg_ready(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        return background
    return image.convert("RGB")


def process_image(media: MediaAsset) -> str:
    originals = LocalStorage(settings.storage_root / "originals")
    public = LocalStorage(settings.storage_root / "public")
    original_path = originals._path(media.original_key)
    primary_key = ""
    with Image.open(original_path) as source:
        source.load()
        base = _srgb(ImageOps.exif_transpose(source))
        for requested_width in IMAGE_WIDTHS:
            width = min(requested_width, base.width)
            height = max(1, round(base.height * width / base.width))
            resized = base.copy() if width == base.width else base.resize((width, height), Image.Resampling.LANCZOS)
            for extension, image_format, options in (
                ("jpg", "JPEG", {"quality": 88, "optimize": True, "progressive": True}),
                ("webp", "WEBP", {"quality": 85, "method": 4}),
            ):
                key = f"{media.id}/{width}.{extension}"
                try:
                    public.stat(key)
                except FileNotFoundError:
                    output = BytesIO()
                    target = _jpeg_ready(resized) if image_format == "JPEG" else resized
                    target.save(output, format=image_format, **options)
                    output.seek(0)
                    public.put(key, output)
                if extension == "webp" and (not primary_key or width <= 1600):
                    primary_key = key
            if width == base.width:
                break
    if not primary_key:
        raise RuntimeError("공개 이미지 파생본을 만들지 못했습니다")
    return primary_key
