import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/api-client";
import { SESSION_COOKIE, userFromToken, type PublicUser } from "./auth/session";

/** Current user for server components. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value ?? null);
}

/** The path the visitor asked for (set by middleware), validated as a same-site relative path. */
async function requestedPath(fallback: string): Promise<string> {
  const value = (await headers()).get("x-next-path");
  return safeNext(value, fallback);
}

export async function requireUserPage(fallbackPath: string): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(await requestedPath(fallbackPath))}`);
  return user;
}

export async function requireAdminPage(fallbackPath: string): Promise<PublicUser> {
  const user = await requireUserPage(fallbackPath);
  if (user.role !== "ADMIN") redirect("/?forbidden=1");
  return user;
}
