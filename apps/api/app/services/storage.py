from __future__ import annotations
import os
from abc import ABC, abstractmethod
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO
import boto3


class Storage(ABC):
    @abstractmethod
    def put(self, key: str, source: BinaryIO) -> int: ...

    @abstractmethod
    def open(self, key: str, start: int | None = None, end: int | None = None) -> Iterator[bytes]: ...

    @abstractmethod
    def stat(self, key: str) -> dict[str, int | str]: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...


class LocalStorage(Storage):
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if key.startswith("/") or ".." in Path(key).parts:
            raise ValueError("unsafe storage key")
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("storage key escaped root")
        return path

    def put(self, key: str, source: BinaryIO) -> int:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        total = 0
        fd = os.open(path, flags, 0o600)
        try:
            with os.fdopen(fd, "wb") as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
                    total += len(chunk)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return total

    def open(self, key: str, start: int | None = None, end: int | None = None) -> Iterator[bytes]:
        with self._path(key).open("rb") as source:
            if start is not None:
                source.seek(start)
            remaining = None if end is None else end - (start or 0) + 1
            while remaining is None or remaining > 0:
                chunk = source.read(min(1024 * 1024, remaining) if remaining else 1024 * 1024)
                if not chunk:
                    break
                yield chunk
                if remaining is not None:
                    remaining -= len(chunk)

    def stat(self, key: str) -> dict[str, int | str]:
        result = self._path(key).stat()
        return {"size": result.st_size, "key": key}

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class S3CompatibleStorage(Storage):
    def __init__(self, bucket: str, endpoint_url: str | None = None, region: str = "auto"):
        self.bucket = bucket
        self.client = boto3.client("s3", endpoint_url=endpoint_url, region_name=region)

    def put(self, key: str, source: BinaryIO) -> int:
        self.client.upload_fileobj(source, self.bucket, key)
        return int(self.stat(key)["size"])

    def open(self, key: str, start: int | None = None, end: int | None = None) -> Iterator[bytes]:
        kwargs = {"Bucket": self.bucket, "Key": key}
        if start is not None or end is not None:
            kwargs["Range"] = f"bytes={start or 0}-{'' if end is None else end}"
        body = self.client.get_object(**kwargs)["Body"]
        while chunk := body.read(1024 * 1024):
            yield chunk

    def stat(self, key: str) -> dict[str, int | str]:
        result = self.client.head_object(Bucket=self.bucket, Key=key)
        return {"size": result["ContentLength"], "key": key}

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

