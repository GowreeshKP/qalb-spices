import { expect, test } from "@playwright/test";
import { ADMIN, fillCheckout, login, signUp, uniqueEmail } from "./support";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function adminRow(page: import("@playwright/test").Page, name: string) {
  return page.getByTestId("admin-product-row").filter({ hasText: name });
}

test.describe("admin product management", () => {
  test("create, edit, archive, restore and delete a product", async ({ page }) => {
    const name = `E2E Saffron ${Date.now()}`;
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");

    // Create (with validation first)
    await page.getByRole("link", { name: "Add product" }).click();
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Name must be at least 2 characters")).toBeVisible();
    await expect(page.getByText("Enter a price like 349.00")).toBeVisible();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill("Delicate crimson threads with a honeyed aroma.");
    await page.getByLabel("Category").selectOption("whole");
    await page.getByLabel("Price (INR)").fill("1250.50");
    await page.getByLabel("Stock").fill("12");
    await page.getByLabel("Flavour notes").fill("Floral, honeyed");
    await page.getByLabel("Pack size").fill("2 g");
    await page.getByLabel("Product image").setInputFiles({ name: "saffron.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByAltText("Current product")).toBeVisible();
    await page.getByRole("button", { name: "Create product" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await page.getByLabel("Search").fill(name);
    await page.getByRole("button", { name: "Filter" }).click();
    const row = adminRow(page, name);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("1,250.50");
    await expect(row.getByTestId("product-status")).toHaveText("Active");

    // Visible in the public shop, with its uploaded image
    await page.goto(`/shop?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const src = await page.getByTestId("product-card").getByRole("img").first().getAttribute("src");
    expect(src).toMatch(/^\/api\/uploads\/[a-f0-9-]{36}\.png$/);
    const image = await page.request.get(src ?? "");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");

    // Edit
    await page.goto(`/admin?q=${encodeURIComponent(name)}`);
    await page.getByRole("link", { name: `Edit ${name}` }).click();
    await page.getByLabel("Price (INR)").fill("999.00");
    await page.getByLabel("Stock").fill("-4");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Stock cannot be negative")).toBeVisible();
    await page.getByLabel("Stock").fill("7");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin?q=${encodeURIComponent(name)}`);
    await expect(adminRow(page, name)).toContainText("999.00");

    // Archive: status flips at once and the product leaves the shop
    await page.getByRole("button", { name: `Archive ${name}` }).click();
    await expect(adminRow(page, name).getByTestId("product-status")).toHaveText("Archived");
    await page.goto(`/shop?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("heading", { name: "No spices found" })).toBeVisible();

    // Admin status filter still finds it; restore brings it back
    await page.goto(`/admin?status=ARCHIVED&q=${encodeURIComponent(name)}`);
    await expect(adminRow(page, name)).toHaveCount(1);
    await page.getByRole("button", { name: `Restore ${name}` }).click();
    await expect(adminRow(page, name).getByTestId("product-status")).toHaveText("Active");
    await page.goto(`/shop?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Delete
    await page.goto(`/admin?q=${encodeURIComponent(name)}`);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(adminRow(page, name)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No products match" })).toBeVisible();
  });

  test("rejects a non-image upload", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/products/new");
    await page.getByLabel("Product image").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
    await expect(page.getByText("Only PNG, JPEG or WebP images are allowed")).toBeVisible();
    await expect(page.getByAltText("Current product")).toHaveCount(0);
  });

  test("admin search and filters narrow the product table", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");
    await expect(page.getByTestId("result-count")).toHaveText(/^8 products/);

    await page.getByLabel("Status").selectOption("ARCHIVED");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("admin-product-row")).toHaveCount(1);
    await expect(page.getByTestId("admin-product-row")).toContainText("Mace blades");

    await page.goto("/admin?pageSize=3");
    await expect(page.getByTestId("admin-product-row")).toHaveCount(3);
  });

  test("a product that has been ordered cannot be deleted, only archived", async ({ page, browser }) => {
    // A customer orders a seeded product.
    const customer = await browser.newContext();
    const customerPage = await customer.newPage();
    await signUp(customerPage, "Buyer", uniqueEmail());
    await customerPage.goto("/shop/cinnamon-quills");
    await customerPage.getByRole("button", { name: "Add to cart" }).click();
    await expect(customerPage.getByText("Added to your cart.")).toBeVisible();
    await customerPage.goto("/cart");
    await fillCheckout(customerPage);
    await customerPage.getByRole("button", { name: "Place order" }).click();
    await expect(customerPage).toHaveURL(/placed=1/);
    await customer.close();

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin?q=Cinnamon");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete Cinnamon quills" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "appears in past orders" })).toBeVisible();
    await expect(adminRow(page, "Cinnamon quills")).toHaveCount(1);
  });
});

test.describe("admin order management", () => {
  test("an admin ships an order and the customer sees the new status; shipped orders can no longer be cancelled", async ({ page, browser }) => {
    const email = uniqueEmail("ship");
    const customer = await browser.newContext();
    const customerPage = await customer.newPage();
    await signUp(customerPage, "Ship Me", email);
    await customerPage.goto("/shop/green-cardamom");
    await customerPage.getByRole("button", { name: "Add to cart" }).click();
    await expect(customerPage.getByText("Added to your cart.")).toBeVisible();
    await customerPage.goto("/cart");
    await fillCheckout(customerPage);
    await customerPage.getByRole("button", { name: "Place order" }).click();
    await expect(customerPage).toHaveURL(/placed=1/);
    await expect(customerPage.getByRole("button", { name: "Cancel order" })).toBeVisible();

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/orders");
    const row = page.getByTestId("admin-order-row").filter({ hasText: email });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("order-status")).toHaveText(/Placed/);
    await row.getByRole("combobox").selectOption("SHIPPED");
    await expect(row.getByTestId("order-status")).toHaveText(/Shipped/);

    // Only forward moves remain
    await expect(row.getByRole("combobox").locator("option")).toHaveText(["Update...", "Delivered", "Cancelled"]);

    await customerPage.reload();
    await expect(customerPage.getByTestId("order-status")).toHaveText(/Shipped/);
    await expect(customerPage.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

    await row.getByRole("combobox").selectOption("DELIVERED");
    await expect(row.getByTestId("order-status")).toHaveText(/Delivered/);
    await expect(row.getByText("Final")).toBeVisible();

    // Status filter
    await page.getByLabel("Status", { exact: true }).selectOption("DELIVERED");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/status=DELIVERED/);
    await expect(page.getByTestId("admin-order-row").filter({ hasText: email })).toHaveCount(1);
    await customer.close();
  });
});
