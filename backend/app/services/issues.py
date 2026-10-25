import uuid
from typing import Any

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.models import (
    ActivityAction,
    Issue,
    IssueActivity,
    IssuePriority,
    IssueStatus,
    Project,
    ProjectMember,
    ProjectRole,
    User,
)
from app.schemas.common import Page, UserRef
from app.schemas.issue import (
    ActivityOut,
    IssueCreate,
    IssueListParams,
    IssueOut,
    IssueUpdate,
    SortField,
    SortOrder,
)
from app.services.projects import get_membership, get_project_for_user

# Allowed status moves. Anything not listed is rejected with 422.
STATUS_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.OPEN: {IssueStatus.IN_PROGRESS},
    IssueStatus.IN_PROGRESS: {IssueStatus.OPEN, IssueStatus.IN_REVIEW, IssueStatus.DONE},
    IssueStatus.IN_REVIEW: {IssueStatus.IN_PROGRESS, IssueStatus.DONE},
    IssueStatus.DONE: {IssueStatus.OPEN, IssueStatus.IN_PROGRESS},
}

PRIORITY_RANK = case(
    {
        IssuePriority.LOW.value: 1,
        IssuePriority.MEDIUM.value: 2,
        IssuePriority.HIGH.value: 3,
        IssuePriority.CRITICAL.value: 4,
    },
    value=Issue.priority,
    else_=0,
)


def make_issue_key(project_key: str, number: int) -> str:
    return f"{project_key}-{number}"


def validate_transition(current: IssueStatus, new: IssueStatus) -> None:
    if current != new and new not in STATUS_TRANSITIONS[current]:
        allowed = ", ".join(sorted(s.value for s in STATUS_TRANSITIONS[current]))
        raise ValidationFailure(
            f"An issue cannot move from {current.value} to {new.value}. Allowed: {allowed}."
        )


def issue_out(issue: Issue) -> IssueOut:
    return IssueOut(
        id=issue.id,
        key=make_issue_key(issue.project.key, issue.issue_number),
        issue_number=issue.issue_number,
        project_id=issue.project_id,
        project_key=issue.project.key,
        project_name=issue.project.name,
        title=issue.title,
        description=issue.description,
        issue_type=issue.issue_type,
        status=issue.status,
        priority=issue.priority,
        reporter=UserRef.model_validate(issue.reporter),
        assignee=UserRef.model_validate(issue.assignee) if issue.assignee else None,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
    )


def activity_out(a: IssueActivity, *, with_issue: bool = False) -> ActivityOut:
    return ActivityOut(
        id=a.id,
        issue_id=a.issue_id,
        issue_key=make_issue_key(a.issue.project.key, a.issue.issue_number) if with_issue else None,
        issue_title=a.issue.title if with_issue else None,
        actor=UserRef.model_validate(a.actor),
        action_type=a.action_type,
        details=a.details,
        created_at=a.created_at,
    )


def accessible_issues(user: User) -> Select[tuple[Issue]]:
    """Base query: only issues in projects where the user is a member."""
    member_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    return select(Issue).where(Issue.project_id.in_(member_projects))


def _require_assignee(db: Session, project_id: uuid.UUID, assignee_id: uuid.UUID) -> User:
    if get_membership(db, project_id, assignee_id) is None:
        raise ValidationFailure("The assignee must be a member of the issue's project.")
    return db.get(User, assignee_id)  # type: ignore[return-value]


def _log(db: Session, issue: Issue, actor: User, action: ActivityAction, details: dict[str, Any]) -> None:
    db.add(IssueActivity(issue_id=issue.id, actor_id=actor.id, action_type=action, details=details))


def _ref(user: User | None) -> dict[str, str] | None:
    return {"id": str(user.id), "name": user.name} if user else None


def _ensure_writable(project: Project) -> None:
    if project.is_archived:
        raise ConflictError("This project is archived and read-only. Unarchive it to make changes.")


# ---------- create ----------
def create_issue(db: Session, user: User, data: IssueCreate) -> IssueOut:
    # Lock the project row so concurrent creators get distinct, gapless issue numbers.
    project, _ = get_project_for_user(db, data.project_id, user, for_update=True)
    _ensure_writable(project)
    assignee = _require_assignee(db, project.id, data.assignee_id) if data.assignee_id else None

    project.issue_counter += 1
    issue = Issue(
        issue_number=project.issue_counter,
        project_id=project.id,
        title=data.title,
        description=(data.description or "").strip() or None,
        issue_type=data.issue_type,
        status=IssueStatus.OPEN,
        priority=data.priority,
        reporter_id=user.id,  # always the authenticated user, never client supplied
        assignee_id=assignee.id if assignee else None,
    )
    db.add(issue)
    db.flush()
    _log(
        db,
        issue,
        user,
        ActivityAction.ISSUE_CREATED,
        {
            "key": make_issue_key(project.key, issue.issue_number),
            "priority": issue.priority.value,
            "issue_type": issue.issue_type.value,
            "assignee": _ref(assignee),
        },
    )
    db.commit()
    db.refresh(issue)
    return issue_out(issue)


