import type { AdminOperationsClient } from "@altyn-market/client";
import { kzt } from "@altyn-market/domain";
import { e2eConfig } from "../config.js";
import { loginWithOtp } from "./api.js";

export interface SeedResult {
  readonly categoryId: string;
  readonly productIds: readonly string[];
  readonly pickerId: string;
  readonly courierId: string;
  readonly pickerIosId: string;
  readonly courierIosId: string;
  readonly pickerWebId: string;
  readonly courierWebId: string;
}

const ensureStaff = async (
  admin: AdminOperationsClient,
  phone: string,
  displayName: string,
  role: "picker" | "courier",
): Promise<string> => {
  const profiles = await admin.listStaffProfiles();
  const existing = profiles.find(
    (profile) => profile.displayName === displayName,
  );
  if (existing) {
    if (!existing.isActive) {
      throw new Error(
        `Seed staff "${displayName}" exists but is deactivated; reactivate it manually.`,
      );
    }
    return existing.id;
  }
  const created = await admin.createStaffProfile({
    phone,
    displayName,
    roles: [role],
  });
  return created.id;
};

export const ensureSeedData = async (
  admin: AdminOperationsClient,
): Promise<SeedResult> => {
  const pickerId = await ensureStaff(
    admin,
    e2eConfig.pickerPhone,
    e2eConfig.pickerName,
    "picker",
  );
  const courierId = await ensureStaff(
    admin,
    e2eConfig.courierPhone,
    e2eConfig.courierName,
    "courier",
  );
  const pickerIosId = await ensureStaff(
    admin,
    e2eConfig.pickerPhoneIos,
    e2eConfig.pickerNameIos,
    "picker",
  );
  const courierIosId = await ensureStaff(
    admin,
    e2eConfig.courierPhoneIos,
    e2eConfig.courierNameIos,
    "courier",
  );
  const pickerWebId = await ensureStaff(
    admin,
    e2eConfig.pickerPhoneWeb,
    e2eConfig.pickerNameWeb,
    "picker",
  );
  const courierWebId = await ensureStaff(
    admin,
    e2eConfig.courierPhoneWeb,
    e2eConfig.courierNameWeb,
    "courier",
  );

  const categories = await admin.listCategories();
  let category = categories.find(
    (candidate) => candidate.slug === e2eConfig.categorySlug,
  );
  category ??= await admin.createCategory({
    name: e2eConfig.categoryName,
    slug: e2eConfig.categorySlug,
    sortOrder: 900,
    isActive: true,
  });

  const catalog = await admin.listProducts();
  const productIds: string[] = [];
  for (const seedProduct of e2eConfig.products) {
    const existing = catalog.find(
      (entry) => entry.product.name === seedProduct.name,
    );
    if (existing) {
      if (!existing.availability.isAvailable || !existing.product.isActive) {
        await admin.updateProduct(existing.product.id, { isActive: true });
        await admin.updateProductAvailability(existing.product.id, {
          isAvailable: true,
        });
      }
      productIds.push(existing.product.id);
      continue;
    }
    const created = await admin.createProduct({
      categoryId: category.id,
      name: seedProduct.name,
      description: "Seeded by e2e automation. Safe to ignore.",
      unit: seedProduct.unit,
      isActive: true,
      customerPrice: kzt(seedProduct.priceTenge),
      isAvailable: true,
    });
    productIds.push(created.product.id);
  }

  // Logging in creates the customer accounts if they do not exist yet.
  await loginWithOtp(e2eConfig.customerPhone);
  await loginWithOtp(e2eConfig.customerPhoneIos);
  await loginWithOtp(e2eConfig.customerPhoneWeb);

  return {
    categoryId: category.id,
    productIds,
    pickerId,
    courierId,
    pickerIosId,
    courierIosId,
    pickerWebId,
    courierWebId,
  };
};
