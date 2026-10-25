from fastapi import APIRouter, Request, Response, status

from app.core.config import get_settings
from app.core.rate_limit import client_ip, limiter
from app.core.security import csrf_token_for
from app.dependencies import SESSION_COOKIE, CurrentUser, DbSession, SessionToken
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    SessionOut,
    UpdateProfileRequest,
    UserOut,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=s.session_ttl_hours * 3600,
        httponly=True,  # not readable by JavaScript -> XSS can't steal the session
        secure=s.use_secure_cookies,
        samesite=s.cookie_samesite,
        path="/",
    )


def _session_out(user, token: str) -> SessionOut:  # noqa: ANN001
    return SessionOut(user=UserOut.model_validate(user), csrf_token=csrf_token_for(token))


@router.post("/register", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, request: Request, response: Response, db: DbSession):
    limiter.hit(f"register:{client_ip(request)}", limit=10, window_seconds=3600)
    user = auth_service.register_user(db, data)
    token = auth_service.create_session(db, user)
    _set_cookie(response, token)
    return _session_out(user, token)


@router.post("/login", response_model=SessionOut)
def login(data: LoginRequest, request: Request, response: Response, db: DbSession):
    # Two independent limits: per client IP, and per target account (distributed guessing).
    limiter.hit(f"login:ip:{client_ip(request)}", limit=20, window_seconds=60)
    limiter.hit(f"login:email:{data.email}", limit=10, window_seconds=900)
    user = auth_service.authenticate(db, data.email, data.password)
    token = auth_service.create_session(db, user)
    _set_cookie(response, token)
    return _session_out(user, token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DbSession) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        auth_service.delete_session(db, token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=SessionOut)
def me(user: CurrentUser, token: SessionToken):
    return _session_out(user, token)


@router.patch("/me", response_model=SessionOut)
def update_me(data: UpdateProfileRequest, user: CurrentUser, token: SessionToken, db: DbSession):
    user = auth_service.update_profile(db, user, data, token)
    return _session_out(user, token)
