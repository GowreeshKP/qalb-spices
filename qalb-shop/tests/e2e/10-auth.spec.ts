import { expect, test } from "@playwright/test";
import { ADMIN, NEW_PASSWORD, SEEDED_USER, login, logout, signUp, uniqueEmail } from "./support";

test.describe("access control for guests", () => {
  for (const path of ["/cart", "/orders", "/account", "/admin", "/admin/orders", "/admin/products/new"]) {
    test(`${path} redirects to login and remembers where you were going`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
      await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    });
  }

  test("the shop stays public", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "Shop spices" })).toBeVisible();
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });
});

test.describe("sign up, log in and log out", () => {
  test("a new customer can sign up, is logged in, and can log out and back in", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, "Asha Rao", email);
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await logout(page);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);

    await login(page, email, NEW_PASSWORD);
    // Visiting /login while logged in sends you straight to the requested page.
    await page.goto("/login?next=/orders");
    await expect(page).toHaveURL(/\/orders$/);
  });

  test("shows validation errors before sending anything", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Name must be at least 2 characters")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Password must be at least 10 characters").first()).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel("Full name").fill("Asha");
    await page.getByLabel("Email address").fill(uniqueEmail());
    await page.getByLabel("Password").fill("lettersonly!!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Password must contain a letter and a number")).toBeVisible();
  });

  test("rejects a duplicate email with a clear message", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Copycat");
    await page.getByLabel("Email address").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("wrong credentials show one generic error and keep you logged out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill("Wrong-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();

    await page.getByLabel("Email address").fill("nobody@example.com");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  });

  test("redirects back to the page you wanted after logging in", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login\?next=%2Forders/);
    await page.getByLabel("Email address").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  });

  test("refuses to redirect to another site (open redirect)", async ({ page }) => {
    await page.goto("/login?next=//evil.example/phish");
    await page.getByLabel("Email address").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
  });
});

test.describe("roles", () => {
  test("customers cannot open the admin area", async ({ page }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/\?forbidden=1$/);
    await expect(page.getByTestId("forbidden-notice")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/forbidden=1/);
  });

  test("admins see the admin area", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });
});

test.describe("account settings", () => {
  test("a customer can update their profile and change their password", async ({ page }) => {
    const email = uniqueEmail("settings");
    await signUp(page, "Before Name", email);
    await page.goto("/account");

    await page.getByLabel("Full name").fill("After Name");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    // Wrong current password is rejected with a field error.
    await page.getByLabel("Current password").fill("Not-my-password-1");
    await page.getByLabel("New password").fill("Another-pass-42");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Current password is incorrect")).toBeVisible();

    await page.getByLabel("Current password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password updated.")).toBeVisible();

    await logout(page);
    await login(page, email, "Another-pass-42");
  });

  test("forgot password gives the same answer for any email and the reset page rejects bad links", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("nobody-here@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that email, a reset link is on its way.")).toBeVisible();
    // Production mode never exposes the link in the UI.
    await expect(page.getByTestId("dev-reset-link")).toHaveCount(0);

    await page.goto("/reset-password");
    await expect(page.getByText("This reset link is missing its token.")).toBeVisible();

    await page.goto(`/reset-password?token=${"x".repeat(43)}`);
    await page.getByLabel("New password").fill("Brand-new-pass-9");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  });
});
