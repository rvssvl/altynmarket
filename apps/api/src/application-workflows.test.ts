import { assert, describe, it } from "@effect/vitest";
import { brand, type AuthSession } from "@altyn-market/domain";
import { Effect } from "effect";
import {
  AdministrationApplication,
  CustomerShoppingApplication,
  makeApplicationLayer,
  StaffOperationsApplication,
  type BackendDependencies,
} from "./application-services.js";
import { createAuthService, type AuthService } from "./auth-service.js";
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
    const { dependencies } = createTestDependencies();
    const auth = dependencies.auth;
    const otp = await auth.requestOtp({ e164: "+77010000001" });

    assert.strictEqual(otp.devCode, "111111");

    const invalidOtp = await expectRejection(
      auth.verifyOtp({ e164: "+77010000001" }, "000000", "iPhone"),
    );
    assert.match(invalidOtp.message, /Invalid OTP code/);

    const session = await auth.verifyOtp(
      { e164: "+77010000001" },
      "111111",
      "iPhone",
    );
    assert.strictEqual(session.customer.phone.e164, "+77010000001");
    assert.include(session.roles ?? [], "customer");

    const current = await auth.getCurrentSession(session.accessToken);
    assert.strictEqual(current.customer.id, session.customer.id);

    const refreshed = await auth.refreshSession(session.refreshToken);
    assert.notStrictEqual(refreshed.accessToken, session.accessToken);

    const expired = await expectRejection(
      auth.getCurrentSession(session.accessToken),
    );
    assert.match(expired.message, /Session expired/);
  });
});

describe("checkout and picking workflow", () => {
  it.effect(
    "checks out cart items, captures the recalculated picked total, records refund delta, and reports metrics",
    () => {
      const { dependencies, store, events } = createTestDependencies();

      return Effect.gen(function* () {
        const shopping = yield* CustomerShoppingApplication;
        const operations = yield* StaffOperationsApplication;
        const administration = yield* AdministrationApplication;
        const customer = yield* Effect.promise(() =>
          login(dependencies.auth, "+77010000002"),
        );
        const admin = yield* Effect.promise(() =>
          createAdmin(dependencies.auth, "+77010000003", [
            "admin",
            "picker",
            "courier",
          ]),
        );
        const staff = admin.staff;
        if (!staff) {
          return yield* Effect.die(new Error("Admin staff profile missing."));
        }

        yield* shopping.cart.addItem(customer, tomatoes, 2);
        yield* shopping.cart.addItem(customer, apples, 1);
        const checkout = yield* shopping.checkout.create(customer, {
          city: "Almaty",
          street: "Satpayev 1",
          apartment: "12",
        });

        assert.strictEqual(checkout.order.status, "payment_authorized");
        assert.strictEqual(checkout.payment.status, "authorized");
        const cart = yield* shopping.cart.get(customer);
        assert.lengthOf(cart.items, 0);

        const assigned = yield* administration.dispatch.assignPicker(
          admin,
          checkout.order.id,
          staff.id,
        );
        assert.strictEqual(assigned.status, "assigned");

        yield* operations.picking.start(admin, checkout.order.id);
        const appleItem = checkout.order.items.find(
          (item) => item.productId === apples,
        );
        if (!appleItem) {
          return yield* Effect.die(new Error("Apple item missing."));
        }

        yield* operations.picking.updateItem(admin, {
          orderId: checkout.order.id,
          itemId: appleItem.id,
          status: "cancelled",
          reason: "bad_quality",
        });

        const completed = yield* operations.picking.complete(
          admin,
          checkout.order.id,
        );
        const payment = yield* Effect.promise(() =>
          store.payments.getByOrderId(completed.id),
        );
        const metrics = yield* administration.metrics.get(admin);

        assert.strictEqual(completed.status, "payment_captured");
        assert.strictEqual(completed.finalTotal.amountMinor, 320000);
        assert.strictEqual(payment?.status, "captured");
        assert.strictEqual(payment?.capturedAmount?.amountMinor, 320000);
        assert.strictEqual(metrics.orderCount, 1);
        assert.strictEqual(metrics.refundAmount.amountMinor, 72000);
        assert.isTrue(events.some((event) => event.type === "payment.updated"));
      }).pipe(Effect.provide(makeApplicationLayer(dependencies)));
    },
  );

  it.effect("enforces staff/admin RBAC on operational mutations", () => {
    const { dependencies } = createTestDependencies();

    return Effect.gen(function* () {
      const shopping = yield* CustomerShoppingApplication;
      const operations = yield* StaffOperationsApplication;
      const customer = yield* Effect.promise(() =>
        login(dependencies.auth, "+77010000004"),
      );

      yield* shopping.cart.addItem(customer, tomatoes, 1);
      const checkout = yield* shopping.checkout.create(customer, {
        city: "Almaty",
        street: "Abay 10",
      });

      const denied = yield* Effect.flip(
        operations.picking.start(customer, checkout.order.id),
      );
      assert.match(
        (denied as { readonly message?: string }).message ?? "",
        /Forbidden/,
      );
    }).pipe(Effect.provide(makeApplicationLayer(dependencies)));
  });
});

