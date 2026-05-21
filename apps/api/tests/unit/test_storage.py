from pathlib import Path

from app.services.storage import LocalStorageBackend


def test_local_storage_backend_saves_and_resolves_public_url(tmp_path: Path) -> None:
    backend = LocalStorageBackend(root=tmp_path, public_base_url="/uploads")

    stored = backend.save_bytes(
        key="profile-images/test-avatar.png",
        content_type="image/png",
        data=b"fakepng",
    )

    assert stored.key == "profile-images/test-avatar.png"
    assert stored.public_url == "/uploads/profile-images/test-avatar.png"
    assert (tmp_path / "profile-images" / "test-avatar.png").read_bytes() == b"fakepng"
    assert backend.extract_key_from_url(stored.public_url) == stored.key


def test_local_storage_backend_delete_removes_file(tmp_path: Path) -> None:
    backend = LocalStorageBackend(root=tmp_path, public_base_url="/uploads")
    stored = backend.save_bytes(
        key="profile-images/test-avatar.png",
        content_type="image/png",
        data=b"fakepng",
    )

    backend.delete(stored.key)

    assert not (tmp_path / "profile-images" / "test-avatar.png").exists()
