import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/api-client";
import { detectImageKind } from "@/lib/image-type";
import { cartTotal, centsToInput, formatMoney, lineTotal, parsePriceToCents } from "@/lib/money";
import { canCustomerCancel, canTransition, restocksOnTransition } from "@/lib/order-status";
import { buildPageMeta, skipFor } from "@/lib/pagination";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("money", () => {
  it("formats minor units", () => {
    expect(formatMoney(34900, "INR", "en-IN")).toContain("349.00");
  });

  it("throws on non-finite amounts", () => {
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
  });

  it.each([
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["0.99", 99],
    [" 349.00 ", 34900],
    ["-1", null],
    ["12.999", null],
    ["abc", null],
    ["", null],
    ["1e3", null],
  ])("parsePriceToCents(%j) = %s", (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });

  it("round-trips cents through the input format", () => {
    expect(parsePriceToCents(centsToInput(34905))).toBe(34905);
  });

  it("totals line items without floating point drift", () => {
    expect(lineTotal({ unitPriceCents: 1999, quantity: 3 })).toBe(5997);
    expect(cartTotal([])).toBe(0);
    expect(cartTotal([{ unitPriceCents: 10, quantity: 3 }, { unitPriceCents: 5, quantity: 1 }])).toBe(35);
  });
});

describe("slugify", () => {
  it.each([
    ["Black pepper, whole", "black-pepper-whole"],
    ["  Cardamom & Cloves!! ", "cardamom-and-cloves"],
    ["Crème brûlée spice", "creme-brulee-spice"],
    ["!!!", "item"],
    ["", "item"],
  ])("%j -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps length without leaving a trailing hyphen", () => {
    const slug = slugify("a ".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("finds the next free slug", async () => {
    const taken = new Set(["pepper", "pepper-2"]);
    expect(await uniqueSlug("pepper", async (s) => taken.has(s))).toBe("pepper-3");
    expect(await uniqueSlug("clove", async (s) => taken.has(s))).toBe("clove");
  });
});

describe("pagination", () => {
  it("computes meta with at least one page", () => {
    expect(buildPageMeta(1, 10, 0)).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
    expect(buildPageMeta(2, 10, 25)).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
  });

  it("computes skip and never goes negative", () => {
    expect(skipFor(1, 12)).toBe(0);
    expect(skipFor(3, 12)).toBe(24);
    expect(skipFor(0, 12)).toBe(0);
  });
});

describe("order status rules", () => {
  it("allows the forward path and cancellation before delivery", () => {
    expect(canTransition("PLACED", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition("PLACED", "CANCELLED")).toBe(true);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(true);
  });

  it("blocks skipping, going backwards and leaving terminal states", () => {
    expect(canTransition("PLACED", "DELIVERED")).toBe(false);
    expect(canTransition("SHIPPED", "PLACED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "PLACED")).toBe(false);
  });

  it("lets customers cancel only before shipping", () => {
    expect(canCustomerCancel("PLACED")).toBe(true);
    expect(canCustomerCancel("SHIPPED")).toBe(false);
    expect(canCustomerCancel("DELIVERED")).toBe(false);
  });

  it("restocks only when cancelling an undelivered order", () => {
    expect(restocksOnTransition("PLACED", "CANCELLED")).toBe(true);
    expect(restocksOnTransition("SHIPPED", "CANCELLED")).toBe(true);
    expect(restocksOnTransition("PLACED", "SHIPPED")).toBe(false);
  });
});

describe("detectImageKind", () => {
  it("recognises PNG, JPEG and WebP by magic bytes", () => {
    expect(detectImageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(detectImageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageKind(webp)).toBe("webp");
  });

  it("rejects text, SVG and truncated data", () => {
    expect(detectImageKind(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageKind(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageKind(new Uint8Array([]))).toBeNull();
  });
});

describe("safeNext", () => {
  it.each([
    ["/shop", "/shop"],
    ["/orders/abc?placed=1", "/orders/abc?placed=1"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%j -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
