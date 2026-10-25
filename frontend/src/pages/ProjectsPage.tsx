import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, Tag } from "../components/ui";
import ProjectFormModal from "../features/projects/ProjectFormModal";
import { useProjects } from "../hooks/queries";
import { timeAgo } from "../utils/format";

export default function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useProjects({ page, page_size: 12, include_archived: showArchived });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Projects you own or belong to."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  setPage(1);
                }}
              />
              Show archived
            </label>
            <Button onClick={() => setCreating(true)}>New project</Button>
          </>
        }
      />

      {isLoading && <LoadingBlock label="Loading projects…" />}
      {isError && <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="A project groups related issues. Create one to get started."
          action={<Button onClick={() => setCreating(true)}>Create your first project</Button>}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block h-full">
                  <Card className="h-full p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900">{p.name}</h2>
                      <span className="font-mono text-xs text-slate-500">{p.key}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{p.description || "No description"}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{p.issue_count} issues</span>
                      <span>{p.issue_counts.OPEN + p.issue_counts.IN_PROGRESS + p.issue_counts.IN_REVIEW} active</span>
                      <span>{p.member_count} {p.member_count === 1 ? "member" : "members"}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {p.is_archived && <Tag tone="amber">Archived</Tag>}
                      <Tag>{p.my_role === "OWNER" ? "Owner" : "Member"}</Tag>
                      <span className="ml-auto text-xs text-slate-400">Updated {timeAgo(p.updated_at)}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}

      {creating && <ProjectFormModal onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />}
    </>
  );
}
