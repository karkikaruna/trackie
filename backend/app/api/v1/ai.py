from fastapi import APIRouter

from app.core.rate_limit import limiter
from app.dependencies import CurrentUser
from app.schemas.ai import StructureReportRequest, StructureReportResponse
from app.services.ai.service import get_ai_provider, structure_bug_report

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/structure-bug-report",
    response_model=StructureReportResponse,
    summary="Turn an informal bug report into a structured issue DRAFT",
    description=(
        "Returns a draft only. Nothing is saved: the client must review it and create the "
        "issue through `POST /api/v1/issues`. Priority is a suggestion."
    ),
)
def structure_report(data: StructureReportRequest, user: CurrentUser) -> StructureReportResponse:
    limiter.hit(f"ai:{user.id}", limit=10, window_seconds=60)
    draft = structure_bug_report(data.report, get_ai_provider())
    return StructureReportResponse(draft=draft)
