export type IssueType = "BUG" | "TASK" | "FEATURE";
export type IssueStatus = "OPEN" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectRole = "OWNER" | "MEMBER";

export interface UserRef {
  id: string;
  name: string;
}

export interface User extends UserRef {
  email: string;
  created_at: string;
}

export interface SessionResponse {
  user: User;
  csrf_token: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  owner: UserRef;
  is_archived: boolean;
  my_role: ProjectRole;
  member_count: number;
  issue_count: number;
  issue_counts: Record<IssueStatus, number>;
  created_at: string;
  updated_at: string;
}

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: ProjectRole;
  joined_at: string;
}

export interface Issue {
  id: string;
  key: string;
  issue_number: number;
  project_id: string;
  project_key: string;
  project_name: string;
  title: string;
  description: string | null;
  issue_type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  reporter: UserRef;
  assignee: UserRef | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  issue_id: string;
  issue_key: string | null;
  issue_title: string | null;
  actor: UserRef;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Dashboard {
  total_projects: number;
  open_issues: number;
  in_progress_issues: number;
  in_review_issues: number;
  completed_issues: number;
  total_issues: number;
  critical_high_issues: number;
  status_distribution: Record<IssueStatus, number>;
  recently_updated: Issue[];
  assigned_to_me: Issue[];
  assigned_to_me_count: number;
  recent_activity: Activity[];
}

export interface BugReportDraft {
  title: string;
  description: string;
  steps_to_reproduce: string[];
  expected_behavior: string;
  actual_behavior: string;
  suggested_priority: IssuePriority;
  missing_information: string[];
}

export interface IssueFilters {
  status?: IssueStatus;
  priority?: IssuePriority;
  issue_type?: IssueType;
  project_id?: string;
  assignee?: string;
  q?: string;
  sort: "created_at" | "updated_at" | "priority";
  order: "asc" | "desc";
  page: number;
  page_size: number;
}
