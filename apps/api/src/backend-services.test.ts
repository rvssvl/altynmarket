import { describe, expect, it } from "vitest";
import { brand, type AuthSession } from "@altyn-market/domain";
import { createAuthService } from "./auth-service.js";
import {
  createBackendServices,
  type BackendServices,
} from "./backend-services.js";
import { createInMemoryStore } from "./in-memory-store.js";
import { createMockPaymentProvider } from "./modules/payments.js";
import { createInMemoryRealtimeBus } from "./realtime.js";
import type { Store } from "./store.js";

const tomatoes = brand<string, "ProductId">(
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
);
const apples = brand<string, "ProductId">(
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
);

describe("auth service", () => {
  it("persists OTP challenges, sessions, refresh tokens, and device sessions", async () => {
    const { api } = createTestApi();
    const otp = await api.auth.requestOtp({ e164: "+77010000001" });

    expect(otp.devCode).toBe("111111");

    await expect(
      api.auth.verifyOtp({ e164: "+77010000001" }, "000000", "iPhone"),
    ).rejects.toThrow("Invalid OTP code");

    const session = await api.auth.verifyOtp(
      { e164: "+77010000001" },
      "111111",
      "iPhone",
    );
    expect(session.customer.phone.e164).toBe("+77010000001");
    expect(session.roles).toContain("customer");

    const current = await api.auth.getCurrentSession(session.accessToken);
    expect(current.customer.id).toBe(session.customer.id);

    const refreshed = await api.auth.refreshSession(session.refreshToken);
    expect(refreshed.accessToken).not.toBe(session.accessToken);

    await expect(
      api.auth.getCurrentSession(session.accessToken),
    ).rejects.toThrow("Session expired");
  });
});

describe("checkout and picking workflow", () => {
  it("checks out cart items, captures the recalculated picked total, records refund delta, and reports metrics", async () => {
    const { api, store, events } = createTestApi();
    const customer = await login(api, "+77010000002");
    await api.auth.createStaffProfile({
      phone: { e164: "+77010000003" },
      displayName: "Ops admin",
      roles: ["admin", "picker", "courier"],
    });
    const admin = await login(api, "+77010000003");

    await api.cart.addItem(customer, tomatoes, 2);
    await api.cart.addItem(customer, apples, 1);
    const checkout = await api.checkout.create(customer, {
      city: "Almaty",
      street: "Satpayev 1",
      apartment: "12",
    });

    expect(checkout.order.status).toBe("payment_authorized");
    expect(checkout.payment.status).toBe("authorized");
    expect((await api.cart.get(customer)).items).toHaveLength(0);

    if (!admin.staff) {
      throw new Error("Admin staff profile missing.");
    }

    const assigned = await api.admin.assignPicker(
      admin,
      checkout.order.id,
      admin.staff.id,
    );
    expect(assigned.status).toBe("assigned");

    await api.picking.startPicking(admin, checkout.order.id);
    const appleItem = checkout.order.items.find(
      (item) => item.productId === apples,
    );
    if (!appleItem) {
      throw new Error("Apple item missing.");
    }

    await api.picking.cancelItem(admin, {
      orderId: checkout.order.id,
      orderItemId: appleItem.id,
      reason: "bad_quality",
    });

    const completed = await api.picking.completePicking(
      admin,
      checkout.order.id,
    );
    const payment = await store.payments.getByOrderId(completed.id);
    const metrics = await api.admin.getMetrics(admin);

    expect(completed.status).toBe("payment_captured");
    expect(completed.finalTotal.amountMinor).toBe(320000);
    expect(payment?.status).toBe("captured");
    expect(payment?.capturedAmount?.amountMinor).toBe(320000);
    expect(metrics.orderCount).toBe(1);
    expect(metrics.refundAmount.amountMinor).toBe(72000);
    expect(events.some((event) => event.type === "payment.updated")).toBe(true);
  });

  it("enforces staff/admin RBAC on operational mutations", async () => {
    const { api } = createTestApi();
    const customer = await login(api, "+77010000004");

    await api.cart.addItem(customer, tomatoes, 1);
    const checkout = await api.checkout.create(customer, {
      city: "Almaty",
      street: "Abay 10",
    });

    await expect(
      api.picking.startPicking(customer, checkout.order.id),
    ).rejects.toThrow("Forbidden");
  });
});

describe("catalog deletion", () => {
  it("deletes an unused product and its empty category, then records both actions", async () => {
    const { api } = createTestApi();
    const admin = await createAdmin(api, "+77010000005");
    const category = await api.admin.createCategory(admin, {
      name: "Seasonal",
      slug: "seasonal",
      sortOrder: 40,
      isActive: true,
    });
    const product = await api.admin.createProduct(admin, {
      categoryId: category.id,
      name: "Apricots",
      unit: "kg",
      isActive: true,
      customerPrice: { amountMinor: 120000, currency: "KZT" },
      internalCost: { amountMinor: 80000, currency: "KZT" },
      isAvailable: true,
    });

    await api.admin.deleteProduct(admin, product.product.id);
    await api.admin.deleteCategory(admin, category.id);

    expect(
      (await api.admin.listCatalogProducts(admin)).find(
        (candidate) => candidate.product.id === product.product.id,
      ),
    ).toBeUndefined();
    expect(
      (await api.admin.listCategories(admin)).find(
        (candidate) => candidate.id === category.id,
      ),
    ).toBeUndefined();
    expect(
      (await api.admin.listAuditLog(admin)).map((entry) => entry.action),
    ).toEqual(
      expect.arrayContaining(["admin.product_delete", "admin.category_delete"]),
    );
  });

  it("keeps catalog history intact by blocking unsafe deletions", async () => {
    const { api } = createTestApi();
    const admin = await createAdmin(api, "+77010000006");
    const customer = await login(api, "+77010000007");

    await api.cart.addItem(customer, tomatoes, 1);
    await api.checkout.create(customer, {
      city: "Almaty",
      street: "Abay 10",
    });

    await expect(api.admin.deleteProduct(admin, tomatoes)).rejects.toThrow(
      "A product with order history cannot be deleted",
    );
    await expect(
      api.admin.deleteCategory(
        admin,
        brand<string, "CategoryId">("11111111-1111-4111-8111-111111111111"),
      ),
    ).rejects.toThrow("A category with products cannot be deleted");
  });
});

interface TestApi {
  readonly api: BackendServices;
  readonly store: Store;
  readonly events: readonly { readonly type: string }[];
}

const createTestApi = (): TestApi => {
  const store = createInMemoryStore();
  const auth = createAuthService(store, {
    otpSecret: "otp-secret",
    tokenSecret: "token-secret",
    devOtp: "111111",
    exposeDevCode: true,
  });
  const realtime = createInMemoryRealtimeBus();
  const events: { readonly type: string }[] = [];
  realtime.subscribe((event) => events.push(event));
  const api = createBackendServices({
    store,
    auth,
    paymentProvider: createMockPaymentProvider(),
    realtime,
    flatDeliveryFee: { amountMinor: 150000, currency: "KZT" },
  });

  return { api, store, events };
};

const login = async (
  api: BackendServices,
  phone: string,
): Promise<AuthSession> => {
  await api.auth.requestOtp({ e164: phone });
  return api.auth.verifyOtp({ e164: phone }, "111111", "test device");
};

const createAdmin = async (
  api: BackendServices,
  phone: string,
): Promise<AuthSession> => {
  await api.auth.createStaffProfile({
    phone: { e164: phone },
    displayName: "Ops admin",
    roles: ["super_admin", "admin"],
  });
  return login(api, phone);
};
