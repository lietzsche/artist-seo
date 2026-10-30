from io import BytesIO
import json
import os
import resource
import signal
import subprocess
import tempfile
import time
from collections.abc import Callable
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
    public = LocalStorage(settings.storage_root / "public", public=True)
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


def _limit_process() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (3600, 3600))
    resource.setrlimit(resource.RLIMIT_AS, (4 * 1024**3, 4 * 1024**3))
    os.nice(10)


def _stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def _run_ffmpeg(arguments: list[str], timeout: int = 3700, heartbeat: Callable[[], None] | None = None) -> None:
    process: subprocess.Popen[str] | None = None
    try:
        process = subprocess.Popen(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", *arguments],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=_limit_process,
            start_new_session=True,
        )
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _stop_process(process)
                raise RuntimeError("영상 변환 시간이 제한을 초과했습니다")
            try:
                _, stderr = process.communicate(timeout=min(30, remaining))
                break
            except subprocess.TimeoutExpired:
                if heartbeat:
                    heartbeat()
        if process.returncode:
            raise RuntimeError((stderr or "영상 변환에 실패했습니다")[-1800:])
    except BaseException:
        if process:
            _stop_process(process)
        raise


def process_video(media: MediaAsset, heartbeat: Callable[[], None] | None = None) -> tuple[str, str, bool]:
    originals = LocalStorage(settings.storage_root / "originals")
    public = LocalStorage(settings.storage_root / "public", public=True)
    original_path = originals._path(media.original_key)
    video_key = f"{media.id}/playback.mp4"
    poster_key = f"{media.id}/poster.jpg"
    converted_hdr = bool(media.source_is_hdr)
    (settings.storage_root / "tmp").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=settings.storage_root / "tmp") as temp_dir:
        playback = Path(temp_dir) / "playback.mp4"
        poster = Path(temp_dir) / "poster.jpg"
        if media.source_is_hdr:
            video_filter = "zscale=t=linear:npl=100,format=gbrpf32le,tonemap=mobius:param=0.3:desat=0,zscale=p=bt709:t=bt709:m=bt709:r=tv,scale=w=if(gt(iw\\,1920)\\,1920\\,iw):h=-2,format=yuv420p"
        else:
            video_filter = "scale=w=if(gt(iw\\,1920)\\,1920\\,iw):h=-2,format=yuv420p"
        try:
            public.stat(video_key)
        except FileNotFoundError:
            _run_ffmpeg([
                "-i", str(original_path), "-map", "0:v:0", "-map", "0:a:0?", "-vf", video_filter,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "5M", "-bufsize", "10M",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-metadata", "comment=", "-map_metadata", "-1", str(playback),
            ], heartbeat=heartbeat)
            with playback.open("rb") as source:
                public.put(video_key, source)
        if media.source_is_hdr:
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0", "-show_entries", "stream=color_transfer,color_primaries,color_space", "-of", "json", str(public._path(video_key))],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            stream = (json.loads(probe.stdout).get("streams") or [{}])[0]
            if stream.get("color_transfer") != "bt709" or stream.get("color_primaries") != "bt709":
                public.delete(video_key)
                raise RuntimeError("HDR→SDR 출력의 BT.709 색상 태그를 검증하지 못했습니다. 수동 SDR 사본이 필요합니다")
        try:
            public.stat(poster_key)
        except FileNotFoundError:
            poster_source = public._path(video_key)
            seek_seconds = min(1.0, max(0.0, (media.duration_ms or 0) / 10000))
            _run_ffmpeg(["-ss", f"{seek_seconds:.3f}", "-i", str(poster_source), "-frames:v", "1", "-vf", "scale=w=if(gt(iw\\,1600)\\,1600\\,iw):h=-2", "-q:v", "2", "-map_metadata", "-1", str(poster)], timeout=120, heartbeat=heartbeat)
            with poster.open("rb") as source:
                public.put(poster_key, source)
    return video_key, poster_key, converted_hdr
