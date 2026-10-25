import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.common import Page, PageParams
from app.schemas.issue import ActivityOut, IssueCreate, IssueListParams, IssueOut, IssueUpdate
from app.services import issues as svc

router = APIRouter(prefix="/issues", tags=["issues"])


@router.post("", response_model=IssueOut, status_code=status.HTTP_201_CREATED)
def create_issue(data: IssueCreate, user: CurrentUser, db: DbSession):
    return svc.create_issue(db, user, data)


@router.get(
    "",
    response_model=Page[IssueOut],
    summary="List issues (filter, search, sort, paginate)",
    description=(
        "Only issues in projects you belong to are returned. Query parameters: `status`, "
        "`priority`, `issue_type`, `project_id`, `assignee` (`me`, `unassigned`, or a user id), "
        "`q` (case-insensitive substring match on title/description), `sort` "
        "(`created_at`|`updated_at`|`priority`), `order` (`asc`|`desc`), `page`, `page_size` (<=100)."
    ),
)
def list_issues(user: CurrentUser, db: DbSession, params: Annotated[IssueListParams, Query()]):
    return svc.list_issues(db, user, params)


@router.get("/{issue_id}", response_model=IssueOut)
def get_issue(issue_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return svc.get_issue(db, user, issue_id)


@router.patch("/{issue_id}", response_model=IssueOut)
def update_issue(issue_id: uuid.UUID, data: IssueUpdate, user: CurrentUser, db: DbSession):
    return svc.update_issue(db, user, issue_id, data)


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    svc.delete_issue(db, user, issue_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{issue_id}/activities", response_model=Page[ActivityOut])
def list_activities(
    issue_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    paging: Annotated[PageParams, Query()],
):
    return svc.list_activities(db, user, issue_id, paging.page, paging.page_size)
