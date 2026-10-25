from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.core.errors import AppError
from app.dependencies import DbSession

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness: the process is up. Does not touch the database."""
    return {"status": "ok", "app": get_settings().app_name}


class _NotReady(AppError):
    status_code = 503
    code = "not_ready"


@router.get("/health/ready")
def ready(db: DbSession) -> dict[str, str]:
    """Readiness: verifies the database connection works."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise _NotReady("Database is not reachable.") from None
    return {"status": "ok", "database": "ok"}
