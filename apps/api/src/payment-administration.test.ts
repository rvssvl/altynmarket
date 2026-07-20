import { assert, describe, it } from "@effect/vitest";
import {
  brand,
  PaymentNotFound,
  RefundNotAllowed,
  type AuthSession,
} from "@altyn-market/domain";
import { Effect, Layer } from "effect";
import {
  AdministrationApplication,
  CustomerShoppingApplication,
  makeApplicationLayer,
  StaffOperationsApplication,
  type BackendDependencies,
} from "./application-services.js";
import { createAuthService, type AuthService } from "./auth-service.js";
import { createInMemoryStore } from "./in-memory-store.js";
import { makeBackendInfrastructureLayer } from "./infrastructure-services.js";
import { createMockPaymentProvider } from "./modules/payments.js";
import {
  PaymentAdministration,
  paymentAdministrationLayer,
} from "./payment-administration-workflow.js";
import { createInMemoryRealtimeBus } from "./realtime.js";
import type { Store } from "./store.js";

const tomatoes = brand<string, "ProductId">(
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
);

describe("payment administration", () => {
  it.effect("guards admin refunds and records allowed ones", () => {
    const { dependencies, store } = createTestDependencies();
    const layer = Layer.mergeAll(
      makeApplicationLayer(dependencies),
      paymentAdministrationLayer.pipe(
        Layer.provide(makeBackendInfrastructureLayer(dependencies)),
      ),
    );

    return Effect.gen(function* () {
      const administration = yield* PaymentAdministration;
      const shopping = yield* CustomerShoppingApplication;
      const operations = yield* StaffOperationsApplication;
      const adminOps = yield* AdministrationApplication;
      const admin = yield* Effect.promise(() =>
        createAdmin(dependencies.auth, "+77010000201"),
      );
      const customer = yield* Effect.promise(() =>
        login(dependencies.auth, "+77010000200"),
      );
      const staff = admin.staff;
      if (!staff) {
        return yield* Effect.die(new Error("Admin staff profile missing."));
      }

      const missing = yield* Effect.flip(
        administration.refundPayment(admin, {
          paymentId: brand<string, "PaymentId">(
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          ),
          amount: { amountMinor: 1000, currency: "KZT" },
          reason: "missing payment",
        }),
      );
      assert.instanceOf(missing, PaymentNotFound);

      yield* shopping.cart.addItem(customer, tomatoes, 2);
      const checkout = yield* shopping.checkout.create(customer, {
        city: "Almaty",
        street: "Satpayev 1",
      });

      const notCaptured = yield* Effect.flip(
        administration.refundPayment(admin, {
          paymentId: checkout.payment.id,
          amount: { amountMinor: 1000, currency: "KZT" },
          reason: "before capture",
        }),
      );
      assertRefundNotAllowed(notCaptured, "not_captured");

      yield* adminOps.dispatch.assignPicker(admin, checkout.order.id, staff.id);
      yield* operations.picking.start(admin, checkout.order.id);
      const completed = yield* operations.picking.complete(
        admin,
        checkout.order.id,
      );
      assert.strictEqual(completed.status, "payment_captured");

      const captured = yield* Effect.promise(() =>
        store.payments.getByOrderId(checkout.order.id),
      );
      const capturedMinor = captured?.capturedAmount?.amountMinor;
      if (!captured || capturedMinor === undefined) {
        return yield* Effect.die(new Error("Captured payment missing."));
      }

      const excessive = yield* Effect.flip(
        administration.refundPayment(admin, {
          paymentId: captured.id,
          amount: { amountMinor: capturedMinor + 1, currency: "KZT" },
          reason: "too much",
        }),
      );
      assertRefundNotAllowed(excessive, "amount_exceeds_captured");

      const denied = yield* Effect.flip(
        administration.refundPayment(customer, {
          paymentId: captured.id,
          amount: { amountMinor: 1000, currency: "KZT" },
          reason: "not an admin",
        }),
      );
      assert.strictEqual(
        (denied as { readonly _tag?: string })._tag,
        "AuthFailure",
      );

      const firstAmount = capturedMinor - 10000;
      const refund = yield* administration.refundPayment(admin, {
        paymentId: captured.id,
        amount: { amountMinor: firstAmount, currency: "KZT" },
        reason: "damaged goods",
      });
      assert.strictEqual(refund.status, "completed");
      assert.strictEqual(refund.amount.amountMinor, firstAmount);

      const refreshedPayment = yield* Effect.promise(() =>
        store.payments.getById(captured.id),
      );
      assert.strictEqual(refreshedPayment?.status, "refunded");
      const refreshedOrder = yield* Effect.promise(() =>
        store.orders.get(checkout.order.id),
      );
      assert.strictEqual(refreshedOrder?.status, "refunded");
      const audit = yield* Effect.promise(() => store.audit.list());
      assert.isTrue(
        audit.some(
          (record) =>
            record.action === "admin.payment_refund" &&
            record.entityId === captured.id,
        ),
      );

      const duplicate = yield* Effect.flip(
        administration.refundPayment(admin, {
          paymentId: captured.id,
          amount: { amountMinor: firstAmount, currency: "KZT" },
          reason: "damaged goods",
        }),
      );
      assertRefundNotAllowed(duplicate, "amount_exceeds_captured");

      const remainder = yield* administration.refundPayment(admin, {
        paymentId: captured.id,
        amount: { amountMinor: 10000, currency: "KZT" },
        reason: "goodwill",
      });
      assert.strictEqual(remainder.amount.amountMinor, 10000);

      const invalid = yield* Effect.flip(
        administration.refundPayment(admin, {
          paymentId: captured.id,
          amount: { amountMinor: 0, currency: "KZT" },
          reason: "zero amount",
        }),
      );
      assertRefundNotAllowed(invalid, "invalid_amount");

      const refunds = yield* Effect.promise(() => store.payments.listRefunds());
      assert.strictEqual(
        refunds.filter((entry) => entry.paymentId === captured.id).length,
        2,
      );
    }).pipe(Effect.provide(layer));
  });
});

const assertRefundNotAllowed = (
  failure: unknown,
  reason: RefundNotAllowed["reason"],
): void => {
  assert.instanceOf(failure, RefundNotAllowed);
  assert.strictEqual((failure as RefundNotAllowed).reason, reason);
};

const createTestDependencies = (): {
  readonly dependencies: BackendDependencies;
  readonly store: Store;
} => {
  const store = createInMemoryStore();
  const auth = createAuthService(store, {
    otpSecret: "otp-secret",
    tokenSecret: "token-secret",
    devOtp: "111111",
    exposeDevCode: true,
  });
  const dependencies: BackendDependencies = {
    store,
    auth,
    paymentProvider: createMockPaymentProvider(),
    realtime: createInMemoryRealtimeBus(),
    flatDeliveryFee: { amountMinor: 150000, currency: "KZT" },
  };

  return { dependencies, store };
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
): Promise<AuthSession> => {
  await auth.createStaffProfile({
    phone: { e164: phone },
    displayName: "Ops admin",
    roles: ["super_admin", "admin", "picker"],
  });
  return login(auth, phone);
};
