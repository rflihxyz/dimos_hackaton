"""Atomic image read/write/delete for face uploads.

Images live in ``FACES_DIR`` (default ``/faces``). The dimos enrollment
job will eventually read from the same directory to compute embeddings,
so we use the same atomic-rename pattern as the recipes storage to avoid
half-written reads.
"""
from __future__ import annotations

import os
from pathlib import Path
import re

import aiofiles

USERNAME_RE = re.compile(r"^[a-z0-9_]{1,32}$")
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def faces_dir() -> Path:
    raw = os.environ.get("FACES_DIR", "/faces")
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def face_path(username: str, ext: str = ".jpg") -> Path:
    if not USERNAME_RE.match(username):
        raise ValueError(f"Invalid username {username!r}")
    if ext not in ALLOWED_EXTS:
        raise ValueError(f"Unsupported extension {ext!r}; allowed: {sorted(ALLOWED_EXTS)}")
    return faces_dir() / f"{username}{ext}"


def existing_face_path(username: str) -> Path | None:
    """Return the face image path if any extension exists, else None."""
    if not USERNAME_RE.match(username):
        return None
    base = faces_dir()
    for ext in ALLOWED_EXTS:
        candidate = base / f"{username}{ext}"
        if candidate.exists():
            return candidate
    return None


async def write_face(username: str, data: bytes, ext: str = ".jpg") -> Path:
    path = face_path(username, ext)
    # Clean up any existing image with a different extension so the user
    # only ever has one face on disk.
    for other_ext in ALLOWED_EXTS:
        if other_ext == ext:
            continue
        sibling = faces_dir() / f"{username}{other_ext}"
        if sibling.exists():
            sibling.unlink()

    tmp = path.with_suffix(path.suffix + ".tmp")
    async with aiofiles.open(tmp, "wb") as f:
        await f.write(data)
    os.replace(tmp, path)
    return path


async def delete_face(username: str) -> bool:
    """Delete every face file for ``username``. Returns True if anything was removed."""
    if not USERNAME_RE.match(username):
        return False
    deleted = False
    base = faces_dir()
    for ext in ALLOWED_EXTS:
        path = base / f"{username}{ext}"
        try:
            path.unlink()
            deleted = True
        except FileNotFoundError:
            continue
    return deleted
