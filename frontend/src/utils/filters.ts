import type { IssueFilters, IssuePriority, IssueStatus, IssueType } from "../types/api";
import { ISSUE_TYPES, PRIORITIES, STATUSES } from "./labels";

export const DEFAULT_FILTERS: IssueFilters = { sort: "created_at", order: "desc", page: 1, page_size: 20 };

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export function filtersFromParams(sp: URLSearchParams): IssueFilters {
  const page = Number.parseInt(sp.get("page") ?? "1", 10);
  return {
    ...DEFAULT_FILTERS,
    status: pick<IssueStatus>(sp.get("status"), STATUSES),
    priority: pick<IssuePriority>(sp.get("priority"), PRIORITIES),
    issue_type: pick<IssueType>(sp.get("issue_type"), ISSUE_TYPES),
    project_id: sp.get("project_id") || undefined,
    assignee: sp.get("assignee") || undefined,
    q: sp.get("q") || undefined,
    sort: pick(sp.get("sort"), ["created_at", "updated_at", "priority"] as const) ?? "created_at",
    order: pick(sp.get("order"), ["asc", "desc"] as const) ?? "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function paramsFromFilters(f: IssueFilters): URLSearchParams {
  const sp = new URLSearchParams();
  const entries: [string, string | number | undefined, unknown][] = [
    ["status", f.status, undefined],
    ["priority", f.priority, undefined],
    ["issue_type", f.issue_type, undefined],
    ["project_id", f.project_id, undefined],
    ["assignee", f.assignee, undefined],
    ["q", f.q, undefined],
    ["sort", f.sort, DEFAULT_FILTERS.sort],
    ["order", f.order, DEFAULT_FILTERS.order],
    ["page", f.page, DEFAULT_FILTERS.page],
  ];
  for (const [key, value, def] of entries) if (value !== undefined && value !== "" && value !== def) sp.set(key, String(value));
  return sp;
}

export function hasActiveFilters(f: IssueFilters, ignoreProject = false): boolean {
  return !!(f.status || f.priority || f.issue_type || f.assignee || f.q || (!ignoreProject && f.project_id));
}
