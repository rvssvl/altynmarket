import { expect, test } from "@playwright/test";
import { e2eConfig } from "../../config.js";

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("altyn-market-admin-locale", "en");
  });
});

// The page re-renders (wiping form input) when the async backend status check
// completes — wait for it to settle before typing.
const waitForBackendStatus = async (page: import("@playwright/test").Page) => {
  await expect(
    page.locator("button[data-action='refresh-backend']"),
  ).toContainText(/online|offline/i, { timeout: 15000 });
};

test("admin signs in with phone and OTP", async ({ page }) => {
  await page.goto("/");
  await waitForBackendStatus(page);
  await page.locator("#phone").fill(e2eConfig.superAdminPhone);
  await page
    .locator("form[data-action='request-otp'] button[type='submit']")
    .click();

  await expect(page.locator("#code")).toBeVisible();
  await page.locator("#code").fill(e2eConfig.devOtp);
  await page
    .locator("form[data-action='verify-otp'] button[type='submit']")
    .click();

  await expect(page.locator("nav.nav")).toBeVisible();
  await expect(page.locator("button[data-action='logout']")).toBeVisible();
});

test("wrong OTP code keeps the visitor signed out", async ({ page }) => {
  await page.goto("/");
  await waitForBackendStatus(page);
  await page.locator("#phone").fill(e2eConfig.superAdminPhone);
  await page
    .locator("form[data-action='request-otp'] button[type='submit']")
    .click();

  await expect(page.locator("#code")).toBeVisible();
  await page.locator("#code").fill("000000");
  await page
    .locator("form[data-action='verify-otp'] button[type='submit']")
    .click();

  await expect(page.locator(".error")).toBeVisible();
  await expect(page.locator("nav.nav")).toHaveCount(0);
});
