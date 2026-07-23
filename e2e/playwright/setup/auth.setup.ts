import { test as setup } from "@playwright/test";
import { e2eConfig } from "../../config.js";
import { adminClient, loginWithOtp } from "../../lib/api.js";
import { ensureSeedData } from "../../lib/seed.js";
import { adminStorageState } from "../playwright.config.js";

setup("seed data and store an admin session", async ({ page }) => {
  const admin = await adminClient();
  await ensureSeedData(admin);

  const session = await loginWithOtp(e2eConfig.superAdminPhone);
  await page.goto("/");
  await page.evaluate((sessionJson) => {
    window.localStorage.setItem("altyn-market-admin-session", sessionJson);
    window.localStorage.setItem("altyn-market-admin-locale", "en");
  }, JSON.stringify(session));
  await page.context().storageState({ path: adminStorageState });
});
