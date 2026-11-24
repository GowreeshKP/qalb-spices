"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAction } from "./use-action";

export function LogoutButton() {
  const router = useRouter();
  const { run, pending } = useAction();

  return (
    <button
      type="button"
      className="qalb-link qalb-label"
      disabled={pending}
      onClick={() =>
        run(async () => {
          await api("/api/auth/logout", { method: "POST", body: {} });
          router.push("/");
          router.refresh();
        })
      }
    >
      Log out
    </button>
  );
}
