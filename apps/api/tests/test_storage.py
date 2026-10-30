from io import BytesIO
import pytest
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

