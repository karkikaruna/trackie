import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { type IssuePatch, issuesApi } from "../api/endpoints";
import { ApiError, errorMessage } from "../api/client";
import {
  Alert, Avatar, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, Pagination,
  SelectInput, StatusBadge, TextArea, TextInput, TypeBadge,
} from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { useActivities, useInvalidateData, useIssue, useMembers, useProject } from "../hooks/queries";
import { type IssueEditValues, issueEditSchema } from "../schemas";
import { describeActivity } from "../utils/activity";
import { fullDate, timeAgo } from "../utils/format";
import { ISSUE_TYPES, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUS_TRANSITIONS, TYPE_LABEL } from "../utils/labels";
import NotFoundPage from "./NotFoundPage";

export default function IssueDetailPage() {
  const { issueId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateData();
  const issue = useIssue(issueId);
  const project = useProject(issue.data?.project_id);
  const members = useMembers(issue.data?.project_id);
  const [actPage, setActPage] = useState(1);
  const activities = useActivities(issueId, actPage);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = useMutation({
    mutationFn: (body: IssuePatch) => issuesApi.update(issueId!, body),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => issuesApi.remove(issueId!),
    onSuccess: async () => {
      await invalidate();
      navigate("/issues", { replace: true });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IssueEditValues>({
    resolver: zodResolver(issueEditSchema),
    values: issue.data
      ? { title: issue.data.title, description: issue.data.description ?? "", issue_type: issue.data.issue_type }
      : undefined,
  });

  if (issue.isLoading) return <LoadingBlock label="Loading issue…" />;
  if (issue.isError) {
    if (issue.error instanceof ApiError && issue.error.status === 404) return <NotFoundPage message="That issue doesn't exist or you don't have access to it." />;
    return <ErrorState message={errorMessage(issue.error)} onRetry={() => void issue.refetch()} />;
  }
  const i = issue.data;
  if (!i || !user) return null;

  const archived = project.data?.is_archived ?? false;
  const canDelete = project.data?.my_role === "OWNER" || i.reporter.id === user.id;
  const disabled = archived || patch.isPending;
  const statusOptions = [i.status, ...STATUS_TRANSITIONS[i.status]];

  const saveEdit = (v: IssueEditValues) => {
    const body: IssuePatch = {};
    if (v.title !== i.title) body.title = v.title;
    if ((v.description || null) !== (i.description || null)) body.description = v.description || null;
    if (v.issue_type !== i.issue_type) body.issue_type = v.issue_type;
    if (Object.keys(body).length === 0) return setEditing(false);
    patch.mutate(body);
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to={`/projects/${i.project_id}`} className="text-indigo-600 hover:underline">← {i.project_name}</Link>
      </p>

      {archived && <div className="mb-4"><Alert tone="warning">This project is archived, so the issue is read-only.</Alert></div>}
      {patch.isError && <div className="mb-4"><Alert>{errorMessage(patch.error)}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            {editing ? (
              <form onSubmit={handleSubmit(saveEdit)} className="space-y-4" noValidate aria-label="Edit issue">
                <TextInput label="Title" maxLength={200} error={errors.title?.message} {...register("title")} />
                <TextArea label="Description" rows={8} error={errors.description?.message} {...register("description")} />
                <SelectInput label="Type" {...register("issue_type")}>
                  {ISSUE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </SelectInput>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditing(false)} disabled={patch.isPending}>Cancel</Button>
                  <Button type="submit" loading={patch.isPending}>Save</Button>
                </div>
              </form>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-500">{i.key}</span>
                  <TypeBadge type={i.issue_type} />
                  <StatusBadge status={i.status} />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{i.title}</h1>
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {i.description || <span className="text-slate-400">No description provided.</span>}
                </div>
                <div className="mt-6 flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(true)} disabled={archived}>Edit</Button>
                  {canDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={archived}>Delete</Button>}
                </div>
              </>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold">Activity</h2>
            {activities.isLoading && <LoadingBlock label="Loading activity…" />}
            {activities.isError && <ErrorState message={errorMessage(activities.error)} onRetry={() => void activities.refetch()} />}
            {activities.data && (
              <>
                <ol className="space-y-4">
                  {activities.data.items.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <Avatar name={a.actor.name} />
                      <div>
                        <p className="text-slate-700"><span className="font-medium">{a.actor.name}</span> {describeActivity(a)}</p>
                        <time dateTime={a.created_at} title={fullDate(a.created_at)} className="text-xs text-slate-400">{timeAgo(a.created_at)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
                <Pagination page={activities.data.page} pages={activities.data.pages} total={activities.data.total} onChange={setActPage} />
              </>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 p-6">
          <SelectInput
            label="Status"
            value={i.status}
            disabled={disabled}
            onChange={(e) => patch.mutate({ status: e.target.value as IssuePatch["status"] })}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </SelectInput>
          <SelectInput
            label="Priority"
            value={i.priority}
            disabled={disabled}
            onChange={(e) => patch.mutate({ priority: e.target.value as IssuePatch["priority"] })}
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </SelectInput>
          <SelectInput
            label="Assignee"
            value={i.assignee?.id ?? ""}
            disabled={disabled || !members.data}
            onChange={(e) => patch.mutate({ assignee_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </SelectInput>
          <dl className="space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Reporter</dt><dd>{i.reporter.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Created</dt><dd title={fullDate(i.created_at)}>{timeAgo(i.created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Updated</dt><dd title={fullDate(i.updated_at)}>{timeAgo(i.updated_at)}</dd></div>
          </dl>
        </Card>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete issue?"
          message={`${i.key} and its activity history will be permanently deleted.`}
          confirmLabel="Delete issue"
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
