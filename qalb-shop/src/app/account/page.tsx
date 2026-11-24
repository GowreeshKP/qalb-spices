import type { Metadata } from "next";
import { PasswordForm, ProfileForm } from "@/components/profile-forms";
import { requireUserPage } from "@/server/current-user";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUserPage("/account");
  return (
    <section className="page">
      <div className="page-narrow">
        <p className="qalb-label qalb-muted">Settings</p>
        <h1>Your account</h1>
        <hr className="qalb-divider" />
        <h2 style={{ fontSize: "1.5rem" }}>Profile</h2>
        <ProfileForm user={user} />
        <hr className="qalb-divider" />
        <h2 style={{ fontSize: "1.5rem" }}>Password</h2>
        <PasswordForm />
      </div>
    </section>
  );
}
