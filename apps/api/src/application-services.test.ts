import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { createAuthService } from "./auth-service.js";
import {
  AuthenticationApplication,
  CatalogApplication,
  makeApplicationLayer,
  type BackendDependencies,
} from "./application-services.js";
import { createInMemoryStore } from "./in-memory-store.js";
import { createMockPaymentProvider } from "./modules/payments.js";
import { createInMemoryRealtimeBus } from "./realtime.js";

describe("application services", () => {
  it.effect("provides catalog and authentication through a test Layer", () =>
    Effect.gen(function* () {
      const catalog = yield* CatalogApplication;
      const authentication = yield* AuthenticationApplication;

      const categories = yield* catalog.listCategories();
      const products = yield* catalog.listCatalog();
      const otp = yield* authentication.requestOtp({
        e164: "+77010000010",
      });
      const session = yield* authentication.verifyOtp(
        { e164: "+77010000010" },
        "111111",
        "test device",
      );

      assert.isAbove(categories.length, 0);
      assert.isAbove(products.length, 0);
      assert.equal(products[0]?.product.id, products[0]?.price.productId);
      assert.deepStrictEqual(otp, { ok: true, devCode: "111111" });
      assert.equal(session.customer.phone.e164, "+77010000010");
    }).pipe(Effect.provide(makeApplicationLayer(createTestDependencies()))),
  );
});

const createTestDependencies = (): BackendDependencies => {
  const store = createInMemoryStore();
  const auth = createAuthService(store, {
    otpSecret: "otp-secret",
    tokenSecret: "token-secret",
    devOtp: "111111",
    exposeDevCode: true,
  });

  return {
    store,
    auth,
    paymentProvider: createMockPaymentProvider(),
    realtime: createInMemoryRealtimeBus(),
    flatDeliveryFee: { amountMinor: 150000, currency: "KZT" },
  };
};
