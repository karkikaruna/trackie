import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { authApi } from "../api/endpoints";
import { errorMessage } from "../api/client";
import { Alert, Button, Card, PageHeader, TextInput } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { type ProfileValues, profileSchema } from "../schemas";
import { fullDate } from "../utils/format";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "", current_password: "", new_password: "" },
  });

  const save = useMutation({
    mutationFn: (v: ProfileValues) =>
      authApi.updateProfile({
        name: v.name,
        ...(v.new_password ? { current_password: v.current_password, new_password: v.new_password } : {}),
      }),
    onSuccess: (session) => {
      setUser(session.user);
      reset({ name: session.user.name, current_password: "", new_password: "" });
    },
  });

  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" description="Your account details." />
      <Card className="max-w-xl p-6">
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
          <TextInput label="Email" value={user.email} readOnly disabled hint="Email can't be changed." />
          <TextInput label="Name" error={errors.name?.message} {...register("name")} />
          <fieldset className="space-y-4 border-t border-slate-100 pt-4">
            <legend className="text-sm font-medium text-slate-700">Change password (optional)</legend>
            <TextInput label="Current password" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register("current_password")} />
            <TextInput label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." error={errors.new_password?.message} {...register("new_password")} />
          </fieldset>
          {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
          {save.isSuccess && <Alert tone="success">Profile updated.</Alert>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Member since {fullDate(user.created_at)}</p>
            <Button type="submit" loading={save.isPending}>Save changes</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