# ---------- read ----------
def get_issue_for_user(db: Session, issue_id: uuid.UUID, user: User, *, lock: bool = False) -> Issue:
    stmt = accessible_issues(user).where(Issue.id == issue_id)
    if lock:
        stmt = stmt.with_for_update(of=Issue)
    issue = db.scalars(stmt).unique().one_or_none()
    if issue is None:
        raise NotFoundError("Issue not found.")
    return issue


def get_issue(db: Session, user: User, issue_id: uuid.UUID) -> IssueOut:
    return issue_out(get_issue_for_user(db, issue_id, user))


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_issues(db: Session, user: User, params: IssueListParams) -> Page[IssueOut]:
    stmt = accessible_issues(user)

    if params.project_id:
        get_project_for_user(db, params.project_id, user)  # 404 if the caller isn't a member
        stmt = stmt.where(Issue.project_id == params.project_id)
    if params.status:
        stmt = stmt.where(Issue.status == params.status)
    if params.priority:
        stmt = stmt.where(Issue.priority == params.priority)
    if params.issue_type:
        stmt = stmt.where(Issue.issue_type == params.issue_type)
    if params.assignee == "me":
        stmt = stmt.where(Issue.assignee_id == user.id)
    elif params.assignee == "unassigned":
        stmt = stmt.where(Issue.assignee_id.is_(None))
    elif params.assignee:
        stmt = stmt.where(Issue.assignee_id == uuid.UUID(params.assignee))
    if params.q:
        like = f"%{_escape_like(params.q)}%"
        stmt = stmt.where(
            or_(Issue.title.ilike(like, escape="\\"), Issue.description.ilike(like, escape="\\"))
        )

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0

    sort_col = {
        SortField.CREATED_AT: Issue.created_at,
        SortField.UPDATED_AT: Issue.updated_at,
        SortField.PRIORITY: PRIORITY_RANK,
    }[params.sort]
    primary = sort_col.asc() if params.order == SortOrder.ASC else sort_col.desc()
    # Tie-breakers keep pagination stable when many rows share the sort value.
    stmt = stmt.order_by(primary, Issue.created_at.desc(), Issue.id)
    rows = db.scalars(stmt.limit(params.page_size).offset((params.page - 1) * params.page_size))
    return Page.build([issue_out(i) for i in rows.unique()], total, params.page, params.page_size)


# ---------- update ----------
def update_issue(db: Session, user: User, issue_id: uuid.UUID, data: IssueUpdate) -> IssueOut:
    issue = get_issue_for_user(db, issue_id, user, lock=True)
    _ensure_writable(issue.project)
    changes = data.model_dump(exclude_unset=True)

    if "status" in changes and changes["status"] != issue.status:
        validate_transition(issue.status, changes["status"])
        _log(
            db,
            issue,
            user,
            ActivityAction.STATUS_CHANGED,
            {"from": issue.status.value, "to": changes["status"].value},
        )
        issue.status = changes["status"]

    if "priority" in changes and changes["priority"] != issue.priority:
        _log(
            db,
            issue,
            user,
            ActivityAction.PRIORITY_CHANGED,
            {"from": issue.priority.value, "to": changes["priority"].value},
        )
        issue.priority = changes["priority"]

    if "assignee_id" in changes and changes["assignee_id"] != issue.assignee_id:
        new_assignee = (
            _require_assignee(db, issue.project_id, changes["assignee_id"])
            if changes["assignee_id"]
            else None
        )
        _log(
            db,
            issue,
            user,
            ActivityAction.ASSIGNEE_CHANGED,
            {"from": _ref(issue.assignee), "to": _ref(new_assignee)},
        )
        issue.assignee_id = new_assignee.id if new_assignee else None

    edited: list[str] = []
    if "title" in changes and changes["title"] != issue.title:
        issue.title = changes["title"]
        edited.append("title")
    if "description" in changes:
        new_desc = (changes["description"] or "").strip() or None
        if new_desc != issue.description:
            issue.description = new_desc
            edited.append("description")
    if "issue_type" in changes and changes["issue_type"] != issue.issue_type:
        issue.issue_type = changes["issue_type"]
        edited.append("issue_type")
    if edited:
        # Field names only: we deliberately don't copy description text into the history.
        _log(db, issue, user, ActivityAction.ISSUE_UPDATED, {"fields": edited})

    db.commit()
    db.expire(issue)  # reload joined relationships (assignee) after the change
    return issue_out(get_issue_for_user(db, issue_id, user))


# ---------- delete ----------
def delete_issue(db: Session, user: User, issue_id: uuid.UUID) -> None:
    issue = get_issue_for_user(db, issue_id, user)
    _, role = get_project_for_user(db, issue.project_id, user)
    _ensure_writable(issue.project)
    if role != ProjectRole.OWNER and issue.reporter_id != user.id:
        raise ForbiddenError("Only the project owner or the issue's reporter can delete it.")
    db.delete(issue)
    db.commit()


# ---------- activity ----------
def list_activities(
    db: Session, user: User, issue_id: uuid.UUID, page: int, page_size: int
) -> Page[ActivityOut]:
    get_issue_for_user(db, issue_id, user)
    base = select(IssueActivity).where(IssueActivity.issue_id == issue_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(IssueActivity.created_at.desc(), IssueActivity.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).unique()
    return Page.build([activity_out(a) for a in rows], total, page, page_size)
