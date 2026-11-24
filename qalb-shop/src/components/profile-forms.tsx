"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { UserDTO } from "@/lib/types";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validators";
import { Alert, TextField } from "./ui";
import { useAction } from "./use-action";

function issues(error: { issues: { path: (string | number)[]; message: string }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[issue.path.join(".") || "_"] ??= []).push(issue.message);
  return out;
}

export function ProfileForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const { run, fail, pending, error, fieldErrors } = useAction();
  const [saved, setSaved] = useState(false);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        const data = new FormData(event.currentTarget);
        const parsed = updateProfileSchema.safeParse({ name: data.get("name"), email: data.get("email") });
        if (!parsed.success) return fail(issues(parsed.error));
        void run(async () => {
          await api("/api/profile", { method: "PATCH", body: parsed.data });
          setSaved(true);
          router.refresh();
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {saved ? <Alert kind="success">Profile saved.</Alert> : null}
      <TextField label="Full name" name="name" defaultValue={user.name} required errors={fieldErrors.name} />
      <TextField label="Email address" name="email" type="email" defaultValue={user.email} required errors={fieldErrors.email} />
      <button className="qalb-btn" type="submit" disabled={pending}>{pending ? "Saving..." : "Save profile"}</button>
    </form>
  );
}

export function PasswordForm() {
  const { run, fail, pending, error, fieldErrors } = useAction();
  const [saved, setSaved] = useState(false);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        const form = event.currentTarget;
        const data = new FormData(form);
        const parsed = changePasswordSchema.safeParse({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        });
        if (!parsed.success) return fail(issues(parsed.error));
        void run(async () => {
          await api("/api/profile/password", { method: "POST", body: parsed.data });
          form.reset();
          setSaved(true);
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {saved ? <Alert kind="success">Password updated. Other devices were logged out.</Alert> : null}
      <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required errors={fieldErrors.currentPassword} />
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        errors={fieldErrors.newPassword}
      />
      <button className="qalb-btn" type="submit" disabled={pending}>{pending ? "Updating..." : "Change password"}</button>
    </form>
  );
}
