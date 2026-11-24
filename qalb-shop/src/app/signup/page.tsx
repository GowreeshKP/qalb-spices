import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/current-user";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/shop");
  return (
    <section className="page">
      <div className="page-narrow">
        <p className="qalb-label qalb-muted">Join QALB</p>
        <h1>Create account</h1>
        <hr className="qalb-divider" />
        <SignupForm />
      </div>
    </section>
  );
}
