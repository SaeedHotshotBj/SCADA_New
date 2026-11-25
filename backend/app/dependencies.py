from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, status

from .database import connect
from .security import token_hash


def get_current_user(scada_session: str | None = Cookie(default=None)) -> dict:
    if not scada_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="برای ادامه وارد سامانه شوید.")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as db:
        row = db.execute(
            """SELECT u.id,u.email,u.name,u.role,u.status,u.factory_id,u.must_change_password
               FROM sessions s JOIN users u ON u.id=s.user_id
               WHERE s.token_hash=? AND s.expires_at>?""",
            (token_hash(scada_session), now),
        ).fetchone()
    if row is None or row["status"] != "فعال":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست معتبر نیست؛ دوباره وارد شوید.")
    user = dict(row)
    user["must_change_password"] = bool(user.get("must_change_password", 0))
    if user["role"] != "Organization Admin" and not user.get("factory_id"):
        raise HTTPException(status_code=403, detail="برای این حساب هنوز کارخانه‌ای تخصیص داده نشده است؛ مدیر سامانه باید دسترسی را تنظیم کند.")
    return user


def require_roles(*roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="برای این عملیات دسترسی کافی ندارید.")
        return user
    return dependency
