import type { IssuePriority, IssueStatus, IssueType } from "../types/api";

export const STATUSES: IssueStatus[] = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "DONE"];
export const PRIORITIES: IssuePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const ISSUE_TYPES: IssueType[] = ["BUG", "TASK", "FEATURE"];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};
export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
export const TYPE_LABEL: Record<IssueType, string> = { BUG: "Bug", TASK: "Task", FEATURE: "Feature" };

/** Mirrors the backend's allowed moves (the server remains the source of truth). */
export const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["OPEN", "IN_REVIEW", "DONE"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: ["OPEN", "IN_PROGRESS"],
};

export const STATUS_COLOR: Record<IssueStatus, string> = {
  OPEN: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  IN_REVIEW: "bg-amber-500",
  DONE: "bg-emerald-500",
};
