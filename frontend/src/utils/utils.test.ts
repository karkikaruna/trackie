import { describe, expect, it } from "vitest";
import type { Activity, BugReportDraft } from "../types/api";
import { describeActivity } from "./activity";
import { draftToDescription } from "./draft";
import { DEFAULT_FILTERS, filtersFromParams, paramsFromFilters } from "./filters";
import { timeAgo } from "./format";

const draft: BugReportDraft = {
  title: "t",
  description: "Blank screen after login.",
  steps_to_reproduce: ["Open app", "Click login"],
  expected_behavior: "",
  actual_behavior: "Blank screen",
  suggested_priority: "HIGH",
  missing_information: [],
};

describe("draftToDescription", () => {
  it("includes present sections and omits empty ones (nothing invented)", () => {
    const text = draftToDescription(draft);
    expect(text).toContain("Steps to reproduce:\n1. Open app\n2. Click login");
    expect(text).toContain("Actual behavior:\nBlank screen");
    expect(text).not.toContain("Expected behavior");
  });
  it("handles a minimal draft", () => {
    expect(draftToDescription({ ...draft, steps_to_reproduce: [], actual_behavior: "" })).toBe("Blank screen after login.");
  });
});

describe("describeActivity", () => {
  const base: Activity = { id: "a", issue_id: "i", issue_key: null, issue_title: null, actor: { id: "u", name: "Ada" }, action_type: "", details: {}, created_at: "" };
  it("describes status and assignee changes", () => {
    expect(describeActivity({ ...base, action_type: "STATUS_CHANGED", details: { from: "OPEN", to: "IN_PROGRESS" } })).toBe("changed status from Open to In Progress");
    expect(describeActivity({ ...base, action_type: "ASSIGNEE_CHANGED", details: { from: null, to: { name: "Sam" } } })).toBe("assigned this to Sam");
    expect(describeActivity({ ...base, action_type: "ASSIGNEE_CHANGED", details: { from: { name: "Sam" }, to: null } })).toBe("unassigned Sam");
    expect(describeActivity({ ...base, action_type: "ISSUE_UPDATED", details: { fields: ["title", "issue_type"] } })).toBe("updated the title, issue type");
  });
});

describe("filters <-> URL params", () => {
  it("round-trips and omits defaults", () => {
    const f = { ...DEFAULT_FILTERS, status: "OPEN" as const, q: "crash", page: 3 };
    const sp = paramsFromFilters(f);
    expect(sp.toString()).toBe("status=OPEN&q=crash&page=3");
    expect(filtersFromParams(sp)).toEqual(f);
  });
  it("ignores invalid values from a hand-edited URL", () => {
    const f = filtersFromParams(new URLSearchParams("status=BOGUS&sort=title&page=-4&order=sideways"));
    expect(f).toEqual(DEFAULT_FILTERS);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("formats relative times", () => {
    expect(timeAgo("2026-06-15T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-06-15T10:00:00Z", now)).toBe("2 hours ago");
    expect(timeAgo("2026-06-13T12:00:00Z", now)).toBe("2 days ago");
  });
});
