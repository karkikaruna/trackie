from pydantic import BaseModel

from app.schemas.issue import ActivityOut, IssueOut


class DashboardOut(BaseModel):
    total_projects: int
    open_issues: int
    in_progress_issues: int
    in_review_issues: int
    completed_issues: int
    total_issues: int
    critical_high_issues: int
    status_distribution: dict[str, int]
    recently_updated: list[IssueOut]
    assigned_to_me: list[IssueOut]
    assigned_to_me_count: int
    recent_activity: list[ActivityOut]
