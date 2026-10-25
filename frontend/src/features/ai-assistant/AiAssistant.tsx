import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { aiApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { Alert, Button, Card, PriorityBadge, Tag, TextArea } from "../../components/ui";
import { type ReportValues, reportSchema } from "../../schemas";
import type { BugReportDraft } from "../../types/api";

interface Props {
  onApply: (draft: BugReportDraft) => void;
}

const MAX = 5000;

export default function AiAssistant({ onApply }: Props) {
  const [applied, setApplied] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ReportValues>({ resolver: zodResolver(reportSchema), defaultValues: { report: "" } });

  const generate = useMutation({
    mutationFn: (v: ReportValues) => aiApi.structureBugReport(v.report),
    onMutate: () => setApplied(false),
  });
  const draft = generate.data?.draft;
  const length = useWatch({ control, name: "report" }).length;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">AI bug report assistant</h2>
        <Tag>Optional</Tag>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Paste an informal bug report and get a structured draft. Nothing is saved until you review the
        form and create the issue.
      </p>

      <form onSubmit={handleSubmit((v) => generate.mutate(v))} className="space-y-3" noValidate>
        <TextArea
          label="Bug report"
          rows={5}
          placeholder="e.g. The app crashes whenever I click the login button. It works sometimes after refreshing…"
          error={errors.report?.message}
          hint={`${length.toLocaleString()} / ${MAX.toLocaleString()} characters`}
          {...register("report")}
        />
        <Button type="submit" loading={generate.isPending}>
          {generate.isPending ? "Generating draft…" : "Generate draft"}
        </Button>
      </form>

      {generate.isError && (
        <div className="mt-4">
          <Alert title="Couldn't generate a draft">
            {errorMessage(generate.error)}
            <span className="block">You can fill out the form manually instead.</span>
          </Alert>
        </div>
      )}

      {draft && (
        <section aria-label="AI draft" className="mt-5 space-y-3 rounded-md border border-indigo-200 bg-indigo-50/50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-indigo-900">AI-generated draft: review before saving</p>
            <span className="flex items-center gap-2 text-xs text-slate-600">
              Suggested priority <PriorityBadge priority={draft.suggested_priority} />
            </span>
          </div>
          <dl className="space-y-2 text-slate-700">
            <div>
              <dt className="font-medium">Title</dt>
              <dd>{draft.title}</dd>
            </div>
            <div>
              <dt className="font-medium">Description</dt>
              <dd className="whitespace-pre-wrap">{draft.description || <span className="text-slate-400">Not provided</span>}</dd>
            </div>
            <div>
              <dt className="font-medium">Steps to reproduce</dt>
              <dd>
                {draft.steps_to_reproduce.length ? (
                  <ol className="list-decimal pl-5">
                    {draft.steps_to_reproduce.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                ) : (
                  <span className="text-slate-400">None stated in the report</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Expected behavior</dt>
              <dd>{draft.expected_behavior || <span className="text-slate-400">Not stated</span>}</dd>
            </div>
            <div>
              <dt className="font-medium">Actual behavior</dt>
              <dd>{draft.actual_behavior || <span className="text-slate-400">Not stated</span>}</dd>
            </div>
          </dl>
          {draft.missing_information.length > 0 && (
            <Alert tone="warning" title="Ask the reporter for">
              <ul className="list-disc pl-5">
                {draft.missing_information.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="text-xs text-slate-500">
            Priority is only a suggestion and the draft may contain mistakes. Edit anything in the form before you save.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onApply(draft);
                setApplied(true);
              }}
            >
              {applied ? "Draft applied ✓ (apply again)" : "Use this draft"}
            </Button>
            <Button variant="ghost" onClick={() => generate.reset()}>
              Discard
            </Button>
          </div>
        </section>
      )}
    </Card>
  );
}
