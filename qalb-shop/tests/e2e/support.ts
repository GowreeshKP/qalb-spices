import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@qalb.test", password: "Admin#12345" };
export const SEEDED_USER = { email: "user@qalb.test", password: "User#12345" };
export const NEW_PASSWORD = "Sup3r-secret-pw";

let counter = 0;
export function uniqueEmail(prefix = "shopper"): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
}

export async function signUp(page: Page, name: string, email: string, password = NEW_PASSWORD): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/shop$/);
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
}

export async function fillCheckout(page: Page): Promise<void> {
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByLabel("Address").fill("12 Spice Lane");
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("Postal code").fill("682001");
}
