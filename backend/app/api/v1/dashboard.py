from fastapi import APIRouter

from app.dependencies import CurrentUser, DbSession
from app.schemas.dashboard import DashboardOut
from app.services.dashboard import build_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(user: CurrentUser, db: DbSession):
    return build_dashboard(db, user)
