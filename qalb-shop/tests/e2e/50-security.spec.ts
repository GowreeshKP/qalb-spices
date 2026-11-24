import { expect, test } from "@playwright/test";
import { SEEDED_USER, login } from "./support";

const ORIGIN = "http://localhost:3100";

test.describe("API protection", () => {
  test("health check is public and reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: "up" });
  });

  test("unauthenticated API calls get 401 with the standard error shape", async ({ request }) => {
    for (const [method, url] of [
      ["GET", "/api/cart"],
      ["GET", "/api/orders"],
      ["GET", "/api/auth/me"],
    ] as const) {
      const res = await request.fetch(url, { method });
      expect(res.status(), url).toBe(401);
      expect(await res.json()).toEqual({ error: "You need to log in to do that", code: "UNAUTHENTICATED" });
    }
    const create = await request.post("/api/products", {
      headers: { origin: ORIGIN },
      data: { name: "Nope" },
    });
    expect(create.status()).toBe(401);
  });

  test("customers get 403 on admin endpoints", async ({ page }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    const res = await page.request.post("/api/products", {
      headers: { origin: ORIGIN },
      data: { name: "Hacked spice", description: "Should never exist.", category: "whole", priceCents: 100, stock: 1 },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");

    const orders = await page.request.get("/api/orders?scope=all");
    expect(orders.status()).toBe(403);
  });

  test("cross-site requests are rejected even with a valid session cookie (CSRF)", async ({ page }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    const forged = await page.request.patch("/api/profile", {
      headers: { origin: "https://evil.example" },
      data: { name: "Hijacked" },
    });
    expect(forged.status()).toBe(403);
    expect((await forged.json()).code).toBe("CSRF_REJECTED");

    const noOrigin = await page.request.patch("/api/profile", { data: { name: "Hijacked" } });
    expect(noOrigin.status()).toBe(403);

    await page.goto("/account");
    await expect(page.getByLabel("Full name")).not.toHaveValue("Hijacked");
  });

  test("the session cookie is HttpOnly and SameSite", async ({ page, context }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    const cookie = (await context.cookies()).find((c) => c.name === "qalb_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    const visibleToScripts = await page.evaluate(() => document.cookie);
    expect(visibleToScripts).not.toContain("qalb_session");
  });

  test("a logged-out session cannot be reused", async ({ page, context }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    const stolen = (await context.cookies()).find((c) => c.name === "qalb_session");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

    const replay = await page.request.get("/api/auth/me", { headers: { cookie: `qalb_session=${stolen?.value ?? ""}` } });
    expect(replay.status()).toBe(401);
  });
});

test.describe("hardening", () => {
  test("security headers are sent", async ({ request }) => {
    const res = await request.get("/shop");
    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["strict-transport-security"]).toBeDefined();
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("markup in the search box is shown as text and never executes", async ({ page }) => {
    let dialogSeen = false;
    page.on("dialog", () => {
      dialogSeen = true;
    });
    await page.goto(`/shop?q=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    await expect(page.getByRole("heading", { name: "No spices found" })).toBeVisible();
    await expect(page.getByLabel("Search")).toHaveValue("<img src=x onerror=alert(1)>");
    expect(dialogSeen).toBe(false);
  });

  test("API errors never include stack traces", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      headers: { origin: ORIGIN, "content-type": "application/json" },
      data: Buffer.from("{broken json"),
    });
    expect(res.status()).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    expect(JSON.parse(text)).toEqual({ error: "Request body must be valid JSON", code: "INVALID_JSON" });
  });

  test("path traversal on the uploads route is refused", async ({ request }) => {
    for (const name of ["..%2F..%2Fpackage.json", "%2e%2e/%2e%2e/.env", "x.png"]) {
      const res = await request.get(`/api/uploads/${name}`);
      expect(res.status(), name).toBe(404);
    }
  });
});
