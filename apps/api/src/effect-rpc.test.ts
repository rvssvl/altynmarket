import { assert, describe, it } from "@effect/vitest";
import { AltynMarketRpcs, RpcAuthentication } from "@altyn-market/domain";
import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Headers from "effect/unstable/http/Headers";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import { createAuthService } from "./auth-service.js";
import type { BackendDependencies } from "./application-services.js";
import { createEffectRpcHandler } from "./effect-rpc.js";
import { createInMemoryStore } from "./in-memory-store.js";
import { createMockPaymentProvider } from "./modules/payments.js";
import { createInMemoryRealtimeBus } from "./realtime.js";

describe("Effect RPC", () => {
  it.effect("serves the customer shopping workflow through HTTP RPC", () =>
    Effect.gen(function* () {
      const handler = createEffectRpcHandler(createTestDependencies());
      yield* Effect.addFinalizer(() => Effect.promise(() => handler.dispose()));

      const publicClient = yield* RpcClient.make(AltynMarketRpcs).pipe(
        Effect.provide(makeClientLayer(handler.handler)),
      );

      const health = yield* publicClient.Health();
      const catalog = yield* publicClient.ListCatalog();
      yield* publicClient.RequestOtp({
        phone: { e164: "+77010000010" },
      });
      const session = yield* publicClient.VerifyOtp({
        phone: { e164: "+77010000010" },
        code: "111111",
        deviceName: "rpc test",
      });

      const customerClient = yield* RpcClient.make(AltynMarketRpcs).pipe(
        Effect.provide(makeClientLayer(handler.handler, session.accessToken)),
      );
      const cart = yield* customerClient.AddCartItem({
        productId: catalog[0]?.product.id ?? "",
        quantity: 2,
      });
      const checkout = yield* customerClient.Checkout({
        address: {
          city: "Almaty",
          street: "Abai avenue, 1",
          apartment: "42",
        },
      });
      const orders = yield* customerClient.ListMyOrders();
      const order = yield* customerClient.GetOrder({
        orderId: checkout.order.id,
      });

      assert.deepStrictEqual(health, {
        ok: true,
        service: "altyn-market-api",
        environment: "test",
      });
      assert.isAbove(catalog.length, 0);
      assert.equal(catalog[0]?.product.id, catalog[0]?.price.productId);
      assert.equal(cart.items[0]?.quantity, 2);
      assert.equal(checkout.payment.status, "authorized");
      assert.equal(orders[0]?.id, checkout.order.id);
      assert.equal(order.id, checkout.order.id);
    }),
  );

  it.effect("serves admin payment administration through HTTP RPC", () =>
    Effect.gen(function* () {
      const dependencies = createTestDependencies();
      const handler = createEffectRpcHandler(dependencies);
      yield* Effect.addFinalizer(() => Effect.promise(() => handler.dispose()));
      yield* Effect.promise(() =>
        dependencies.auth.createStaffProfile({
          phone: { e164: "+77010000021" },
          displayName: "Ops admin",
          roles: ["super_admin", "admin", "picker"],
        }),
      );

      const publicClient = yield* RpcClient.make(AltynMarketRpcs).pipe(
        Effect.provide(makeClientLayer(handler.handler)),
      );
      yield* publicClient.RequestOtp({ phone: { e164: "+77010000021" } });
      const adminSession = yield* publicClient.VerifyOtp({
        phone: { e164: "+77010000021" },
        code: "111111",
      });
      yield* publicClient.RequestOtp({ phone: { e164: "+77010000020" } });
      const customerSession = yield* publicClient.VerifyOtp({
        phone: { e164: "+77010000020" },
        code: "111111",
      });

      const adminClient = yield* RpcClient.make(AltynMarketRpcs).pipe(
        Effect.provide(
          makeClientLayer(handler.handler, adminSession.accessToken),
        ),
      );
      const customerClient = yield* RpcClient.make(AltynMarketRpcs).pipe(
        Effect.provide(
          makeClientLayer(handler.handler, customerSession.accessToken),
        ),
      );

      const catalog = yield* customerClient.ListCatalog();
      yield* customerClient.AddCartItem({
        productId: catalog[0]?.product.id ?? "",
        quantity: 2,
      });
      const checkout = yield* customerClient.Checkout({
        address: { city: "Almaty", street: "Abai avenue, 1" },
      });

      yield* adminClient.AssignPicker({
        orderId: checkout.order.id,
        pickerId: adminSession.staff?.id ?? "",
      });
      yield* adminClient.StartPicking({ orderId: checkout.order.id });
      const completed = yield* adminClient.CompletePicking({
        orderId: checkout.order.id,
      });
      assert.equal(completed.status, "payment_captured");

      const payments = yield* adminClient.ListAdminPayments();
      const captured = payments.find(
        (payment) => payment.orderId === checkout.order.id,
      );
      assert.isDefined(captured?.capturedAmount);
      const capturedMinor = captured?.capturedAmount?.amountMinor ?? 0;

      const refund = yield* adminClient.RefundPayment({
        paymentId: captured?.id ?? "",
        amount: { amountMinor: capturedMinor - 5000, currency: "KZT" },
        reason: "damaged goods",
      });
      assert.equal(refund.status, "completed");

      const duplicate = yield* Effect.flip(
        adminClient.RefundPayment({
          paymentId: captured?.id ?? "",
          amount: { amountMinor: capturedMinor - 5000, currency: "KZT" },
          reason: "damaged goods",
        }),
      );
      assert.equal(duplicate._tag, "RefundNotAllowed");
      assert.equal(
        (duplicate as { readonly reason?: string }).reason,
        "amount_exceeds_captured",
      );

      const refunds = yield* adminClient.ListAdminRefunds();
      assert.equal(refunds[0]?.id, refund.id);
      const metrics = yield* adminClient.GetMetrics();
      assert.equal(metrics.orderCount, 1);
    }),
  );
});

const makeClientLayer = (
  handler: (request: Request) => Promise<Response>,
  accessToken?: string,
) => {
  const fetchThroughHandler: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return handler(request);
  };

  const authentication = RpcMiddleware.layerClient(
    RpcAuthentication,
    ({ next, request }) =>
      accessToken
        ? next({
            ...request,
            headers: Headers.set(
              request.headers,
              "authorization",
              `Bearer ${accessToken}`,
            ),
          })
        : next(request),
  );

  return RpcClient.layerProtocolHttp({
    url: "http://altyn-market.test/rpc",
  }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(RpcSerialization.RpcSerialization, RpcSerialization.json),
    ),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchThroughHandler)),
    Layer.provideMerge(authentication),
  );
};

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
