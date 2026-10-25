import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { projectsApi } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import { Alert, Button, Modal, TextArea, TextInput } from "../../components/ui";
import { useInvalidateData } from "../../hooks/queries";
import { type ProjectValues, projectSchema } from "../../schemas";
import type { Project } from "../../types/api";

interface Props {
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
}

export default function ProjectFormModal({ project, onClose, onSaved }: Props) {
  const invalidate = useInvalidateData();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project?.name ?? "", key: project?.key ?? "", description: project?.description ?? "" },
  });

  const save = useMutation({
    mutationFn: (v: ProjectValues) =>
      project
        ? projectsApi.update(project.id, { name: v.name, description: v.description })
        : projectsApi.create({ name: v.name, key: v.key || undefined, description: v.description || undefined }),
    onSuccess: async (saved) => {
      await invalidate();
      onSaved?.(saved);
      onClose();
    },
  });

  return (
    <Modal title={project ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <TextInput label="Name" error={errors.name?.message} maxLength={120} {...register("name")} />
        {!project && (
          <TextInput
            label="Key (optional)"
            hint="Prefix for issue keys, e.g. SHIP gives SHIP-1. Generated from the name if empty."
            error={errors.key?.message}
            maxLength={10}
            className="uppercase"
            {...register("key")}
          />
        )}
        <TextArea label="Description (optional)" rows={3} error={errors.description?.message} {...register("description")} />
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
