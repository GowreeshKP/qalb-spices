import type { Product, User } from "@prisma/client";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { outbox } from "@/server/mailer";
import { resetAllRateLimits } from "@/server/rate-limit";

export const ORIGIN = "http://localhost";

type Handler<P> = (request: Request, segment: { params: Promise<P> }) => Promise<Response>;

export interface CallOptions<P> {
  method?: string;
  path?: string;
  body?: unknown;
  form?: FormData;
  cookie?: string | null;
  headers?: Record<string, string>;
  params?: P;
  /** Set false to simulate a request with no Origin header. */
  origin?: string | false;
  rawBody?: string;
}

export interface CallResult<T> {
  status: number;
  body: T;
  headers: Headers;
  cookie: string | null;
}

/** Invoke a route handler directly with a real Request. */
export async function call<T = Record<string, unknown>, P = Record<string, never>>(
  handler: Handler<P>,
  options: CallOptions<P> = {},
): Promise<CallResult<T>> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.origin !== false && method !== "GET") headers.set("origin", options.origin ?? ORIGIN);
  if (options.cookie) headers.set("cookie", options.cookie);

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.rawBody !== undefined) {
    body = options.rawBody;
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }

  const request = new Request(`${ORIGIN}${options.path ?? "/api/test"}`, { method, headers, body });
  const response = await handler(request, { params: Promise.resolve(options.params ?? ({} as P)) });
  const text = await response.text();
  const setCookie = response.headers.get("set-cookie");
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    headers: response.headers,
    cookie: setCookie ? (setCookie.split(";")[0] ?? null) : null,
  };
}

export async function resetDb(): Promise<void> {
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cartItem.deleteMany();
  await db.passwordResetToken.deleteMany();
  await db.session.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany();
  resetAllRateLimits();
  outbox.length = 0;
}

let counter = 0;

export const PASSWORD = "Correct-horse-9";

export async function createUser(overrides: Partial<{ email: string; name: string; role: "USER" | "ADMIN"; password: string }> = {}): Promise<User> {
  counter += 1;
  return db.user.create({
    data: {
      email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
      name: overrides.name ?? `User ${counter}`,
      role: overrides.role ?? "USER",
      passwordHash: await hashPassword(overrides.password ?? PASSWORD),
    },
  });
}

/** Create a session directly and return a Cookie header value. */
export async function cookieFor(user: User): Promise<string> {
  const { createSession, SESSION_COOKIE } = await import("@/server/auth/session");
  const { token } = await createSession(user.id);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

export async function createProduct(overrides: Partial<Omit<Product, "id" | "createdAt" | "updatedAt" | "version">> = {}): Promise<Product> {
  counter += 1;
  return db.product.create({
    data: {
      slug: overrides.slug ?? `product-${counter}-${Date.now()}`,
      name: overrides.name ?? `Product ${counter}`,
      description: overrides.description ?? "A very fine spice for testing.",
      category: overrides.category ?? "whole",
      flavour: overrides.flavour ?? "",
      packSize: overrides.packSize ?? "50 g",
      priceCents: overrides.priceCents ?? 10000,
      stock: overrides.stock ?? 10,
      status: overrides.status ?? "ACTIVE",
      imageUrl: overrides.imageUrl ?? null,
    },
  });
}

export const checkoutBody = (key: string) => ({
  shippingName: "Asha Rao",
  shippingAddress: "12 Spice Lane",
  shippingCity: "Kochi",
  shippingPostal: "682001",
  idempotencyKey: key,
});
