import type {
  Activity,
  BugReportDraft,
  Dashboard,
  Issue,
  IssueFilters,
  IssuePriority,
  IssueStatus,
  IssueType,
  Member,
  Page,
  Project,
  SessionResponse,
} from "../types/api";
import { api } from "./client";

export const authApi = {
  me: () => api<SessionResponse>("/auth/me"),
  login: (body: { email: string; password: string }) =>
    api<SessionResponse>("/auth/login", { method: "POST", body }),
  register: (body: { name: string; email: string; password: string }) =>
    api<SessionResponse>("/auth/register", { method: "POST", body }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  updateProfile: (body: { name?: string; current_password?: string; new_password?: string }) =>
    api<SessionResponse>("/auth/me", { method: "PATCH", body }),
};

export const projectsApi = {
  list: (query: { page?: number; page_size?: number; include_archived?: boolean } = {}) =>
    api<Page<Project>>("/projects", { query }),
  get: (id: string) => api<Project>(`/projects/${id}`),
  create: (body: { name: string; key?: string; description?: string }) =>
    api<Project>("/projects", { method: "POST", body }),
  update: (id: string, body: { name?: string; description?: string; is_archived?: boolean }) =>
    api<Project>(`/projects/${id}`, { method: "PATCH", body }),
  remove: (id: string) => api<void>(`/projects/${id}`, { method: "DELETE" }),
  members: (id: string) => api<Member[]>(`/projects/${id}/members`),
  addMember: (id: string, email: string) =>
    api<Member>(`/projects/${id}/members`, { method: "POST", body: { email } }),
  removeMember: (id: string, userId: string) =>
    api<void>(`/projects/${id}/members/${userId}`, { method: "DELETE" }),
};

export interface IssueInput {
  project_id: string;
  title: string;
  description?: string;
  issue_type: IssueType;
  priority: IssuePriority;
  assignee_id?: string | null;
}

export interface IssuePatch {
  title?: string;
  description?: string | null;
  issue_type?: IssueType;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string | null;
}

export const issuesApi = {
  list: (filters: Partial<IssueFilters>) => api<Page<Issue>>("/issues", { query: { ...filters } }),
  get: (id: string) => api<Issue>(`/issues/${id}`),
  create: (body: IssueInput) => api<Issue>("/issues", { method: "POST", body }),
  update: (id: string, body: IssuePatch) => api<Issue>(`/issues/${id}`, { method: "PATCH", body }),
  remove: (id: string) => api<void>(`/issues/${id}`, { method: "DELETE" }),
  activities: (id: string, page = 1) =>
    api<Page<Activity>>(`/issues/${id}/activities`, { query: { page, page_size: 20 } }),
};

export const dashboardApi = { get: () => api<Dashboard>("/dashboard") };

export const aiApi = {
  structureBugReport: (report: string) =>
    api<{ draft: BugReportDraft }>("/ai/structure-bug-report", { method: "POST", body: { report } }),
};
