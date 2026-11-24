import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";
import { safeNext } from "@/lib/api-client";
import { getCurrentUser } from "@/server/current-user";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <section className="page">
      <div className="page-narrow">
        <p className="qalb-label qalb-muted">Welcome back</p>
        <h1>Log in</h1>
        <hr className="qalb-divider" />
        {params.reset ? <Alert kind="success">Your password was changed. Log in with the new one.</Alert> : null}
        {next ? <p className="qalb-hint mb-4">Log in to continue.</p> : null}
        <LoginForm next={next} />
      </div>
    </section>
  );
}
