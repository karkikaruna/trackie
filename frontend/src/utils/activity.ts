import type { Activity, IssuePriority, IssueStatus } from "../types/api";
import { PRIORITY_LABEL, STATUS_LABEL } from "./labels";

type Ref = { name?: string } | null | undefined;

export function describeActivity(a: Activity): string {
  const d = a.details as Record<string, unknown>;
  switch (a.action_type) {
    case "ISSUE_CREATED":
      return "created this issue";
    case "STATUS_CHANGED":
      return `changed status from ${STATUS_LABEL[d.from as IssueStatus] ?? d.from} to ${STATUS_LABEL[d.to as IssueStatus] ?? d.to}`;
    case "PRIORITY_CHANGED":
      return `changed priority from ${PRIORITY_LABEL[d.from as IssuePriority] ?? d.from} to ${PRIORITY_LABEL[d.to as IssuePriority] ?? d.to}`;
    case "ASSIGNEE_CHANGED": {
      const from = (d.from as Ref)?.name;
      const to = (d.to as Ref)?.name;
      if (!to) return from ? `unassigned ${from}` : "cleared the assignee";
      return from ? `reassigned from ${from} to ${to}` : `assigned this to ${to}`;
    }
    case "ISSUE_UPDATED": {
      const fields = ((d.fields as string[]) ?? []).map((f) => f.replace("_", " "));
      return fields.length ? `updated the ${fields.join(", ")}` : "updated this issue";
    }
    default:
      return a.action_type.toLowerCase().replace("_", " ");
  }
}
