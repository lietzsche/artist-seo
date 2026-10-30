from io import BytesIO
import pytest
from PIL import Image
from app.core.config import settings
from app.models import MediaAsset
from app.services.media_processor import process_image
from app.services.storage import LocalStorage


def test_local_storage_stream_round_trip(tmp_path):
    storage = LocalStorage(tmp_path)
    content = b"original-bytes" * 1000
    assert storage.put("originals/a.bin", BytesIO(content)) == len(content)
    assert b"".join(storage.open("originals/a.bin")) == content
    assert storage.stat("originals/a.bin")["size"] == len(content)
    assert b"".join(storage.open("originals/a.bin", 10, 29)) == content[10:30]


def test_local_storage_rejects_traversal(tmp_path):
    storage = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        storage.put("../escape", BytesIO(b"bad"))


def test_image_processor_creates_web_derivatives_without_upscale(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    originals = LocalStorage(tmp_path / "originals")
    source = BytesIO()
    Image.new("RGB", (320, 200), (10, 20, 30)).save(source, format="PNG")
    source.seek(0)
    originals.put("artwork/original.png", source)
    media = MediaAsset(id="media-id", artwork_id="artwork-id", original_key="artwork/original.png", original_filename="original.png", media_type="image", content_type="image/png", byte_size=source.getbuffer().nbytes, sha256="0" * 64)
    key = process_image(media)
    assert key == "media-id/320.webp"
    with Image.open(tmp_path / "public" / key) as output:
        assert output.size == (320, 200)
        assert "exif" not in output.info
    assert (tmp_path / "public" / "media-id" / "320.jpg").is_file()
    assert not (tmp_path / "public" / "media-id" / "800.webp").exists()

