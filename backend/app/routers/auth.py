from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from ..config import SESSION_TTL_HOURS
from ..database import connect, utc_now, audit
from ..dependencies import get_current_user
from ..security import new_token, token_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


def public_user(row) -> dict:
    return {
        "id": row["id"], "email": row["email"], "name": row["name"],
        "role": row["role"], "status": row["status"],
        "must_change_password": bool(row.get("must_change_password", 0)),
    }


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response):
    with connect() as db:
        user = db.execute(
            "SELECT id,email,name,role,status,password_hash,must_change_password FROM users WHERE email=? COLLATE NOCASE",
            (body.email.strip(),),
        ).fetchone()
        if user is None or user["status"] != "فعال" or not verify_password(body.password, user["password_hash"]):
            audit(db, None, "auth.login_failed", details={"email": body.email.lower()})
            raise HTTPException(status_code=401, detail="ایمیل یا رمز عبور صحیح نیست.")
        token = new_token()
        expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)).isoformat(timespec="seconds")
        db.execute("DELETE FROM sessions WHERE expires_at<=?", (utc_now(),))
        db.execute(
            "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
            (token_hash(token), user["id"], expires, utc_now()),
        )
        audit(db, user["id"], "auth.login", details={"user_agent": request.headers.get("user-agent", "")[:160]})
        safe = dict(user)
    response.set_cookie(
        "scada_session", token, max_age=SESSION_TTL_HOURS * 3600,
        httponly=True, secure=request.url.scheme == "https", samesite="lax",
        path="/",
    )
    return {"user": public_user(safe), "expires_at": expires}


@router.post("/logout")
def logout(response: Response, scada_session: str | None = None):
    # Cookie is read explicitly below to avoid leaking tokens into application logs.
    from fastapi import Cookie
    response.delete_cookie("scada_session", path="/", httponly=True, samesite="lax")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": user}
