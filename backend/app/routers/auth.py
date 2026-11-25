from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..config import SESSION_TTL_HOURS
from ..database import connect, utc_now, audit
from ..dependencies import get_current_user
from ..security import hash_password, new_token, token_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


def public_user(row) -> dict:
    return {
        "id": row["id"], "email": row["email"], "name": row["name"],
        "role": row["role"], "status": row["status"],
        "factory_id": row["factory_id"],
        "must_change_password": bool(row.get("must_change_password", 0)),
    }


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response):
    email=body.email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="ایمیل معتبر نیست.")
    with connect() as db:
        user = db.execute(
            "SELECT id,email,name,role,status,factory_id,password_hash,must_change_password FROM users WHERE email=? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if user is None or user["status"] != "فعال" or not verify_password(body.password, user["password_hash"]):
            audit(db, None, "auth.login_failed", details={"email": email})
            failed=True
        else:
            failed=False
            token = new_token()
            expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)).isoformat(timespec="seconds")
            db.execute("DELETE FROM sessions WHERE expires_at<=?", (utc_now(),))
            db.execute(
                "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                (token_hash(token), user["id"], expires, utc_now()),
            )
            audit(db, user["id"], "auth.login", details={"user_agent": request.headers.get("user-agent", "")[:160]})
            safe = dict(user)
    if failed:
        raise HTTPException(status_code=401, detail="ایمیل یا رمز عبور صحیح نیست.")
    response.set_cookie(
        "scada_session", token, max_age=SESSION_TTL_HOURS * 3600,
        httponly=True, secure=request.url.scheme == "https", samesite="lax",
        path="/",
    )
    return {"user": public_user(safe), "expires_at": expires}


@router.post("/logout")
def logout(response: Response, scada_session: str | None = Cookie(default=None)):
    if scada_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(scada_session),))
    response.delete_cookie("scada_session", path="/", httponly=True, samesite="lax")
    return {"ok": True}


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, scada_session: str | None = Cookie(default=None),
                    user: dict = Depends(get_current_user)):
    if not scada_session:
        raise HTTPException(status_code=401, detail="نشست معتبر نیست.")
    with connect() as db:
        row = db.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        if row is None or not verify_password(body.old_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="رمز عبور فعلی صحیح نیست.")
        if verify_password(body.new_password, row["password_hash"]):
            raise HTTPException(status_code=422, detail="رمز جدید باید با رمز فعلی متفاوت باشد.")
        db.execute(
            "UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?",
            (hash_password(body.new_password), utc_now(), user["id"]),
        )
        db.execute(
            "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
            (user["id"], token_hash(scada_session)),
        )
        audit(db, user["id"], "auth.password_changed")
    return {"ok": True, "message": "رمز عبور با موفقیت تغییر کرد."}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": user}
