import type { BugReportDraft } from "../types/api";

/** Turn an AI draft into the plain-text description stored on the issue. Empty parts are omitted. */
export function draftToDescription(d: BugReportDraft): string {
  const parts: string[] = [];
  if (d.description.trim()) parts.push(d.description.trim());
  if (d.steps_to_reproduce.length) {
    parts.push(`Steps to reproduce:\n${d.steps_to_reproduce.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (d.expected_behavior.trim()) parts.push(`Expected behavior:\n${d.expected_behavior.trim()}`);
  if (d.actual_behavior.trim()) parts.push(`Actual behavior:\n${d.actual_behavior.trim()}`);
  return parts.join("\n\n");
}
