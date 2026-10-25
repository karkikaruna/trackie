import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, PriorityBadge, StatusBadge } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { useDashboard } from "../hooks/queries";
import type { Issue } from "../types/api";
import { describeActivity } from "../utils/activity";
import { timeAgo } from "../utils/format";
import { STATUSES, STATUS_COLOR, STATUS_LABEL } from "../utils/labels";

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

function IssueMiniList({ issues, empty }: { issues: Issue[]; empty: string }) {
  if (!issues.length) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {issues.map((i) => (
        <li key={i.id}>
          <Link to={`/issues/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">{i.title}</span>
              <span className="font-mono text-xs text-slate-500">{i.key}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <PriorityBadge priority={i.priority} />
              <StatusBadge status={i.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDashboard();

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(" ")[0] ?? ""}`}
        description="Here's what's happening across your projects."
        actions={<Link to="/issues/new"><Button>New issue</Button></Link>}
      />
      {isLoading && <LoadingBlock label="Loading dashboard…" />}
      {isError && <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />}

      {data && data.total_projects === 0 && data.total_issues === 0 && (
        <EmptyState
          title="Welcome to ShipTrack"
          description="Create your first project, then add issues to start tracking progress."
          action={<Link to="/projects"><Button>Create a project</Button></Link>}
        />
      )}

      {data && (data.total_projects > 0 || data.total_issues > 0) && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Active projects" value={data.total_projects} />
            <Stat label="Open issues" value={data.open_issues} />
            <Stat label="In progress" value={data.in_progress_issues} tone="text-blue-700" />
            <Stat label="Completed" value={data.completed_issues} tone="text-emerald-700" />
            <Stat label="Critical / high (not done)" value={data.critical_high_issues} tone="text-red-700" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-1">
              <h2 className="mb-4 text-base font-semibold">Issues by status</h2>
              {data.total_issues === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No issues yet.</p>
              ) : (
                <div
                  role="img"
                  aria-label={`Issues by status: ${STATUSES.map((s) => `${STATUS_LABEL[s]} ${data.status_distribution[s]}`).join(", ")}`}
                  className="space-y-3"
                >
                  {STATUSES.map((s) => {
                    const n = data.status_distribution[s];
                    const pct = Math.round((n / data.total_issues) * 100);
                    return (
                      <div key={s}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-slate-600">{STATUS_LABEL[s]}</span>
                          <span className="font-medium">{n}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${STATUS_COLOR[s]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">Assigned to me <span className="text-slate-400">({data.assigned_to_me_count})</span></h2>
                <Link to="/issues?assignee=me" className="text-sm text-indigo-600 hover:underline">View all</Link>
              </div>
              <IssueMiniList issues={data.assigned_to_me} empty="Nothing assigned to you right now." />
            </Card>

            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-2 text-base font-semibold">Recently updated</h2>
              <IssueMiniList issues={data.recently_updated} empty="No issues yet." />
            </Card>

            <Card className="p-5">
              <h2 className="mb-2 text-base font-semibold">Recent activity</h2>
              {data.recent_activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.recent_activity.map((a) => (
                    <li key={a.id} className="flex gap-2 text-sm">
                      <Avatar name={a.actor.name} />
                      <div className="min-w-0">
                        <p className="text-slate-700">
                          <span className="font-medium">{a.actor.name}</span> {describeActivity(a)}{" "}
                          <Link to={`/issues/${a.issue_id}`} className="font-mono text-xs text-indigo-600 hover:underline">{a.issue_key}</Link>
                        </p>
                        <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
