"""Ein gemeinsames Passwort schützt die App (APP_PASSWORD).

Nach der Anmeldung trägt ein signiertes, HttpOnly-Cookie die Sitzung – so
funktionieren auch <audio>-Quellen, die keine eigenen Header senden können.
Ändert sich das Passwort, verfallen alle Sitzungen.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time

from fastapi import Request

from .config import get_settings

log = logging.getLogger(__name__)

COOKIE = "mitschrift_sitzung"


def _secret() -> bytes:
    s = get_settings()
    if s.session_secret:
        return s.session_secret.encode()
    datei = s.storage_dir / ".secret"
    if not datei.exists():
        datei.write_text(secrets.token_hex(32))
        datei.chmod(0o600)
    return datei.read_text().strip().encode()


def _sig(expiry: int) -> str:
    pw = get_settings().app_password.encode()
    return hmac.new(_secret(), f"{expiry}".encode() + b"|" + hashlib.sha256(pw).digest(), hashlib.sha256).hexdigest()


def auth_required() -> bool:
    return bool(get_settings().app_password)


def password_ok(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), get_settings().app_password.encode())


def new_token() -> tuple[str, int]:
    max_age = get_settings().session_days * 86400
    expiry = int(time.time()) + max_age
    return f"{expiry}.{_sig(expiry)}", max_age


def token_ok(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp_s, sig = token.split(".", 1)
    try:
        expiry = int(exp_s)
    except ValueError:
        return False
    if expiry < time.time():
        return False
    return hmac.compare_digest(sig, _sig(expiry))


def is_authenticated(request: Request) -> bool:
    return (not auth_required()) or token_ok(request.cookies.get(COOKIE))
