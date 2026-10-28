"""Kho tệp: tham chiếu tệp (MediaRef), giao diện kho (MediaStore) và kho thư mục trên máy (LocalDirectoryMediaStore).

19/10/2026 (SRS-5.1zzzzzzz56): bỏ SharePoint / OneDrive (chủ dự án: "ko dùng sharepoint nữa… xài onedriver nó bị giữ lại khi
đồng bộ"). Bản chạy thật lưu ở Supabase Storage (`kho_anh.SupabaseMediaStore`); thư mục trên máy chỉ cho chạy thử / test.
DB chỉ giữ THAM CHIẾU tệp trên mỗi `Listing` (`Listing.media`), không giữ byte.
"""
from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

# Ký tự cấm trong tên tệp / thư mục (Windows + kho cũ); tên rỗng thành "tep".
_FORBIDDEN = re.compile(r'[~"#%&*:<>?/\\{|}]')


class KhoTepError(Exception):
    """Ghi / đọc kho tệp thất bại (mạng, quyền) — engine bỏ tệp đó, lượt chat vẫn chạy."""


def sanitize_filename(name: str) -> str:
    """Bỏ ký tự cấm trong một đoạn tên tệp / thư mục."""
    cleaned = _FORBIDDEN.sub("_", (name or "").strip())
    return cleaned or "tep"


def sanitize_path(path: str) -> str:
    """Sanitize every segment of a `/`-joined folder path, dropping empty segments."""
    return "/".join(sanitize_filename(p) for p in path.split("/") if p.strip())


_EXTENSION_BY_MEDIA_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def extension_for(media_type: str) -> str:
    """A file extension for a MIME type — needed when the seller's file has no real
    filename (a generic display placeholder like "ảnh" has no extension, and without one
    Windows can't tell what app should open it, even though the bytes are a
    perfectly valid JPEG)."""
    return _EXTENSION_BY_MEDIA_TYPE.get(media_type, "")


def listing_folder(
    du_an: str | None, dia_chi: str | None, listing_id: str, ma_so_can: str | None = None
) -> str:
    """Folder for one listing's files: `<Dự án hoặc 'Nhà lẻ'>/<nhãn>_<id ngắn>`, where the
    label is the street address if known, else the mã số căn (a pre-sale project unit has a
    code before it has an address), else just the id.

    The stable `listing_id` (never reclassified) anchors the folder even if the
    address/project name is later corrected — a rename just moves the folder, the DB
    reference (item id) doesn't change. A full Quận/Đường/Số nhà taxonomy needs `dia_chi`
    decomposed into parts, which the schema doesn't capture yet (single combined
    string) — this is the pragmatic version until that lands."""
    # Keep each value as ONE path segment: a Vietnamese hẻm address like "198A/22" contains
    # a slash that would otherwise be split into an unintended nested folder downstream.
    def seg(s: str | None) -> str:
        return (s or "").replace("/", "-").replace("\\", "-").strip()

    top = seg(du_an) or "Nhà lẻ"
    short_id = listing_id[:8]
    label_part = seg(dia_chi) or seg(ma_so_can)
    label = f"{label_part}_{short_id}" if label_part else short_id
    return f"{top}/{label}"


@dataclass(frozen=True)
class MediaRef:
    """Tham chiếu một tệp trong kho. DB chỉ giữ cái này, không giữ byte. `content_type` để ghi `listing_media.mime_type`."""

    item_id: str
    web_url: str
    path: str
    filename: str
    content_type: str = ""
    ban_nho: str = ""   # "bucket/khoá" của bản nhỏ cạnh dài 480px (OPEN-38, SRS-5.1zzzzzzz241) — rỗng khi không sinh được

    def to_dict(self) -> dict[str, str]:
        d = {"item_id": self.item_id, "web_url": self.web_url, "path": self.path, "filename": self.filename}
        if self.content_type:
            d["content_type"] = self.content_type
        if self.ban_nho:
            d["ban_nho"] = self.ban_nho
        return d

    @staticmethod
    def from_dict(d: dict[str, str]) -> "MediaRef":
        return MediaRef(d["item_id"], d["web_url"], d["path"], d["filename"], d.get("content_type", ""), d.get("ban_nho", ""))


class MediaStore(ABC):
    @abstractmethod
    def upload(self, folder: str, filename: str, data: bytes, content_type: str, rieng: bool = False) -> MediaRef:
        """`rieng=True` = tệp riêng tư (sổ đỏ / giấy tờ) — kho có phân công khai / riêng phải cất vào chỗ riêng."""

    def move_folder(self, old_path: str, new_path: str) -> None:
        """Rename/move a listing's folder when its address (or project) is captured/changed
        AFTER files were already stored — the stable listing_id anchors the folder, this
        just updates the human-readable label. Default: no-op (a store without a folder
        concept keeps files where they are)."""
        return None

    def delete(self, item_id: str) -> None:
        """Remove a stored file by its id (best-effort) — used when a listing is removed from
        a seller's basket. Default: no-op."""
        return None


class LocalDirectoryMediaStore(MediaStore):
    """Kho thư mục trên máy — chỉ cho chạy thử offline / test (bản chạy thật dùng Supabase Storage). Tệp nằm ở
    `base_dir/<folder>/<filename>`; `delete` chỉ xoá tệp NẰM TRONG base_dir."""

    def __init__(self, base_dir: str | Path = "kho_tep_thu"):
        self.base_dir = Path(base_dir)

    def upload(self, folder: str, filename: str, data: bytes, content_type: str, rieng: bool = False) -> MediaRef:
        safe_name = sanitize_filename(filename)
        safe_folder = sanitize_path(folder)
        target_dir = self.base_dir / safe_folder if safe_folder else self.base_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        file_path = target_dir / safe_name
        file_path.write_bytes(data)
        item_path = f"{safe_folder}/{safe_name}" if safe_folder else safe_name
        return MediaRef(
            item_id=str(file_path.absolute()),
            web_url=f"file:///{file_path.absolute().as_posix()}",
            path=item_path,
            filename=safe_name,
            content_type=content_type,
        )

    def move_folder(self, old_path: str, new_path: str) -> None:
        old_dir = self.base_dir / sanitize_path(old_path)
        new_dir = self.base_dir / sanitize_path(new_path)
        if old_dir.exists() and old_dir != new_dir:
            new_dir.parent.mkdir(parents=True, exist_ok=True)
            if new_dir.exists():
                import shutil
                for item in old_dir.iterdir():
                    shutil.move(str(item), str(new_dir / item.name))
                try:
                    old_dir.rmdir()
                except OSError:
                    pass
            else:
                old_dir.rename(new_dir)

    def delete(self, item_id: str) -> None:
        try:
            p = Path(item_id).resolve()
            if p.is_file() and self.base_dir.resolve() in p.parents:   # không xoá tệp ngoài kho
                p.unlink()
        except Exception:
            pass

