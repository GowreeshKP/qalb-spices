import { expect, test } from "@playwright/test";
import { login, SEEDED_USER } from "./support";

test.describe("browsing the catalogue", () => {
  test("lists active products and hides archived ones", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "Black pepper, whole" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "QALB garam masala" })).toBeVisible();
    await expect(page.getByText("Mace blades")).toHaveCount(0);
    await expect(page.getByTestId("result-count")).toHaveText(/^7 spices/);
  });

  test("search narrows results and the empty state offers a way out", async ({ page }) => {
    await page.goto("/shop");
    await page.getByLabel("Search").fill("cardamom");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=cardamom/);
    await expect(page.getByTestId("product-card")).toHaveCount(2); // cardamom + garam masala (mentions cardamom)
    await expect(page.getByTestId("result-count")).toContainText("match your filters");

    await page.getByLabel("Search").fill("zzzz-not-a-spice");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("heading", { name: "No spices found" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });

  test("filters by category", async ({ page }) => {
    await page.goto("/shop");
    const tabs = page.getByRole("navigation", { name: "Categories" });
    await expect(tabs.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");

    await tabs.getByRole("link", { name: "Blend" }).click();
    await expect(page).toHaveURL(/category=blend/);
    await expect(page.getByTestId("product-card")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "QALB garam masala" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Blend" })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current", "page");
  });

  test("category tabs keep the search, sort and go back to the full list", async ({ page }) => {
    await page.goto("/shop?q=cardamom&sort=name");
    const tabs = page.getByRole("navigation", { name: "Categories" });
    await tabs.getByRole("link", { name: "Whole" }).click();
    await expect(page).toHaveURL(/q=cardamom/);
    await expect(page).toHaveURL(/category=whole/);
    await expect(page).toHaveURL(/sort=name/);

    await tabs.getByRole("link", { name: "All" }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByTestId("product-card")).toHaveCount(2);
  });

  test("search keeps the chosen category", async ({ page }) => {
    await page.goto("/shop?category=whole");
    await page.getByLabel("Search").fill("pepper");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/category=whole/);
    await expect(page).toHaveURL(/q=pepper/);
  });

  test("content below the fold is revealed as you scroll", async ({ page }) => {
    await page.goto("/");
    const story = page.getByRole("heading", { name: "A standard of quality" });
    await story.scrollIntoViewIfNeeded();
    await expect(story.locator("xpath=..")).toHaveAttribute("data-reveal", "shown");
  });

  test("sorts by price", async ({ page }) => {
    await page.goto("/shop");
    await page.getByLabel("Sort by").selectOption("price_asc");
    await page.getByRole("button", { name: "Apply" }).click();
    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toContainText("Turmeric powder"); // cheapest seeded item
    await page.goto("/shop?sort=price_desc");
    await expect(page.getByTestId("product-card").first()).toContainText("Green cardamom");
  });

  test("paginates and keeps filters in the links", async ({ page }) => {
    await page.goto("/shop?pageSize=3&sort=name");
    await expect(page.getByTestId("product-card")).toHaveCount(3);
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/sort=name/);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
  });

  test("bad query parameters fall back to defaults instead of breaking the page", async ({ page }) => {
    const response = await page.goto("/shop?page=-5&sort=drop-table&pageSize=9999");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Shop spices" })).toBeVisible();
  });
});

test.describe("product pages", () => {
  test("shows details, price and stock status", async ({ page }) => {
    await page.goto("/shop/cloves-whole");
    await expect(page.getByRole("heading", { name: "Cloves, whole" })).toBeVisible();
    await expect(page.getByTestId("product-price")).toContainText("279.00");
    await expect(page.getByText("Only 3 left")).toBeVisible();
  });

  test("unknown and archived products show the 404 page", async ({ page }) => {
    const missing = await page.goto("/shop/does-not-exist");
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    const archived = await page.goto("/shop/old-season-mace");
    expect(archived?.status()).toBe(404);
  });

  test("a guest who tries to buy is sent to log in, then returned to the product", async ({ page }) => {
    await page.goto("/shop/turmeric-powder");
    await page.getByRole("button", { name: "Log in to buy" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fshop%2Fturmeric-powder/);
    await page.getByLabel("Email address").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/shop\/turmeric-powder$/);
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
  });

  test("stock limits are enforced in the add-to-cart control", async ({ page }) => {
    await login(page, SEEDED_USER.email, SEEDED_USER.password);
    // Start from a clean cart for the seeded customer.
    await page.goto("/cart");
    while ((await page.getByRole("button", { name: /^Remove / }).count()) > 0) {
      await page.getByRole("button", { name: /^Remove / }).first().click();
      await page.waitForTimeout(300);
    }

    await page.goto("/shop/cloves-whole");
    await page.getByLabel("Quantity").fill("50");
    await expect(page.getByLabel("Quantity")).toHaveValue("3"); // clamped to the 3 in stock
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible();

    // A second add would exceed stock; the server says no and the UI shows why.
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Only 3 left in stock" })).toBeVisible();

    await page.goto("/cart");
    await page.getByRole("button", { name: "Remove Cloves, whole" }).click();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });
});
