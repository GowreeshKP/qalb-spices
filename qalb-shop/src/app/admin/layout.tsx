import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdminPage } from "@/server/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage("/admin");
  return (
    <>
      <nav aria-label="Admin" className="flex justify-center gap-8 border-y border-qalb-clay/30 bg-qalb-warm-white px-[var(--page-margin)] py-2">
        <Link className="qalb-link qalb-label" href="/admin">Products</Link>
        <Link className="qalb-link qalb-label" href="/admin/orders">Orders</Link>
      </nav>
      {children}
    </>
  );
}
