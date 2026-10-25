"""Password hashing and session/CSRF token helpers."""

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher()  # Argon2id with the library's recommended parameters
# Used to burn comparable CPU time when the email is unknown (blunts user enumeration by timing).
_DUMMY_HASH = _hasher.hash("shiptrack-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def _hmac(value: str, purpose: str) -> str:
    key = get_settings().session_secret_key.encode()
    return hmac.new(key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()


def hash_session_token(token: str) -> str:
    """Only this hash is stored in the DB, so a DB leak does not leak usable sessions."""
    return _hmac(token, "session")


def csrf_token_for(session_token: str) -> str:
    """CSRF token derived from the session; the SPA reads it from /auth/me and echoes it back."""
    return _hmac(session_token, "csrf")


def tokens_match(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
