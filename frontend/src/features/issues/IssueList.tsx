import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Pagination,
  PriorityBadge,
  SelectInput,
  StatusBadge,
  TextInput,
  TypeBadge,
} from "../../components/ui";
import { useIssues, useProjects } from "../../hooks/queries";
import type { IssueFilters } from "../../types/api";
import { DEFAULT_FILTERS, hasActiveFilters } from "../../utils/filters";
import { ISSUE_TYPES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, TYPE_LABEL } from "../../utils/labels";
import { timeAgo } from "../../utils/format";

interface Props {
  filters: IssueFilters;
  onChange: (filters: IssueFilters) => void;
  /** When set, the list is scoped to one project and the project filter is hidden. */
  projectId?: string;
  emptyAction?: React.ReactNode;
}

export default function IssueList({ filters, onChange, projectId, emptyAction }: Props) {
  const scoped: IssueFilters = projectId ? { ...filters, project_id: projectId } : filters;
  const query = useIssues(scoped);
  const projects = useProjects({ page_size: 100 });

  const [search, setSearch] = useState(filters.q ?? "");
  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    if (search.trim() === (filters.q ?? "")) return;
    const t = setTimeout(() => onChange({ ...filters, q: search.trim() || undefined, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [search, filters, onChange]);

  const set = (patch: Partial<IssueFilters>) => onChange({ ...filters, ...patch, page: 1 });
  const active = hasActiveFilters(filters, !!projectId);
  const reset = () => {
    setSearch("");
    onChange({ ...DEFAULT_FILTERS, project_id: projectId ? filters.project_id : undefined });
  };

  const data = query.data;

  return (
    <div>
      <Card className="mb-4 p-4">
        <form
          role="search"
          aria-label="Filter issues"
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2 lg:col-span-4">
            <TextInput
              label="Search"
              type="search"
              placeholder="Search title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={200}
            />
          </div>
          <SelectInput label="Status" value={filters.status ?? ""} onChange={(e) => set({ status: (e.target.value || undefined) as IssueFilters["status"] })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </SelectInput>
          <SelectInput label="Priority" value={filters.priority ?? ""} onChange={(e) => set({ priority: (e.target.value || undefined) as IssueFilters["priority"] })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </SelectInput>
          <SelectInput label="Type" value={filters.issue_type ?? ""} onChange={(e) => set({ issue_type: (e.target.value || undefined) as IssueFilters["issue_type"] })}>
            <option value="">All types</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </SelectInput>
          <SelectInput label="Assignee" value={filters.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value || undefined })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </SelectInput>
          {!projectId && (
            <SelectInput label="Project" value={filters.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value || undefined })}>
              <option value="">All projects</option>
              {projects.data?.items.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectInput>
          )}
          <SelectInput label="Sort by" value={filters.sort} onChange={(e) => set({ sort: e.target.value as IssueFilters["sort"] })}>
            <option value="created_at">Created</option>
            <option value="updated_at">Last updated</option>
            <option value="priority">Priority</option>
          </SelectInput>
          <SelectInput label="Order" value={filters.order} onChange={(e) => set({ order: e.target.value as IssueFilters["order"] })}>
            <option value="desc">Newest / highest first</option>
            <option value="asc">Oldest / lowest first</option>
          </SelectInput>
          {(active || filters.sort !== "created_at" || filters.order !== "desc") && (
            <div className="flex items-end">
              <Button variant="ghost" onClick={reset}>Reset filters</Button>
            </div>
          )}
        </form>
      </Card>

      {query.isLoading && <LoadingBlock label="Loading issues…" />}
      {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title={active ? "No issues match your filters" : "No issues yet"}
          description={active ? "Try changing or clearing the filters." : "Create the first issue to start tracking work."}
          action={active ? <Button variant="secondary" onClick={reset}>Clear filters</Button> : emptyAction}
        />
      )}

      {data && data.items.length > 0 && (
        <div className={query.isFetching ? "opacity-70 transition-opacity" : "transition-opacity"} aria-busy={query.isFetching}>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Issues</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Issue</th>
                  <th scope="col" className="px-3 py-3">Type</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Priority</th>
                  <th scope="col" className="hidden px-3 py-3 md:table-cell">Assignee</th>
                  <th scope="col" className="hidden px-3 py-3 lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="max-w-md px-4 py-3">
                      <Link to={`/issues/${i.id}`} className="block font-medium text-slate-900 hover:text-indigo-700">
                        <span className="line-clamp-2">{i.title}</span>
                      </Link>
                      <span className="font-mono text-xs text-slate-500">{i.key}</span>
                    </td>
                    <td className="px-3 py-3"><TypeBadge type={i.issue_type} /></td>
                    <td className="px-3 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-3 py-3"><PriorityBadge priority={i.priority} /></td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      {i.assignee ? (
                        <span className="flex items-center gap-2"><Avatar name={i.assignee.name} />{i.assignee.name}</span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-slate-500 lg:table-cell">{timeAgo(i.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={(page) => onChange({ ...filters, page })} />
        </div>
      )}
    </div>
  );
}
