import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as serveUpload } from "@/app/api/uploads/[name]/route";
import { POST as upload } from "@/app/api/uploads/route";
import { db } from "@/server/db";
import { call, cookieFor, createUser, resetDb } from "./helpers";

interface ErrorBody { error: string; code: string }
interface UploadBody { url: string }

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const uploadDir = path.resolve("./tests/.tmp-uploads");

function formWith(bytes: Uint8Array, name = "pic.png", type = "image/png"): FormData {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name, { type }));
  return form;
}

let adminCookie: string;
let userCookie: string;

beforeEach(async () => {
  await resetDb();
  adminCookie = await cookieFor(await createUser({ role: "ADMIN" }));
  userCookie = await cookieFor(await createUser());
});
afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
  await db.$disconnect();
});

describe("POST /api/uploads", () => {
  it("is admin-only", async () => {
    expect((await call<ErrorBody>(upload, { method: "POST", form: formWith(PNG) })).status).toBe(401);
    expect((await call<ErrorBody>(upload, { method: "POST", form: formWith(PNG), cookie: userCookie })).status).toBe(403);
  });

  it("stores a valid image under a random name and serves it back safely", async () => {
    const res = await call<UploadBody>(upload, { method: "POST", form: formWith(PNG, "../../evil name.png"), cookie: adminCookie });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/api\/uploads\/[a-f0-9-]{36}\.png$/);
    expect(res.body.url).not.toContain("evil");

    const name = res.body.url.split("/").pop() ?? "";
    const response = await serveUpload(new Request(`http://localhost${res.body.url}`), { params: Promise.resolve({ name }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it("detects the real type: a script renamed .png is rejected", async () => {
    const script = new TextEncoder().encode("<script>alert(1)</script>");
    const res = await call<ErrorBody>(upload, { method: "POST", form: formWith(script, "x.png", "image/png"), cookie: adminCookie });
    expect(res.status).toBe(415);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await call<ErrorBody>(upload, { method: "POST", form: formWith(svg, "x.svg", "image/svg+xml"), cookie: adminCookie })).status).toBe(415);
  });

  it("rejects empty, oversize and missing files", async () => {
    expect((await call<ErrorBody>(upload, { method: "POST", form: formWith(new Uint8Array(0)), cookie: adminCookie })).status).toBe(400);
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await call<ErrorBody>(upload, { method: "POST", form: formWith(big), cookie: adminCookie })).status).toBe(413);
    const empty = new FormData();
    expect((await call<ErrorBody>(upload, { method: "POST", form: empty, cookie: adminCookie })).status).toBe(400);
  });

  it("rejects non-multipart requests", async () => {
    const res = await call<ErrorBody>(upload, { method: "POST", body: { file: "x" }, cookie: adminCookie });
    expect(res.status).toBe(415);
  });
});

describe("GET /api/uploads/:name", () => {
  it.each(["../../package.json", "..%2F..%2F.env", "not-a-uuid.png", "123e4567-e89b-12d3-a456-426614174000.exe", ".env"])(
    "refuses %s",
    async (name) => {
      const res = await serveUpload(new Request("http://localhost/api/uploads/x"), { params: Promise.resolve({ name }) });
      expect(res.status).toBe(404);
    },
  );

  it("returns 404 for a well-formed name that does not exist", async () => {
    const res = await serveUpload(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({ name: "123e4567-e89b-12d3-a456-426614174000.png" }),
    });
    expect(res.status).toBe(404);
  });
});
