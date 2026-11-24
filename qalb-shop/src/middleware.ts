import { NextResponse, type NextRequest } from "next/server";

/**
 * Exposes the requested path to server components so layouts can send guests to
 * /login?next=<where they were going> instead of a generic page.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-next-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|images/|favicon.ico|qalb-logo-fullcolor.png).*)"],
};
