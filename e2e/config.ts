export interface E2eProductSeed {
  readonly name: string;
  readonly unit: "kg" | "g" | "piece" | "bundle" | "box";
  readonly priceTenge: number;
}

export const e2eConfig = {
  apiBaseUrl: process.env.E2E_API_URL ?? "https://api-staging.altyn-market.kz",
  adminUrl: process.env.E2E_ADMIN_URL ?? "https://admin-staging.altyn-market.kz",
  superAdminPhone: process.env.E2E_SUPER_ADMIN_PHONE ?? "+77474150198",
  devOtp: process.env.E2E_DEV_OTP ?? "666999",
  customerPhone: "+77000000001",
  pickerPhone: "+77000000002",
  courierPhone: "+77000000003",
  pickerName: "E2E Picker",
  courierName: "E2E Courier",
  // The iOS and Android Maestro jobs run concurrently; each platform gets its
  // own accounts (staff only see their own assignments), so the jobs never
  // race for the same task or cart.
  customerPhoneIos: "+77000000011",
  pickerPhoneIos: "+77000000012",
  courierPhoneIos: "+77000000013",
  pickerNameIos: "E2E Picker iOS",
  courierNameIos: "E2E Courier iOS",
  // The Playwright suite runs concurrently with the mobile jobs in CI and
  // must not touch the mobile staff accounts either.
  customerPhoneWeb: "+77000000021",
  pickerPhoneWeb: "+77000000022",
  courierPhoneWeb: "+77000000023",
  pickerNameWeb: "E2E Picker Web",
  courierNameWeb: "E2E Courier Web",
  categoryName: "E2E Groceries",
  categorySlug: "e2e-groceries",
  products: [
    { name: "E2E Apples", unit: "kg", priceTenge: 990 },
    { name: "E2E Milk 1L", unit: "piece", priceTenge: 650 },
  ] as readonly E2eProductSeed[],
  checkoutAddress: {
    city: "Almaty",
    street: "E2E Test Street 1",
    apartment: "42",
    comment: "e2e automation order",
  },
} as const;
