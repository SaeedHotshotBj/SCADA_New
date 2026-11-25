from __future__ import annotations

import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..database import DB_PATH, connect, utc_now
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/hmi/media", tags=["HMI Media"])
MAX_MEDIA_BYTES = 64 * 1024 * 1024
MEDIA_DIR = DB_PATH.parent / "hmi-media"

MEDIA_TYPES = {
    "image/png": (".png", "image"),
    "image/jpeg": (".jpg", "image"),
    "image/gif": (".gif", "image"),
    "image/webp": (".webp", "image"),
    "image/svg+xml": (".svg", "image"),
    "video/mp4": (".mp4", "video"),
    "video/webm": (".webm", "video"),
}


def _svg_is_safe(data: bytes) -> bytes:
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise HTTPException(status_code=422, detail="تعریف DTD و Entity در SVG مجاز نیست.")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise HTTPException(status_code=422, detail="ساختار فایل SVG معتبر نیست.") from error
    if root.tag.rsplit("}", 1)[-1].lower() != "svg":
        raise HTTPException(status_code=422, detail="ریشه فایل SVG معتبر نیست.")
    forbidden = {"script", "foreignobject", "iframe", "object", "embed"}
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1].lower() in forbidden:
            raise HTTPException(status_code=422, detail="فایل SVG شامل عنصر اجرایی یا ناامن است.")
        for name, value in list(element.attrib.items()):
            local_name = name.rsplit("}", 1)[-1].lower()
            content = str(value).strip().lower()
            if local_name.startswith("on"):
                raise HTTPException(status_code=422, detail="رویدادهای اجرایی در SVG مجاز نیستند.")
            if local_name in {"href", "src"} and content.startswith(("http:", "https:", "//", "javascript:", "data:", "file:")):
                raise HTTPException(status_code=422, detail="ارجاع خارجی در SVG مجاز نیست.")
            if local_name == "style" and any(token in content for token in ("url(", "expression", "javascript:", "@import")):
                raise HTTPException(status_code=422, detail="CSS خارجی یا اجرایی در SVG مجاز نیست.")
        if element.tag.rsplit("}", 1)[-1].lower() == "style":
            style = (element.text or "").lower()
            if any(token in style for token in ("url(", "expression", "javascript:", "@import")):
                raise HTTPException(status_code=422, detail="CSS خارجی یا اجرایی در SVG مجاز نیست.")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _validate_media(content_type: str, data: bytes) -> tuple[str, str, bytes]:
    if content_type not in MEDIA_TYPES:
        raise HTTPException(status_code=415, detail="فرمت فایل پشتیبانی نمی‌شود.")
    extension, media_type = MEDIA_TYPES[content_type]
    valid = {
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/gif": data.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
        "image/svg+xml": data.lstrip().startswith(b"<"),
        "video/mp4": len(data) >= 12 and data[4:8] == b"ftyp",
        "video/webm": data.startswith(b"\x1a\x45\xdf\xa3"),
    }[content_type]
    if not valid:
        raise HTTPException(status_code=415, detail="محتوای فایل با فرمت اعلام‌شده مطابقت ندارد.")
    if content_type == "image/svg+xml":
        data = _svg_is_safe(data)
    return extension, media_type, data


@router.post("")
async def upload_hmi_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    data = await file.read(MAX_MEDIA_BYTES + 1)
    if len(data) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="حجم فایل رسانه نباید بیشتر از ۶۴ مگابایت باشد.")
    if not data:
        raise HTTPException(status_code=422, detail="فایل خالی قابل بارگذاری نیست.")
    extension, media_type, data = _validate_media(content_type, data)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    media_id = uuid.uuid4().hex
    storage_name = media_id + extension
    path = MEDIA_DIR / storage_name
    original_name = Path(file.filename or ("hmi-media" + extension)).name[:255]
    created_at = utc_now()
    try:
        path.write_bytes(data)
        with connect() as db:
            db.execute(
                """INSERT INTO hmi_media
                   (id,factory_id,owner_id,storage_name,original_name,content_type,media_type,size_bytes,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (media_id, user.get("factory_id"), user["id"], storage_name,
                 original_name, content_type, media_type, len(data), created_at),
            )
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {
        "id": media_id,
        "url": f"/api/hmi/media/{media_id}",
        "filename": original_name,
        "content_type": content_type,
        "media_type": media_type,
        "size_bytes": len(data),
    }


@router.get("/{media_id}")
def get_hmi_media(media_id: str, user: dict = Depends(get_current_user)):
    if not re.fullmatch(r"[a-f0-9]{32}", media_id):
        raise HTTPException(status_code=404, detail="فایل رسانه پیدا نشد.")
    with connect() as db:
        row = db.execute(
            "SELECT factory_id,storage_name,content_type FROM hmi_media WHERE id=?",
            (media_id,),
        ).fetchone()
    if row is None or (row["factory_id"] is not None and
                       user["role"] != "Organization Admin" and
                       row["factory_id"] != user.get("factory_id")):
        raise HTTPException(status_code=404, detail="فایل رسانه پیدا نشد.")
    storage_name = row["storage_name"]
    if Path(storage_name).name != storage_name:
        raise HTTPException(status_code=404, detail="فایل رسانه پیدا نشد.")
    path = MEDIA_DIR / storage_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="فایل رسانه پیدا نشد.")
    return FileResponse(
        path,
        media_type=row["content_type"],
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'",
        },
    )
