import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { createAuthService } from "./auth-service.js";
import { createInMemoryStore } from "./in-memory-store.js";
import {
  BackendPersistence,
  makeBackendInfrastructureLayer,
} from "./infrastructure-services.js";
import { createMockPaymentProvider } from "./modules/payments.js";
import { createInMemoryRealtimeBus } from "./realtime.js";

describe("backend infrastructure", () => {
  it.effect(
    "maps persistence rejections to a typed infrastructure failure",
    () =>
      Effect.gen(function* () {
        const persistence = yield* BackendPersistence;
        const failure = yield* persistence
          .execute("test.rejectedStoreOperation", () =>
            Promise.reject(new Error("database unavailable")),
          )
          .pipe(Effect.flip);

        assert.equal(failure._tag, "BackendInfrastructureFailure");
        assert.equal(
          failure.message,
          "Infrastructure operation failed: test.rejectedStoreOperation.",
        );
      }).pipe(Effect.provide(makeTestInfrastructureLayer())),
  );
});

const makeTestInfrastructureLayer = () => {
  const store = createInMemoryStore();
  return makeBackendInfrastructureLayer({
    store,
    auth: createAuthService(store, {
      otpSecret: "otp-secret",
      tokenSecret: "token-secret",
    }),
    paymentProvider: createMockPaymentProvider(),
    realtime: createInMemoryRealtimeBus(),
  });
};