describe("catalog deletion", () => {
  it.effect(
    "deletes an unused product and its empty category, then records both actions",
    () => {
      const { dependencies } = createTestDependencies();

      return Effect.gen(function* () {
        const administration = yield* AdministrationApplication;
        const admin = yield* Effect.promise(() =>
          createAdmin(dependencies.auth, "+77010000005", [
            "super_admin",
            "admin",
          ]),
        );
        const category = yield* administration.catalog.createCategory(admin, {
          name: "Seasonal",
          slug: "seasonal",
          sortOrder: 40,
          isActive: true,
        });
        const product = yield* administration.catalog.createProduct(admin, {
          categoryId: category.id,
          name: "Apricots",
          unit: "kg",
          isActive: true,
          customerPrice: { amountMinor: 120000, currency: "KZT" },
          internalCost: { amountMinor: 80000, currency: "KZT" },
          isAvailable: true,
        });

        yield* administration.catalog.deleteProduct(admin, product.product.id);
        yield* administration.catalog.deleteCategory(admin, category.id);
        yield* administration.catalog.recordImageUpload(admin, {
          fileName: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
          contentType: "image/png",
          sizeBytes: 68,
        });

        const products = yield* administration.catalog.listProducts(admin);
        assert.isUndefined(
          products.find(
            (candidate) => candidate.product.id === product.product.id,
          ),
        );
        const categories = yield* administration.catalog.listCategories(admin);
        assert.isUndefined(
          categories.find((candidate) => candidate.id === category.id),
        );
        const audit = yield* administration.audit.list(admin);
        const actions = audit.map((entry) => entry.action);
        assert.includeMembers(
          [...actions],
          [
            "admin.product_delete",
            "admin.category_delete",
            "admin.product_image_upload",
          ],
        );
      }).pipe(Effect.provide(makeApplicationLayer(dependencies)));
    },
  );

  it.effect("keeps catalog history intact by blocking unsafe deletions", () => {
    const { dependencies } = createTestDependencies();

    return Effect.gen(function* () {
      const shopping = yield* CustomerShoppingApplication;
      const administration = yield* AdministrationApplication;
      const admin = yield* Effect.promise(() =>
        createAdmin(dependencies.auth, "+77010000006", [
          "super_admin",
          "admin",
        ]),
      );
      const customer = yield* Effect.promise(() =>
        login(dependencies.auth, "+77010000007"),
      );

      yield* shopping.cart.addItem(customer, tomatoes, 1);
      yield* shopping.checkout.create(customer, {
        city: "Almaty",
        street: "Abay 10",
      });

      const productDenied = yield* Effect.flip(
        administration.catalog.deleteProduct(admin, tomatoes),
      );
      assert.match(
        (productDenied as { readonly message?: string }).message ?? "",
        /A product with order history cannot be deleted/,
      );
      const categoryDenied = yield* Effect.flip(
        administration.catalog.deleteCategory(
          admin,
          brand<string, "CategoryId">("11111111-1111-4111-8111-111111111111"),
        ),
      );
      assert.match(
        (categoryDenied as { readonly message?: string }).message ?? "",
        /A category with products cannot be deleted/,
      );
    }).pipe(Effect.provide(makeApplicationLayer(dependencies)));
  });
});

const expectRejection = async (promise: Promise<unknown>): Promise<Error> => {
  const outcome = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  assert.instanceOf(outcome, Error);
  return outcome as Error;
};

interface TestContext {
  readonly dependencies: BackendDependencies;
  readonly store: Store;
  readonly events: readonly { readonly type: string }[];
}

const createTestDependencies = (): TestContext => {
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
  const dependencies: BackendDependencies = {
    store,
    auth,
    paymentProvider: createMockPaymentProvider(),
    realtime,
    flatDeliveryFee: { amountMinor: 150000, currency: "KZT" },
  };

  return { dependencies, store, events };
};

const login = async (
  auth: AuthService,
  phone: string,
): Promise<AuthSession> => {
  await auth.requestOtp({ e164: phone });
  return auth.verifyOtp({ e164: phone }, "111111", "test device");
};

const createAdmin = async (
  auth: AuthService,
  phone: string,
  roles: readonly ("super_admin" | "admin" | "picker" | "courier")[],
): Promise<AuthSession> => {
  await auth.createStaffProfile({
    phone: { e164: phone },
    displayName: "Ops admin",
    roles,
  });
  return login(auth, phone);
};
