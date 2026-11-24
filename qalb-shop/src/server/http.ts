import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { appUrl } from "./env";
import { AppError, Errors } from "./errors";
import { logger } from "./logger";

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: unknown;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MAX_JSON_BYTES = 100_000;

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorResponse(error: AppError, headers?: Record<string, string>): Response {
  const body: ApiErrorBody = { error: error.message, code: error.code };
  if (error.details !== undefined) body.details = error.details;
  return json(body, { status: error.status, headers });
}

/** Flatten Zod issues into { field: [messages] } for forms. */
export function zodDetails(error: ZodError): { fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors };
}

/** Map any thrown value to a safe AppError. Internal details never reach the client. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return Errors.validation(zodDetails(error));
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return Errors.conflict("A record with those values already exists");
    if (error.code === "P2025") return Errors.notFound();
  }
  return new AppError(500, "INTERNAL_ERROR", "Something went wrong on our side");
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin header must match this app.
 * Combined with SameSite=Lax cookies and JSON-only bodies.
 */
export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw Errors.csrf();
  const allowed = new Set<string>([new URL(request.url).origin]);
  try {
    allowed.add(new URL(appUrl()).origin);
  } catch {
    /* ignore malformed APP_URL */
  }
  if (!allowed.has(origin)) throw Errors.csrf();
}

export async function readJson<T>(request: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw Errors.unsupportedMedia("Content-Type must be application/json");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw Errors.tooLarge("Request body is too large");
  const raw = await request.text();
  if (raw.length > MAX_JSON_BYTES) throw Errors.tooLarge("Request body is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Errors.invalidJson();
  }
  return schema.parse(parsed);
}

export function parseQuery<T>(request: Request, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const params: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!(key in params)) params[key] = value;
  }
  return schema.parse(params);
}

export interface RouteContext<P> {
  request: Request;
  params: P;
  requestId: string;
}

type Segment<P> = { params: Promise<P> };

async function execute<P>(
  request: Request,
  resolveParams: (() => Promise<P>) | undefined,
  handler: (ctx: RouteContext<P>) => Promise<Response>,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
  const started = Date.now();
  const path = new URL(request.url).pathname;
  let response: Response;
  try {
    assertSameOrigin(request);
    const params = resolveParams ? await resolveParams() : ({} as P);
    response = await handler({ request, params, requestId });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logger.error("request_failed", {
        requestId,
        method: request.method,
        path,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    const headers: Record<string, string> = {};
    if (appError.code === "RATE_LIMITED" && typeof appError.details === "object" && appError.details !== null) {
      const retry = (appError.details as { retryAfterSeconds?: number }).retryAfterSeconds;
      if (retry) headers["retry-after"] = String(retry);
    }
    response = errorResponse(appError, headers);
  }
  response.headers.set("x-request-id", requestId);
  logger.info("request", {
    requestId,
    method: request.method,
    path,
    status: response.status,
    durationMs: Date.now() - started,
  });
  return response;
}

/**
 * Wrap a route handler with request ids, CSRF checks, structured logging and uniform error responses
 * ({ error, code, details }). Unknown errors become a generic 500 with no stack trace.
 */
export function route(handler: (ctx: RouteContext<Record<string, never>>) => Promise<Response>) {
  return (request: Request): Promise<Response> => execute(request, undefined, handler);
}

/** Same as `route`, for dynamic segments such as /api/products/[id]. */
export function paramRoute<P extends Record<string, string>>(handler: (ctx: RouteContext<P>) => Promise<Response>) {
  return (request: Request, segment: Segment<P>): Promise<Response> => execute(request, () => segment.params, handler);
}
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
