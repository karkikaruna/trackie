import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi, issuesApi, projectsApi } from "../api/endpoints";
import type { IssueFilters } from "../types/api";

const DATA_KEYS = ["projects", "project", "members", "issues", "issue", "activities", "dashboard"];

/** After any write, refresh everything derived from server data (counts, lists, dashboards). */
export function useInvalidateData() {
  const qc = useQueryClient();
  return () => Promise.all(DATA_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export const useProjects = (params: { page?: number; page_size?: number; include_archived?: boolean } = {}) =>
  useQuery({
    queryKey: ["projects", params],
    queryFn: () => projectsApi.list(params),
    placeholderData: keepPreviousData,
  });

export const useProject = (id: string | undefined) =>
  useQuery({ queryKey: ["project", id], queryFn: () => projectsApi.get(id!), enabled: !!id });

export const useMembers = (projectId: string | undefined) =>
  useQuery({ queryKey: ["members", projectId], queryFn: () => projectsApi.members(projectId!), enabled: !!projectId });

export const useIssues = (filters: Partial<IssueFilters>) =>
  useQuery({
    queryKey: ["issues", filters],
    queryFn: () => issuesApi.list(filters),
    placeholderData: keepPreviousData,
  });

export const useIssue = (id: string | undefined) =>
  useQuery({ queryKey: ["issue", id], queryFn: () => issuesApi.get(id!), enabled: !!id });

export const useActivities = (issueId: string | undefined, page: number) =>
  useQuery({
    queryKey: ["activities", issueId, page],
    queryFn: () => issuesApi.activities(issueId!, page),
    enabled: !!issueId,
    placeholderData: keepPreviousData,
  });

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: dashboardApi.get });
