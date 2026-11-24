"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, safeNext } from "@/lib/api-client";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "@/lib/validators";
import type { ZodError } from "zod";
import { Alert, TextField } from "./ui";
import { useAction } from "./use-action";

function fieldErrorsOf(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[issue.path.join(".") || "_"] ??= []).push(issue.message);
  return out;
}

function formValues(event: FormEvent<HTMLFormElement>): Record<string, string> {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

export function LoginForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const { run, fail, pending, error, fieldErrors } = useAction();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        const parsed = loginSchema.safeParse(formValues(event));
        if (!parsed.success) return fail(fieldErrorsOf(parsed.error));
        void run(async () => {
          await api("/api/auth/login", { method: "POST", body: parsed.data });
          router.push(safeNext(next));
          router.refresh();
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Email address" name="email" type="email" autoComplete="email" required errors={fieldErrors.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required errors={fieldErrors.password} />
      <button className="qalb-btn w-full" type="submit" disabled={pending}>
        {pending ? "Logging in..." : "Log in"}
      </button>
      <p className="mt-4 text-sm">
        <Link className="qalb-link" href="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="text-sm">
        New to QALB?{" "}
        <Link className="qalb-link" href="/signup">Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const { run, fail, pending, error, fieldErrors } = useAction();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        const parsed = signupSchema.safeParse(formValues(event));
        if (!parsed.success) return fail(fieldErrorsOf(parsed.error));
        void run(async () => {
          await api("/api/auth/signup", { method: "POST", body: parsed.data });
          router.push("/shop");
          router.refresh();
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Full name" name="name" autoComplete="name" required errors={fieldErrors.name} />
      <TextField label="Email address" name="email" type="email" autoComplete="email" required errors={fieldErrors.email} />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        errors={fieldErrors.password}
      />
      <button className="qalb-btn w-full" type="submit" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </button>
      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link className="qalb-link" href="/login">Log in</Link>
      </p>
    </form>
  );
}

interface ForgotResponse {
  message: string;
  devResetUrl?: string;
}

export function ForgotPasswordForm() {
  const { run, fail, pending, error, fieldErrors } = useAction();
  const [done, setDone] = useState<ForgotResponse | null>(null);

  if (done) {
    return (
      <div>
        <Alert kind="success">{done.message}</Alert>
        {done.devResetUrl ? (
          <p className="text-sm">
            Development mode:{" "}
            <a className="qalb-link" href={done.devResetUrl} data-testid="dev-reset-link">open the reset link</a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        const parsed = forgotPasswordSchema.safeParse(formValues(event));
        if (!parsed.success) return fail(fieldErrorsOf(parsed.error));
        void run(async () => {
          setDone(await api<ForgotResponse>("/api/auth/forgot-password", { method: "POST", body: parsed.data }));
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Email address" name="email" type="email" autoComplete="email" required errors={fieldErrors.email} />
      <button className="qalb-btn w-full" type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { run, fail, pending, error, fieldErrors } = useAction();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        const parsed = resetPasswordSchema.safeParse({ ...formValues(event), token });
        if (!parsed.success) return fail(fieldErrorsOf(parsed.error));
        void run(async () => {
          await api("/api/auth/reset-password", { method: "POST", body: parsed.data });
          router.push("/login?reset=1");
        });
      }}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {fieldErrors.token ? <Alert kind="error">{fieldErrors.token[0]}</Alert> : null}
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        errors={fieldErrors.password}
      />
      <button className="qalb-btn w-full" type="submit" disabled={pending}>
        {pending ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}
