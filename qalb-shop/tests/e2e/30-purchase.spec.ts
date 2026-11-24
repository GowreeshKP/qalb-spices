import { expect, test, type Page } from "@playwright/test";
import { fillCheckout, signUp, uniqueEmail } from "./support";

async function addToCart(page: Page, slug: string, quantity = 1): Promise<void> {
  await page.goto(`/shop/${slug}`);
  await page.getByLabel("Quantity").fill(String(quantity));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
}

test.describe("cart and checkout", () => {
  test("an empty cart explains itself", async ({ page }) => {
    await signUp(page, "Empty Cart", uniqueEmail());
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText(/\(0\)/);
  });

  test("full journey: add, adjust, check out, view and cancel the order", async ({ page }) => {
    await signUp(page, "Asha Rao", uniqueEmail());

    await addToCart(page, "turmeric-powder", 2);
    await expect(page.getByTestId("cart-count")).toHaveText(/\(2\)/);
    await addToCart(page, "red-chilli", 1);
    await expect(page.getByTestId("cart-count")).toHaveText(/\(3\)/);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    // 2 x 199.00 + 1 x 229.00
    await expect(page.getByTestId("cart-total")).toContainText("627.00");

    // Quantity change updates the total immediately and persists.
    await page.getByLabel("Qty").first().fill("3");
    await expect(page.getByTestId("cart-total")).toContainText("826.00");
    await page.reload();
    await expect(page.getByTestId("cart-total")).toContainText("826.00");

    // Removing a line works too; then put it back.
    await page.getByRole("button", { name: "Remove Red chilli" }).click();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-total")).toContainText("597.00");

    // Checkout validation
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText("Full name must be at least 2 characters")).toBeVisible();
    await expect(page.getByText("Address must be at least 5 characters")).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);

    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/\/orders\/[^/?]+\?placed=1$/);
    await expect(page.getByText("Thank you. Your order has been placed.")).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText(/Placed/);
    await expect(page.getByTestId("order-total")).toContainText("597.00");
    await expect(page.getByText("12 Spice Lane, Kochi 682001")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText(/\(0\)/);

    await page.goto("/orders");
    await expect(page.getByTestId("order-row")).toHaveCount(1);
    await page.getByTestId("order-row").getByRole("link").click();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByTestId("order-status")).toHaveText(/Cancelled/);
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  });

  test("double-clicking Place order creates exactly one order", async ({ page }) => {
    await signUp(page, "Double Clicker", uniqueEmail());
    await addToCart(page, "black-pepper-whole", 1);
    await page.goto("/cart");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).dblclick();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\?placed=1$/);

    await page.goto("/orders");
    await expect(page.getByTestId("order-row")).toHaveCount(1);
  });

  test("stock removed by someone else shows a friendly error and keeps the cart", async ({ page, browser }) => {
    await signUp(page, "Slow Shopper", uniqueEmail());
    await addToCart(page, "cloves-whole", 3);

    // A second customer buys the cloves first (3 in stock).
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, "Fast Shopper", uniqueEmail());
    await addToCart(otherPage, "cloves-whole", 3);
    await otherPage.goto("/cart");
    await fillCheckout(otherPage);
    await otherPage.getByRole("button", { name: "Place order" }).click();
    await expect(otherPage).toHaveURL(/placed=1/);

    await page.goto("/cart");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Not enough stock for Cloves, whole" })).toBeVisible();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);

    // Put the cloves back for the rest of the suite: the other customer cancels.
    otherPage.once("dialog", (dialog) => void dialog.accept());
    await otherPage.getByRole("link", { name: "Orders", exact: true }).click();
    await otherPage.getByTestId("order-row").getByRole("link").click();
    await otherPage.getByRole("button", { name: "Cancel order" }).click();
    await expect(otherPage.getByTestId("order-status")).toHaveText(/Cancelled/);
    await other.close();
  });

  test("customers cannot see each other's orders", async ({ page, browser }) => {
    await signUp(page, "Order Owner", uniqueEmail());
    await addToCart(page, "turmeric-powder", 1);
    await page.goto("/cart");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/placed=1/);
    const orderUrl = page.url().split("?")[0] ?? "";

    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await signUp(strangerPage, "Stranger", uniqueEmail());
    const response = await strangerPage.goto(orderUrl);
    expect(response?.status()).toBe(404);
    await expect(strangerPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await stranger.close();
  });
});
