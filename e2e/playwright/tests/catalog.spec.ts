import { expect, test } from "@playwright/test";
import { e2eConfig } from "../../config.js";

test("admin creates, deactivates and deletes a product", async ({ page }) => {
  const productName = `E2E Temp ${Date.now()}`;

  await page.goto("/");
  await page
    .locator("button[data-action='module'][data-module='catalog']")
    .click();
  // The whole page re-renders when the initial data load finishes, wiping any
  // form input typed before that — wait for seeded catalog rows first.
  await expect(page.locator("tr", { hasText: "E2E Apples" })).toBeVisible();

  await page.locator("button[data-action='new-product']").click();
  const form = page.locator("form[data-action='create-product']");
  await form.locator("input[name='name']").fill(productName);
  await form
    .locator("select[name='categoryId']")
    .selectOption({ label: e2eConfig.categoryName });
  await form.locator("select[name='unit']").selectOption("piece");
  await form.locator("input[name='customerPrice']").fill("500");
  await form.locator("button[type='submit']").click();
  await expect(form).toHaveCount(0);

  const search = page.locator("input[data-search-scope='catalog-products']");
  await search.fill(productName);
  const row = page.locator("tr", { hasText: productName });
  await expect(row).toHaveCount(1);

  await row.locator("button[data-action='toggle-product-active']").click();
  await expect(
    page.locator("tr", { hasText: productName }),
  ).toContainText(/inactive/i);

  await page
    .locator("tr", { hasText: productName })
    .locator("button[data-action='request-delete-product']")
    .click();
  await page
    .locator("button[data-action='confirm-delete-catalog-item']")
    .click();
  await expect(page.locator("tr", { hasText: productName })).toHaveCount(0);
});
