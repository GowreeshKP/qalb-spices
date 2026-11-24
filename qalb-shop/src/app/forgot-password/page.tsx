import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <section className="page">
      <div className="page-narrow">
        <p className="qalb-label qalb-muted">Account help</p>
        <h1>Forgot password</h1>
        <hr className="qalb-divider" />
        <p>Enter your email and we will send you a link to choose a new password.</p>
        <ForgotPasswordForm />
      </div>
    </section>
  );
}
