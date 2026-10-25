from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Issue,
    IssueActivity,
    IssuePriority,
    IssueStatus,
    Project,
    ProjectMember,
    User,
)
from app.schemas.dashboard import DashboardOut
from app.services.issues import accessible_issues, activity_out, issue_out


def build_dashboard(db: Session, user: User) -> DashboardOut:
    member_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)

    # Archived projects still count towards issue totals but not towards "active projects".
    total_projects = (
        db.scalar(
            select(func.count())
            .select_from(Project)
            .where(Project.id.in_(member_projects), Project.is_archived.is_(False))
        )
        or 0
    )

    counts = {s.value: 0 for s in IssueStatus}
    rows = db.execute(
        select(Issue.status, func.count()).where(Issue.project_id.in_(member_projects)).group_by(Issue.status)
    )
    for status, n in rows:
        counts[IssueStatus(status).value] = n

    critical_high = (
        db.scalar(
            select(func.count())
            .select_from(Issue)
            .where(
                Issue.project_id.in_(member_projects),
                Issue.priority.in_([IssuePriority.CRITICAL, IssuePriority.HIGH]),
                Issue.status != IssueStatus.DONE,
            )
        )
        or 0
    )

    recent = db.scalars(accessible_issues(user).order_by(Issue.updated_at.desc(), Issue.id).limit(5)).unique()

    mine_stmt = accessible_issues(user).where(Issue.assignee_id == user.id, Issue.status != IssueStatus.DONE)
    mine_count = db.scalar(select(func.count()).select_from(mine_stmt.subquery())) or 0
    mine = db.scalars(mine_stmt.order_by(Issue.updated_at.desc(), Issue.id).limit(5)).unique()

    activity = db.scalars(
        select(IssueActivity)
        .join(Issue, Issue.id == IssueActivity.issue_id)
        .where(Issue.project_id.in_(member_projects))
        .order_by(IssueActivity.created_at.desc(), IssueActivity.id)
        .limit(8)
    ).unique()

    return DashboardOut(
        total_projects=total_projects,
        open_issues=counts["OPEN"],
        in_progress_issues=counts["IN_PROGRESS"],
        in_review_issues=counts["IN_REVIEW"],
        completed_issues=counts["DONE"],
        total_issues=sum(counts.values()),
        critical_high_issues=critical_high,
        status_distribution=counts,
        recently_updated=[issue_out(i) for i in recent],
        assigned_to_me=[issue_out(i) for i in mine],
        assigned_to_me_count=mine_count,
        recent_activity=[activity_out(a, with_issue=True) for a in activity],
    )
