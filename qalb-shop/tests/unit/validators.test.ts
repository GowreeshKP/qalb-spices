import { describe, expect, it } from "vitest";
import {
  checkoutSchema,
  cleanText,
  createProductSchema,
  imageUrlSchema,
  listProductsQuerySchema,
  loginSchema,
  passwordSchema,
  signupSchema,
  updateProductSchema,
} from "@/lib/validators";

describe("cleanText", () => {
  it("trims and removes control characters but keeps newlines", () => {
    expect(cleanText("  hello\u0000 wor\u0007ld\n!  ")).toBe("hello world\n!");
  });
});

describe("passwordSchema", () => {
  it.each([
    ["short1A", false],
    ["longbutnonumbers", false],
    ["1234567890123", false],
    ["Correct-horse-9", true],
  ])("%s -> valid=%s", (value, valid) => {
    expect(passwordSchema.safeParse(value).success).toBe(valid);
  });

  it("rejects absurdly long passwords (bcrypt DoS guard)", () => {
    expect(passwordSchema.safeParse("a1".repeat(100)).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("normalises email to lowercase and trims the name", () => {
    const result = signupSchema.parse({ name: "  Asha  ", email: "  ASHA@Example.COM ", password: "Sup3rsecret!!" });
    expect(result).toEqual({ name: "Asha", email: "asha@example.com", password: "Sup3rsecret!!" });
  });

  it("reports every invalid field", () => {
    const result = signupSchema.safeParse({ name: "A", email: "nope", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
    }
  });

  it("rejects non-string input without throwing", () => {
    expect(signupSchema.safeParse({ name: 5, email: {}, password: [] }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a password but does not enforce the signup policy", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("imageUrlSchema", () => {
  it.each([
    ["/images/cardamom.jpg", true],
    ["/api/uploads/123e4567-e89b-12d3-a456-426614174000.png", true],
    ["https://evil.example/pixel.png", false],
    ["javascript:alert(1)", false],
    ["//evil.example/x.png", false],
    ["/images/../secret", false],
    ["/api/uploads/../../etc/passwd", false],
  ])("%s -> %s", (value, valid) => {
    expect(imageUrlSchema.safeParse(value).success).toBe(valid);
  });
});

describe("product schemas", () => {
  const valid = {
    name: "Star anise",
    description: "Sweet, licorice-like whole stars.",
    category: "whole",
    priceCents: 12900,
    stock: 10,
  };

  it("applies defaults on create", () => {
    const parsed = createProductSchema.parse(valid);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.flavour).toBe("");
  });

  it.each([
    ["negative stock", { stock: -1 }],
    ["fractional price", { priceCents: 10.5 }],
    ["zero price", { priceCents: 0 }],
    ["unknown category", { category: "liquid" }],
    ["short description", { description: "tiny" }],
  ])("rejects %s", (_label, patch) => {
    expect(createProductSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("requires at least one field on update", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 3 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ stock: 4, version: 3 }).success).toBe(true);
  });
});

describe("listProductsQuerySchema", () => {
  it("applies defaults", () => {
    expect(listProductsQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 12, sort: "newest" });
  });

  it("coerces numeric strings", () => {
    expect(listProductsQuerySchema.parse({ page: "3", pageSize: "20" })).toMatchObject({ page: 3, pageSize: 20 });
  });

  it.each([{ page: "0" }, { page: "abc" }, { pageSize: "500" }, { sort: "random" }, { category: "x" }])(
    "rejects %o",
    (query) => {
      expect(listProductsQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it("treats empty strings from HTML forms as 'not provided'", () => {
    const parsed = listProductsQuerySchema.parse({ q: "", category: "", status: "", sort: "", page: "", pageSize: "" });
    expect(parsed).toMatchObject({ category: undefined, status: undefined, sort: "newest", page: 1, pageSize: 12 });
  });

  it("strips control characters and truncates the search term", () => {
    const parsed = listProductsQuerySchema.parse({ q: `  pep\u0000per${"x".repeat(200)}` });
    expect(parsed.q?.startsWith("pepper")).toBe(true);
    expect(parsed.q?.length).toBe(80);
  });
});

describe("checkoutSchema", () => {
  const base = {
    shippingName: "Asha Rao",
    shippingAddress: "12 Spice Lane",
    shippingCity: "Kochi",
    shippingPostal: "682001",
    idempotencyKey: "abc12345-key",
  };

  it("accepts a complete order", () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
  });

  it("rejects unsafe idempotency keys", () => {
    expect(checkoutSchema.safeParse({ ...base, idempotencyKey: "short" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, idempotencyKey: "has spaces and ;drop" }).success).toBe(false);
  });
});
