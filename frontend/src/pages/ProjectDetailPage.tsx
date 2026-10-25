import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { projectsApi } from "../api/endpoints";
import { ApiError, errorMessage } from "../api/client";
import { Alert, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, PageHeader, Tag } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import IssueList from "../features/issues/IssueList";
import MembersPanel from "../features/projects/MembersPanel";
import ProjectFormModal from "../features/projects/ProjectFormModal";
import { useInvalidateData, useProject } from "../hooks/queries";
import type { IssueFilters } from "../types/api";
import { DEFAULT_FILTERS } from "../utils/filters";
import { STATUSES, STATUS_COLOR, STATUS_LABEL } from "../utils/labels";
import NotFoundPage from "./NotFoundPage";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateData();
  const { data: project, isLoading, isError, error, refetch } = useProject(projectId);
  const [filters, setFilters] = useState<IssueFilters>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const archive = useMutation({
    mutationFn: (is_archived: boolean) => projectsApi.update(projectId!, { is_archived }),
    onSuccess: () => invalidate(),
  });
  const remove = useMutation({
    mutationFn: () => projectsApi.remove(projectId!),
    onSuccess: async () => {
      await invalidate();
      navigate("/projects", { replace: true });
    },
  });

  if (isLoading) return <LoadingBlock label="Loading project…" />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage message="That project doesn't exist or you don't have access to it." />;
    return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  }
  if (!project || !user) return null;

  const isOwner = project.my_role === "OWNER";
  const active = project.issue_counts.OPEN + project.issue_counts.IN_PROGRESS + project.issue_counts.IN_REVIEW;

  return (
    <>
      <p className="mb-2 text-sm"><Link to="/projects" className="text-indigo-600 hover:underline">← Projects</Link></p>
      <PageHeader
        title={<span className="flex items-center gap-3">{project.name}<span className="font-mono text-sm font-normal text-slate-500">{project.key}</span></span>}
        description={project.description || "No description"}
        actions={
          <>
            {project.is_archived ? <Tag tone="amber">Archived</Tag> : (
              <Link to={`/issues/new?project=${project.id}`}><Button>New issue</Button></Link>
            )}
            {isOwner && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(!project.is_archived)}>
                  {project.is_archived ? "Unarchive" : "Archive"}
                </Button>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
              </>
            )}
          </>
        }
      />

      {project.is_archived && (
        <div className="mb-4"><Alert tone="warning">This project is archived and read-only. {isOwner && "Unarchive it to make changes."}</Alert></div>
      )}
      {archive.isError && <div className="mb-4"><Alert>{errorMessage(archive.error)}</Alert></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-slate-500">Total issues</p><p className="text-3xl font-semibold">{project.issue_count}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">Active</p><p className="text-3xl font-semibold text-blue-700">{active}</p></Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Progress</p>
          <p className="text-3xl font-semibold text-emerald-700">
            {project.issue_count ? Math.round((project.issue_counts.DONE / project.issue_count) * 100) : 0}%
          </p>
          <div
            role="img"
            aria-label={STATUSES.map((s) => `${STATUS_LABEL[s]} ${project.issue_counts[s]}`).join(", ")}
            className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100"
          >
            {project.issue_count > 0 && STATUSES.map((s) => (
              <div key={s} className={STATUS_COLOR[s]} style={{ width: `${(project.issue_counts[s] / project.issue_count) * 100}%` }} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="issues-h">
          <h2 id="issues-h" className="mb-3 text-lg font-semibold">Issues</h2>
          <IssueList
            filters={filters}
            onChange={setFilters}
            projectId={project.id}
            emptyAction={!project.is_archived && <Link to={`/issues/new?project=${project.id}`}><Button>Create an issue</Button></Link>}
          />
        </section>
        <MembersPanel project={project} currentUserId={user.id} />
      </div>

      {editing && <ProjectFormModal project={project} onClose={() => setEditing(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${project.name}" and all ${project.issue_count} of its issues will be permanently deleted. This can't be undone. (Archive it instead to keep the history.)`}
          confirmLabel="Delete project"
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
