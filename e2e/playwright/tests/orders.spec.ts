import { expect, test } from "@playwright/test";
import { e2eConfig } from "../../config.js";
import { adminClient } from "../../lib/api.js";
import {
  createCustomerOrder,
  deliverOrder,
  pickOrder,
} from "../../lib/advance-order.js";

// Uses the web-only customer and staff accounts — the mobile Maestro jobs run
// concurrently in CI on their own accounts and must not be disturbed.
test("customer order reaches the board, gets assigned and delivered", async ({
  page,
}) => {
  const { order } = await createCustomerOrder(e2eConfig.customerPhoneWeb);
  const orderShortId = order.id.slice(0, 8);

  await page.goto("/");
  const row = page.locator("tr", { hasText: orderShortId });
  await expect(row).toBeVisible();

  await row
    .locator("form[data-action='assign-picker'] select[name='pickerId']")
    .selectOption({ label: e2eConfig.pickerNameWeb });
  await row
    .locator("form[data-action='assign-picker'] button[type='submit']")
    .click();
  await expect(page.locator(".notice")).toBeVisible();

  const admin = await adminClient();
  const staff = await admin.listStaffProfiles();
  const pickerId = staff.find(
    (profile) => profile.displayName === e2eConfig.pickerNameWeb,
  )?.id;
  const courierId = staff.find(
    (profile) => profile.displayName === e2eConfig.courierNameWeb,
  )?.id;
  if (!pickerId || !courierId) {
    throw new Error("Seeded web picker/courier profiles are missing.");
  }

  await pickOrder(admin, order.id, pickerId, e2eConfig.pickerPhoneWeb);
  await deliverOrder(admin, order.id, courierId, e2eConfig.courierPhoneWeb);

  await page.locator("button[data-action='refresh-data']").click();
  await expect(page.locator("tr", { hasText: orderShortId })).toContainText(
    /delivered/i,
  );
});
