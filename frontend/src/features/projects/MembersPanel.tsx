import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { projectsApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { Alert, Avatar, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, Tag, TextInput } from "../../components/ui";
import { useInvalidateData, useMembers } from "../../hooks/queries";
import { type MemberValues, memberSchema } from "../../schemas";
import type { Member, Project } from "../../types/api";

export default function MembersPanel({ project, currentUserId }: { project: Project; currentUserId: string }) {
  const members = useMembers(project.id);
  const invalidate = useInvalidateData();
  const isOwner = project.my_role === "OWNER";
  const [toRemove, setToRemove] = useState<Member | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberValues>({ resolver: zodResolver(memberSchema), defaultValues: { email: "" } });

  const add = useMutation({
    mutationFn: (v: MemberValues) => projectsApi.addMember(project.id, v.email),
    onSuccess: async () => {
      reset();
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (m: Member) => projectsApi.removeMember(project.id, m.user_id),
    onSuccess: async () => {
      setToRemove(null);
      await invalidate();
    },
  });

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Members</h2>
      {members.isLoading && <LoadingBlock label="Loading members…" />}
      {members.isError && <ErrorState message={errorMessage(members.error)} onRetry={() => void members.refetch()} />}
      {members.data && (
        <ul className="divide-y divide-slate-100">
          {members.data.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={m.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name} {m.user_id === currentUserId && <span className="text-slate-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tag tone={m.role === "OWNER" ? "amber" : "slate"}>{m.role === "OWNER" ? "Owner" : "Member"}</Tag>
                {isOwner && m.role !== "OWNER" && (
                  <Button variant="ghost" onClick={() => setToRemove(m)} aria-label={`Remove ${m.name}`}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner && !project.is_archived && (
        <form onSubmit={handleSubmit((v) => add.mutate(v))} className="mt-4 space-y-2 border-t border-slate-100 pt-4" noValidate>
          <TextInput
            label="Add a member by email"
            type="email"
            placeholder="teammate@example.com"
            hint="They need to have registered already."
            error={errors.email?.message}
            {...register("email")}
          />
          {add.isError && <Alert>{errorMessage(add.error)}</Alert>}
          <Button type="submit" variant="secondary" loading={add.isPending}>
            Add member
          </Button>
        </form>
      )}

      {toRemove && (
        <ConfirmDialog
          title="Remove member?"
          message={`${toRemove.name} will lose access to this project and be unassigned from its issues.`}
          confirmLabel="Remove member"
          loading={remove.isPending}
          error={remove.isError ? errorMessage(remove.error) : null}
          onConfirm={() => remove.mutate(toRemove)}
          onCancel={() => {
            remove.reset();
            setToRemove(null);
          }}
        />
      )}
    </Card>
  );
}
