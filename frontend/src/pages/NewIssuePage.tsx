import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { issuesApi } from "../api/endpoints";
import { errorMessage } from "../api/client";
import { Alert, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SelectInput, TextArea, TextInput } from "../components/ui";
import AiAssistant from "../features/ai-assistant/AiAssistant";
import { useInvalidateData, useMembers, useProjects } from "../hooks/queries";
import { type IssueValues, issueSchema } from "../schemas";
import type { BugReportDraft } from "../types/api";
import { draftToDescription } from "../utils/draft";
import { ISSUE_TYPES, PRIORITIES, PRIORITY_LABEL, TYPE_LABEL } from "../utils/labels";

export default function NewIssuePage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateData();
  const projects = useProjects({ page_size: 100 });
  const writable = useMemo(() => projects.data?.items.filter((p) => !p.is_archived) ?? [], [projects.data]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<IssueValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: { project_id: sp.get("project") ?? "", title: "", description: "", issue_type: "BUG", priority: "MEDIUM", assignee_id: "" },
  });

  const projectId = useWatch({ control, name: "project_id" });
  const members = useMembers(projectId || undefined);

  // Preselect the only project (or the first) once projects load.
  useEffect(() => {
    if (!projectId && writable.length > 0) setValue("project_id", writable[0].id);
  }, [projectId, writable, setValue]);

  const create = useMutation({
    mutationFn: (v: IssueValues) =>
      issuesApi.create({
        project_id: v.project_id,
        title: v.title,
        description: v.description || undefined,
        issue_type: v.issue_type,
        priority: v.priority,
        assignee_id: v.assignee_id || null,
      }),
    onSuccess: async (issue) => {
      await invalidate();
      navigate(`/issues/${issue.id}`);
    },
  });

  const applyDraft = (d: BugReportDraft) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue("title", d.title, opts);
    setValue("description", draftToDescription(d), opts);
    setValue("priority", d.suggested_priority, opts);
    setValue("issue_type", "BUG", opts);
  };

  if (projects.isLoading) return <LoadingBlock label="Loading projects…" />;
  if (projects.isError) return <ErrorState message={errorMessage(projects.error)} onRetry={() => void projects.refetch()} />;

  if (writable.length === 0) {
    return (
      <>
        <PageHeader title="New issue" />
        <EmptyState
          title="You need a project first"
          description="Issues live inside projects (archived projects are read-only)."
          action={<Link to="/projects"><Button>Go to projects</Button></Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="New issue" description="Fill in the form, or let the AI assistant draft it from a rough bug report." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate aria-label="Create issue">
            <SelectInput label="Project" error={errors.project_id?.message} {...register("project_id", { onChange: () => setValue("assignee_id", "") })}>
              {writable.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
              ))}
            </SelectInput>
            <TextInput label="Title" maxLength={200} error={errors.title?.message} {...register("title")} />
            <TextArea label="Description" rows={8} error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-2 gap-4">
              <SelectInput label="Type" {...register("issue_type")}>
                {ISSUE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </SelectInput>
              <SelectInput label="Priority" {...register("priority")}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </SelectInput>
            </div>
            <SelectInput label="Assignee" {...register("assignee_id")}>
              <option value="">Unassigned</option>
              {members.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </SelectInput>
            {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
            <div className="flex justify-end gap-2">
              <Link to="/issues"><Button variant="secondary">Cancel</Button></Link>
              <Button type="submit" loading={create.isPending}>Create issue</Button>
            </div>
          </form>
        </Card>
        <AiAssistant onApply={applyDraft} />
      </div>
    </>
  );
}
