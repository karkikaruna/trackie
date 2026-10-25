import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailure
from app.models import (
    ActivityAction,
    Issue,
    IssueActivity,
    IssueStatus,
    Project,
    ProjectMember,
    ProjectRole,
    User,
)
from app.schemas.common import Page
from app.schemas.project import MemberOut, ProjectCreate, ProjectOut, ProjectUpdate


# ---------- access control ----------
def get_membership(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember | None:
    return db.get(ProjectMember, (project_id, user_id))


def get_project_for_user(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    *,
    require_owner: bool = False,
    for_update: bool = False,
) -> tuple[Project, ProjectRole]:
    """Return (project, caller's role).

    Non-members get 404 (not 403) so the existence of other people's projects is not revealed.
    Members who lack the required role get 403.
    """
    membership = get_membership(db, project_id, user.id)
    if membership is None:
        raise NotFoundError("Project not found.")
    if require_owner and membership.role != ProjectRole.OWNER:
        raise ForbiddenError("Only the project owner can do this.")
    stmt = select(Project).where(Project.id == project_id)
    if for_update:
        stmt = stmt.with_for_update(of=Project)
    project = db.scalars(stmt).unique().one()
    return project, membership.role


# ---------- key generation ----------
def _derive_key(name: str) -> str:
    letters = re.sub(r"[^A-Za-z0-9 ]", "", name).upper().split()
    base = "".join(w[0] for w in letters)[:4] if len(letters) > 1 else (letters[0][:4] if letters else "")
    base = re.sub(r"^[0-9]+", "", base)
    return base if len(base) >= 2 else "PRJ"


def _unique_key(db: Session, name: str) -> str:
    base = _derive_key(name)
    candidate, n = base, 1
    while db.scalar(select(Project.id).where(Project.key == candidate)):
        n += 1
        suffix = str(n)
        candidate = base[: 10 - len(suffix)] + suffix
    return candidate


# ---------- queries ----------
def _stats(db: Session, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    result = {pid: {s.value: 0 for s in IssueStatus} for pid in project_ids}
    if not project_ids:
        return result
    rows = db.execute(
        select(Issue.project_id, Issue.status, func.count())
        .where(Issue.project_id.in_(project_ids))
        .group_by(Issue.project_id, Issue.status)
    )
    for pid, status, count in rows:
        result[pid][IssueStatus(status).value] = count
    return result


def _member_counts(db: Session, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(ProjectMember.project_id, func.count())
        .where(ProjectMember.project_id.in_(project_ids))
        .group_by(ProjectMember.project_id)
    )
    return dict(rows.all())  # type: ignore[arg-type]


def to_out(project: Project, role: ProjectRole, counts: dict[str, int], member_count: int) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        key=project.key,
        description=project.description,
        owner=project.owner,  # type: ignore[arg-type]
        is_archived=project.is_archived,
        my_role=role,
        member_count=member_count,
        issue_count=sum(counts.values()),
        issue_counts=counts,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def project_out(db: Session, project: Project, role: ProjectRole) -> ProjectOut:
    stats = _stats(db, [project.id])[project.id]
    return to_out(project, role, stats, _member_counts(db, [project.id]).get(project.id, 0))


def create_project(db: Session, user: User, data: ProjectCreate) -> ProjectOut:
    if data.key and db.scalar(select(Project.id).where(Project.key == data.key)):
        raise ConflictError(f"The project key {data.key} is already in use.")
    key = data.key or _unique_key(db, data.name)
    project = Project(name=data.name, key=key, description=data.description or None, owner_id=user.id)
    project.members.append(ProjectMember(user_id=user.id, role=ProjectRole.OWNER))
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("That project key is already in use. Please try another.") from None
    db.refresh(project)
    return project_out(db, project, ProjectRole.OWNER)


def list_projects(
    db: Session, user: User, *, include_archived: bool, page: int, page_size: int
) -> Page[ProjectOut]:
    base = (
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
    )
    if not include_archived:
        base = base.where(Project.is_archived.is_(False))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        db.execute(
            base.order_by(Project.updated_at.desc(), Project.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        .unique()
        .all()
    )
    ids = [p.id for p, _ in rows]
    stats, members = _stats(db, ids), _member_counts(db, ids)
    items = [to_out(p, role, stats[p.id], members.get(p.id, 0)) for p, role in rows]
    return Page.build(items, total, page, page_size)


def update_project(db: Session, user: User, project_id: uuid.UUID, data: ProjectUpdate) -> ProjectOut:
    project, role = get_project_for_user(db, project_id, user, require_owner=True)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is None:
        raise ValidationFailure("Project name cannot be empty.")
    if "is_archived" in changes and changes["is_archived"] is None:
        raise ValidationFailure("is_archived must be true or false.")
    for field, value in changes.items():
        setattr(project, field, (value or None) if field == "description" else value)
    db.commit()
    db.refresh(project)
    return project_out(db, project, role)


def delete_project(db: Session, user: User, project_id: uuid.UUID) -> None:
    project, _ = get_project_for_user(db, project_id, user, require_owner=True)
    db.delete(project)  # members and issues (and their activities) cascade in the database
    db.commit()


# ---------- membership ----------
def list_members(db: Session, user: User, project_id: uuid.UUID) -> list[MemberOut]:
    get_project_for_user(db, project_id, user)
    rows = db.scalars(
        select(ProjectMember).where(ProjectMember.project_id == project_id).order_by(ProjectMember.joined_at)
    ).unique()
    return [
        MemberOut(
            user_id=m.user_id,
            name=m.user.name,
            email=m.user.email,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m in rows
    ]


def add_member(db: Session, user: User, project_id: uuid.UUID, email: str) -> MemberOut:
    project, _ = get_project_for_user(db, project_id, user, require_owner=True)
    if project.is_archived:
        raise ConflictError("Archived projects cannot be changed. Unarchive it first.")
    invitee = db.scalar(select(User).where(User.email == email))
    if invitee is None:
        # Owners need to know why it failed; this only reveals existence to authenticated owners.
        raise NotFoundError("No registered user has that email address.")
    if get_membership(db, project_id, invitee.id):
        raise ConflictError("That user is already a member of this project.")
    member = ProjectMember(project_id=project_id, user_id=invitee.id, role=ProjectRole.MEMBER)
    db.add(member)
    db.commit()
    db.refresh(member)
    return MemberOut(
        user_id=invitee.id,
        name=invitee.name,
        email=invitee.email,
        role=member.role,
        joined_at=member.joined_at,
    )


def remove_member(db: Session, user: User, project_id: uuid.UUID, member_user_id: uuid.UUID) -> None:
    project, _ = get_project_for_user(db, project_id, user, require_owner=True)
    if member_user_id == project.owner_id:
        raise ConflictError("The project owner cannot be removed.")
    member = get_membership(db, project_id, member_user_id)
    if member is None:
        raise NotFoundError("That user is not a member of this project.")
    # Keep the "assignees must be members" invariant: unassign their work in this project,
    # recording each change in the issue's activity history.
    assigned = db.scalars(
        select(Issue).where(Issue.project_id == project_id, Issue.assignee_id == member_user_id)
    ).unique()
    for issue in assigned:
        db.add(
            IssueActivity(
                issue_id=issue.id,
                actor_id=user.id,
                action_type=ActivityAction.ASSIGNEE_CHANGED,
                details={
                    "from": {"id": str(member_user_id), "name": member.user.name},
                    "to": None,
                    "reason": "member_removed",
                },
            )
        )
        issue.assignee_id = None
    db.delete(member)
    db.commit()
