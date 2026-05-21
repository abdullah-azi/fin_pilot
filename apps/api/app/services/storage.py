from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse

from app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class StoredFile:
    key: str
    public_url: str


class StorageBackend:
    is_local: bool = False

    def save_bytes(self, *, key: str, content_type: str, data: bytes) -> StoredFile:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def ensure_ready(self) -> None:
        return None

    def extract_key_from_url(self, public_url: str | None) -> str | None:
        return None

    def local_mount_directory(self) -> Path | None:
        return None


class LocalStorageBackend(StorageBackend):
    is_local = True

    def __init__(self, *, root: Path, public_base_url: str) -> None:
        self.root = root
        self.public_base_url = public_base_url.rstrip("/") or "/uploads"

    def ensure_ready(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, *, key: str, content_type: str, data: bytes) -> StoredFile:
        del content_type
        safe_key = _normalize_key(key)
        file_path = self.root / Path(*PurePosixPath(safe_key).parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(data)
        return StoredFile(key=safe_key, public_url=f"{self.public_base_url}/{safe_key}")

    def delete(self, key: str) -> None:
        safe_key = _normalize_key(key)
        file_path = self.root / Path(*PurePosixPath(safe_key).parts)
        if file_path.exists():
            file_path.unlink()

    def extract_key_from_url(self, public_url: str | None) -> str | None:
        if not public_url:
            return None
        if public_url.startswith(f"{self.public_base_url}/"):
            return public_url.removeprefix(f"{self.public_base_url}/")
        return None

    def local_mount_directory(self) -> Path | None:
        return self.root


class S3StorageBackend(StorageBackend):
    def __init__(
        self,
        *,
        bucket_name: str,
        region: str,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        public_base_url: str,
        force_path_style: bool,
    ) -> None:
        if not bucket_name:
            raise RuntimeError("S3 storage requires S3_BUCKET_NAME.")
        if not access_key_id or not secret_access_key:
            raise RuntimeError(
                "S3 storage requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
            )

        self.bucket_name = bucket_name
        self.region = region
        self.endpoint_url = endpoint_url or None
        self.public_base_url = public_base_url
        self.force_path_style = force_path_style
        import boto3

        self._client: Any = boto3.client(
            "s3",
            region_name=region or None,
            endpoint_url=self.endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=boto3.session.Config(
                s3={"addressing_style": "path" if force_path_style else "auto"}
            ),
        )

    def save_bytes(self, *, key: str, content_type: str, data: bytes) -> StoredFile:
        safe_key = _normalize_key(key)
        self._client.put_object(
            Bucket=self.bucket_name,
            Key=safe_key,
            Body=data,
            ContentType=content_type,
        )
        return StoredFile(key=safe_key, public_url=self._public_url_for_key(safe_key))

    def delete(self, key: str) -> None:
        safe_key = _normalize_key(key)
        self._client.delete_object(Bucket=self.bucket_name, Key=safe_key)

    def extract_key_from_url(self, public_url: str | None) -> str | None:
        if not public_url:
            return None
        if self.public_base_url and public_url.startswith(f"{self.public_base_url}/"):
            return public_url.removeprefix(f"{self.public_base_url}/")

        parsed = urlparse(public_url)
        path = parsed.path.lstrip("/")
        if not path:
            return None
        if path.startswith(f"{self.bucket_name}/"):
            return path.removeprefix(f"{self.bucket_name}/")
        return path

    def _public_url_for_key(self, key: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket_name}/{key}"
        if self.region:
            return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"
        return f"https://{self.bucket_name}.s3.amazonaws.com/{key}"


def get_storage_backend() -> StorageBackend:
    return _build_storage_backend()


def get_local_storage_root() -> Path:
    root = Path(settings.local_storage_root)
    if not root.is_absolute():
        root = PROJECT_ROOT / root
    return root


@lru_cache
def _build_storage_backend() -> StorageBackend:
    if settings.storage_backend == "local":
        return LocalStorageBackend(
            root=get_local_storage_root(),
            public_base_url=settings.local_storage_public_base_url or "/uploads",
        )

    if settings.storage_backend == "s3":
        return S3StorageBackend(
            bucket_name=settings.s3_bucket_name,
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            public_base_url=settings.s3_public_base_url,
            force_path_style=settings.s3_force_path_style,
        )

    raise RuntimeError(
        f"Unsupported storage backend {settings.storage_backend!r}. "
        "Use 'local' or 's3'."
    )


def resolve_storage_key(
    storage: StorageBackend,
    *,
    stored_key: str | None,
    public_url: str | None,
) -> str | None:
    if stored_key:
        return stored_key
    return storage.extract_key_from_url(public_url)


def ensure_storage_ready() -> None:
    storage = get_storage_backend()
    try:
        storage.ensure_ready()
    except Exception as exc:  # pragma: no cover - startup/runtime guard
        raise RuntimeError(f"Storage backend is not ready: {exc}") from exc


def _normalize_key(key: str) -> str:
    normalized = PurePosixPath(key).as_posix().strip("/")
    if not normalized or normalized.startswith(".."):
        raise ValueError("Invalid storage key.")
    return normalized
