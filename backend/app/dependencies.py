"""Shared FastAPI dependencies: DB session, authenticated user, CSRF, rate limits."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import csrf_token_for, tokens_match
from app.db.session import get_db
from app.models import User
from app.services import auth as auth_service

SESSION_COOKIE = "shiptrack_session"
CSRF_HEADER = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

DbSession = Annotated[Session, Depends(get_db)]


def get_session_token(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise UnauthorizedError("Authentication required.")
    return token


SessionToken = Annotated[str, Depends(get_session_token)]


def get_current_user(request: Request, db: DbSession, token: SessionToken) -> User:
    user = auth_service.get_user_by_token(db, token)
    if user is None:
        raise UnauthorizedError("Authentication required.")
    # CSRF: every state-changing request must echo the token derived from this session.
    if request.method not in SAFE_METHODS:
        supplied = request.headers.get(CSRF_HEADER, "")
        if not supplied or not tokens_match(supplied, csrf_token_for(token)):
            raise ForbiddenError("Missing or invalid CSRF token.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
