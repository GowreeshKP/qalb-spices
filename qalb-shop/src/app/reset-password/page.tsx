import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <section className="page">
      <div className="page-narrow">
        <p className="qalb-label qalb-muted">Account help</p>
        <h1>Choose a new password</h1>
        <hr className="qalb-divider" />
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <Alert kind="error">This reset link is missing its token.</Alert>
            <Link className="qalb-link" href="/forgot-password">Request a new link</Link>
          </>
        )}
      </div>
    </section>
  );
}
