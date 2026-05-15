from __future__ import annotations

import hmac
import os
import secrets
import time
from fastapi import HTTPException, Request

SESSION_COOKIE_NAME = "fpafbas_session"
SESSION_TTL_SECONDS = 12 * 60 * 60
_SESSIONS: dict[str, float] = {}


def get_admin_token() -> str:
    return os.getenv("ADMIN_TOKEN", "").strip()


def require_admin(request: Request) -> bool:
    token = get_admin_token()
    if not token:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN not set")
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    provided = auth_header.split(" ", 1)[1].strip()
    if provided != token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


def auth_credentials() -> tuple[str, str] | None:
    username = os.getenv("APP_LOGIN_USERNAME", "").strip()
    password = os.getenv("APP_LOGIN_PASSWORD", "")
    if not username or not password:
        return None
    return username, password


def auth_required() -> bool:
    return auth_credentials() is not None


def verify_login(username: str, password: str) -> bool:
    creds = auth_credentials()
    if creds is None:
        return True
    expected_user, expected_password = creds
    return hmac.compare_digest(username, expected_user) and hmac.compare_digest(password, expected_password)


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = time.time() + SESSION_TTL_SECONDS
    return token


def delete_session(token: str | None) -> None:
    if token:
        _SESSIONS.pop(token, None)


def session_valid(token: str | None) -> bool:
    if not token:
        return False
    expires = _SESSIONS.get(token)
    if expires is None:
        return False
    if expires < time.time():
        _SESSIONS.pop(token, None)
        return False
    return True
