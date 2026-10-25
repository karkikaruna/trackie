import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ConflictError, UnauthorizedError, ValidationFailure
from app.core.security import (
    hash_password,
    hash_session_token,
    new_session_token,
    verify_password,
)
from app.models import AuthSession, User
from app.schemas.auth import RegisterRequest, UpdateProfileRequest

GENERIC_LOGIN_ERROR = "Invalid email or password."


def register_user(db: Session, data: RegisterRequest) -> User:
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise ConflictError("An account with this email already exists.")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two simultaneous registrations: the unique index is the real guard
        db.rollback()
        raise ConflictError("An account with this email already exists.") from None
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    # verify_password runs a dummy hash when the user is missing, so timing doesn't reveal it.
    if not verify_password(password, user.password_hash if user else None) or user is None:
        raise UnauthorizedError(GENERIC_LOGIN_ERROR)
    return user


def create_session(db: Session, user: User) -> str:
    """Create a server-side session and return the raw token (only its hash is stored)."""
    token = new_session_token()
    expires = datetime.now(UTC) + timedelta(hours=get_settings().session_ttl_hours)
    db.add(AuthSession(user_id=user.id, token_hash=hash_session_token(token), expires_at=expires))
    # Opportunistically purge this user's expired sessions.
    db.execute(
        delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < datetime.now(UTC))
    )
    db.commit()
    return token


def get_user_by_token(db: Session, token: str) -> User | None:
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_session_token(token)))
    if row is None:
        return None
    if row.expires_at <= datetime.now(UTC):
        db.delete(row)
        db.commit()
        return None
    return db.get(User, row.user_id)


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_session_token(token)))
    db.commit()


def update_profile(db: Session, user: User, data: UpdateProfileRequest, current_token: str) -> User:
    if data.name is not None:
        user.name = data.name
    if data.new_password is not None:
        if not data.current_password or not verify_password(data.current_password, user.password_hash):
            raise ValidationFailure("Current password is incorrect.")
        user.password_hash = hash_password(data.new_password)
        # Changing the password signs out every other device.
        db.execute(
            delete(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.token_hash != hash_session_token(current_token),
            )
        )
    db.commit()
    return user


def user_exists(db: Session, user_id: uuid.UUID) -> bool:
    return db.get(User, user_id) is not None
