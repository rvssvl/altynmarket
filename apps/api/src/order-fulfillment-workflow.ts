import {
  brand,
  calculateFinalTotal,
  calculateGoodsTotal,
  type Address,
  type AuthSession,
  type CancelOrderItemInput,
  type CheckoutResult,
  type DeliveryAddressInput,
  type Money,
  type Order,
  type OrderId,
  type OrderItem,
  type OrderStatus,
  type Payment,
  type ProductId,
  type UpdatePickingItemInput,
} from "@altyn-market/domain";
import { Context, Effect, Layer } from "effect";
import { randomUUID } from "node:crypto";
import type { AuthFailure } from "./auth-service.js";
import {
  ApiFailure,
  BackendInfrastructureFailure,
} from "./backend-failures.js";
import {
  AuthGateway,
  BackendPersistence,
  PaymentGateway,
  RealtimePublisher,
} from "./infrastructure-services.js";

export type OrderFulfillmentFailure =
  | AuthFailure
  | ApiFailure
  | BackendInfrastructureFailure;

export interface OrderFulfillmentDependencies {
  readonly flatDeliveryFee: Money;
  readonly paymentProviderName: string;
}

export class OrderFulfillmentWorkflow extends Context.Service<
  OrderFulfillmentWorkflow,
  {
    readonly checkout: (
      session: AuthSession,
      address: DeliveryAddressInput,
    ) => Effect.Effect<CheckoutResult, OrderFulfillmentFailure>;
    readonly startPicking: (
      session: AuthSession,
      orderId: OrderId,
    ) => Effect.Effect<Order, OrderFulfillmentFailure>;
    readonly updatePickingItem: (
      session: AuthSession,
      input: UpdatePickingItemInput,
    ) => Effect.Effect<Order, OrderFulfillmentFailure>;
    readonly cancelPickingItem: (
      session: AuthSession,
      input: CancelOrderItemInput,
    ) => Effect.Effect<Order, OrderFulfillmentFailure>;
    readonly completePicking: (
      session: AuthSession,
      orderId: OrderId,
    ) => Effect.Effect<Order, OrderFulfillmentFailure>;
  }
>()("@altyn-market/api/OrderFulfillmentWorkflow") {}

export const makeOrderFulfillmentLayer = (
  dependencies: OrderFulfillmentDependencies,
) =>
  Layer.effect(
    OrderFulfillmentWorkflow,
    Effect.gen(function* () {
      const persistence = yield* BackendPersistence;
      const paymentGateway = yield* PaymentGateway;
      const publisher = yield* RealtimePublisher;
      const { requireRole } = yield* AuthGateway;

      const requireOrder = Effect.fnUntraced(function* (orderId: OrderId) {
        const order = yield* persistence.execute("orders.get", (store) =>
          store.orders.get(orderId),
        );

        if (!order) {
          return yield* Effect.fail(new ApiFailure("Order not found.", 404));
        }

        return order;
      });

      const requireSellableProduct = Effect.fnUntraced(function* (
        productId: ProductId,
      ) {
        const productForSale = yield* persistence.execute(
          "catalog.getProductForSale",
          (store) => store.catalog.getProductForSale(productId),
        );

        if (!productForSale) {
          return yield* Effect.fail(new ApiFailure("Product not found.", 404));
        }

        if (
          !productForSale.product.isActive ||
          !productForSale.availability.isAvailable
        ) {
          return yield* Effect.fail(
            new ApiFailure("Product is unavailable.", 409),
          );
        }

        return productForSale;
      });

      const publishOrderUpdated = (order: Order) =>
        publisher.publish({
          type: "order.updated",
          orderId: order.id,
          status: order.status,
        });

      const publishPaymentUpdated = (order: Order, payment: Payment) =>
        publisher.publish({
          type: "payment.updated",
          orderId: order.id,
          paymentId: payment.id,
          status: payment.status,
        });

      const cancelOrderItem = Effect.fnUntraced(function* (
        session: AuthSession,
        input: UpdatePickingItemInput,
      ) {
        const reason = input.reason ?? "unavailable";
        const updated = yield* persistence.execute(
          "orders.updateItemStatus",
          (store) =>
            store.orders.updateItemStatus({
              orderId: input.orderId,
              itemId: input.itemId,
              status: "cancelled",
              cancellationReason: reason,
            }),
        );
        yield* persistence.execute("audit.record", (store) =>
          store.audit.record({
            actorUserId: session.customer.id,
            action: "picking.item_cancelled",
            entityType: "order_item",
            entityId: input.itemId,
            metadata: { orderId: input.orderId, reason },
          }),
        );
        yield* publishOrderUpdated(updated);
        return updated;
      });

      const checkout = Effect.fnUntraced(function* (
        session: AuthSession,
        addressInput: DeliveryAddressInput,
      ) {
        const cart = yield* persistence.execute("cart.get", (store) =>
          store.cart.get(session.customer.id),
        );

        if (cart.items.length === 0) {
          return yield* Effect.fail(new ApiFailure("Cart is empty.", 400));
        }

        const items = yield* Effect.forEach(
          cart.items,
          Effect.fnUntraced(function* (line) {
            const productForSale = yield* requireSellableProduct(
              line.product.id,
            );
            return {
              id: brand<string, "OrderItemId">(randomUUID()),
              productId: productForSale.product.id,
              productNameSnapshot: productForSale.product.name,
              unitSnapshot: productForSale.product.unit,
              requestedQuantity: line.quantity,
              unitPriceSnapshot: productForSale.price.customerPrice,
            };
          }),
        );
        const goodsTotal = calculateGoodsTotal(
          items.map((item): OrderItem => ({ ...item, status: "pending" })),
        );
        const finalTotal = {
          amountMinor:
            goodsTotal.amountMinor + dependencies.flatDeliveryFee.amountMinor,
          currency: "KZT" as const,
        };
        const orderId = brand<string, "OrderId">(randomUUID());
        const authorization = yield* paymentGateway.authorize({
          orderId,
          amount: finalTotal,
          customerPhone: session.customer.phone.e164,
        });
        const status: OrderStatus =
          authorization.status === "authorized"
            ? "payment_authorized"
            : "draft";
        const address = toAddress(session, addressInput);
        const result = yield* persistence.execute(
          "orders.createCheckoutOrder",
          (store) =>
            store.orders.createCheckoutOrder({
              orderId,
              paymentId: randomUUID(),
              customerId: session.customer.id,
              address,
              status,
              items,
              goodsTotal,
              deliveryFee: dependencies.flatDeliveryFee,
              finalTotal,
              payment: {
                provider: dependencies.paymentProviderName,
                status: authorization.status,
                authorizedAmount: finalTotal,
                providerPaymentId: authorization.providerPaymentId,
                ...(authorization.redirectUrl
                  ? { redirectUrl: authorization.redirectUrl }
                  : {}),
                ...(authorization.deeplinkUrl
                  ? { deeplinkUrl: authorization.deeplinkUrl }
                  : {}),
              },
            }),
        );

        yield* persistence.execute("cart.clear", (store) =>
          store.cart.clear(session.customer.id),
        );
        yield* publishOrderUpdated(result.order);
        yield* publishPaymentUpdated(result.order, result.payment);
        return result;
      });

      const startPicking = Effect.fnUntraced(function* (
        session: AuthSession,
        orderId: OrderId,
      ) {
        yield* requireRole(session, ["picker", "admin"]);
        const order = yield* requireOrder(orderId);
        const updated = yield* persistence.execute(
          "orders.setStatus",
          (store) =>
            store.orders.setStatus(
              order.id,
              "picking",
              session.customer.id,
              "Picking started",
            ),
        );
        const task = yield* persistence.execute(
          "picking.getByOrderId",
          (store) => store.picking.getByOrderId(order.id),
        );
        if (task) {
          yield* persistence.execute("picking.updateStatus", (store) =>
            store.picking.updateStatus(task.id, "in_progress"),
          );
        }
        yield* persistence.execute("audit.record", (store) =>
          store.audit.record({
            actorUserId: session.customer.id,
            action: "picking.start",
            entityType: "order",
            entityId: order.id,
          }),
        );
        yield* publishOrderUpdated(updated);
        return updated;
      });

      const updatePickingItem = Effect.fnUntraced(function* (
        session: AuthSession,
        input: UpdatePickingItemInput,
      ) {
        yield* requireRole(session, ["picker", "admin"]);

        if (input.status === "cancelled") {
          return yield* cancelOrderItem(session, input);
        }

        const existing = yield* requireOrder(input.orderId);
        const item = existing.items.find(
          (candidate) => candidate.id === input.itemId,
        );

        if (!item) {
          return yield* Effect.fail(
            new ApiFailure("Order item not found.", 404),
          );
        }

        const pickedQuantity = input.pickedQuantity ?? item.requestedQuantity;

        if (!Number.isFinite(pickedQuantity) || pickedQuantity < 0) {
          return yield* Effect.fail(
            new ApiFailure("pickedQuantity must be zero or greater.", 400),
          );
        }

        const updated = yield* persistence.execute(
          "orders.updateItemStatus",
          (store) =>
            store.orders.updateItemStatus({
              orderId: input.orderId,
              itemId: input.itemId,
              status: "picked",
              pickedQuantity,
            }),
        );
        yield* persistence.execute("audit.record", (store) =>
          store.audit.record({
            actorUserId: session.customer.id,
            action: "picking.item_picked",
            entityType: "order_item",
            entityId: input.itemId,
            metadata: { orderId: input.orderId, pickedQuantity },
          }),
        );
        yield* publishOrderUpdated(updated);
        return updated;
      });

      const cancelPickingItem = Effect.fnUntraced(function* (
        session: AuthSession,
        input: CancelOrderItemInput,
      ) {
        yield* requireRole(session, ["picker", "admin"]);
        return yield* cancelOrderItem(session, {
          orderId: input.orderId,
          itemId: input.orderItemId,
          status: "cancelled",
          reason: input.reason,
        });
      });

      const completePicking = Effect.fnUntraced(function* (
        session: AuthSession,
        orderId: OrderId,
      ) {
        yield* requireRole(session, ["picker", "admin"]);
        let order = yield* requireOrder(orderId);

        for (const item of order.items) {
          if (item.status === "pending") {
            order = yield* persistence.execute(
              "orders.updateItemStatus",
              (store) =>
                store.orders.updateItemStatus({
                  orderId,
                  itemId: item.id,
                  status: "picked",
                  pickedQuantity: item.requestedQuantity,
                }),
            );
          }
        }

        const goodsTotal = calculateGoodsTotal(order.items);
        const finalTotal = calculateFinalTotal(order.items, order.deliveryFee);
        order = yield* persistence.execute("orders.updateTotals", (store) =>
          store.orders.updateTotals(order.id, goodsTotal, finalTotal),
        );
        const payment = yield* persistence.execute(
          "payments.getByOrderId",
          (store) => store.payments.getByOrderId(order.id),
        );

        if (!payment?.providerPaymentId) {
          const failed = yield* persistence.execute(
            "orders.setStatus",
            (store) =>
              store.orders.setStatus(
                order.id,
                "payment_failed",
                session.customer.id,
                "Missing payment authorization",
              ),
          );
          yield* publishOrderUpdated(failed);
          return yield* Effect.fail(
            new ApiFailure("Payment authorization is missing.", 409),
          );
        }

        if (finalTotal.amountMinor > payment.authorizedAmount.amountMinor) {
          yield* persistence.execute("payments.updateStatus", (store) =>
            store.payments.updateStatus(payment.id, "capture_failed"),
          );
          const failed = yield* persistence.execute(
            "orders.setStatus",
            (store) =>
              store.orders.setStatus(
                order.id,
                "payment_failed",
                session.customer.id,
                "Final total exceeded authorized amount",
              ),
          );
          yield* publishOrderUpdated(failed);
          return yield* Effect.fail(
            new ApiFailure("Final total exceeds authorized amount.", 409),
          );
        }

        let nextPayment = payment;
        if (finalTotal.amountMinor === 0) {
          yield* paymentGateway.cancelAuthorization({
            providerPaymentId: payment.providerPaymentId,
            reason: "No picked items",
          });
          nextPayment = yield* persistence.execute(
            "payments.updateStatus",
            (store) =>
              store.payments.updateStatus(
                payment.id,
                "authorization_cancelled",
              ),
          );
          order = yield* persistence.execute("orders.setStatus", (store) =>
            store.orders.setStatus(
              order.id,
              "cancelled",
              session.customer.id,
              "No picked items",
            ),
          );
        } else {
          const capture = yield* paymentGateway.capture({
            providerPaymentId: payment.providerPaymentId,
            amount: finalTotal,
          });
          nextPayment = yield* persistence.execute(
            "payments.updateAfterCapture",
            (store) =>
              store.payments.updateAfterCapture(
                payment.id,
                capture.status,
                finalTotal,
              ),
          );

          const refundDelta =
            payment.authorizedAmount.amountMinor - finalTotal.amountMinor;
          if (refundDelta > 0 && capture.status === "captured") {
            const refundAmount: Money = {
              amountMinor: refundDelta,
              currency: payment.authorizedAmount.currency,
            };
            const refund = yield* paymentGateway.refund({
              providerPaymentId: payment.providerPaymentId,
              amount: refundAmount,
              reason: "Picked total below authorized amount",
            });
            yield* persistence.execute("payments.createRefund", (store) =>
              store.payments.createRefund({
                id: refund.providerRefundId,
                paymentId: payment.id,
                amount: refundAmount,
                reason: "picked_total_below_authorized",
                status: refund.status,
              }),
            );
          }

          order = yield* persistence.execute("orders.setStatus", (store) =>
            store.orders.setStatus(
              order.id,
              capture.status === "captured" ? "payment_captured" : "picked",
              session.customer.id,
              "Picking completed",
            ),
          );
        }

        const task = yield* persistence.execute(
          "picking.getByOrderId",
          (store) => store.picking.getByOrderId(order.id),
        );
        if (task) {
          yield* persistence.execute("picking.updateStatus", (store) =>
            store.picking.updateStatus(task.id, "completed"),
          );
        }
        yield* persistence.execute("audit.record", (store) =>
          store.audit.record({
            actorUserId: session.customer.id,
            action: "picking.complete",
            entityType: "order",
            entityId: order.id,
            metadata: {
              finalTotalMinor: finalTotal.amountMinor,
              paymentStatus: nextPayment.status,
            },
          }),
        );
        yield* publishOrderUpdated(order);
        yield* publishPaymentUpdated(order, nextPayment);
        return order;
      });

      return OrderFulfillmentWorkflow.of({
        checkout,
        startPicking,
        updatePickingItem,
        cancelPickingItem,
        completePicking,
      });
    }),
  );

const toAddress = (
  session: AuthSession,
  input: DeliveryAddressInput,
): Address => ({
  id: brand(randomUUID()),
  userId: session.customer.id,
  label: input.label ?? "Delivery",
  city: input.city,
  street: input.street,
  ...(input.apartment ? { apartment: input.apartment } : {}),
  ...(input.entrance ? { entrance: input.entrance } : {}),
  ...(input.floor ? { floor: input.floor } : {}),
  ...(input.comment ? { comment: input.comment } : {}),
  ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
  ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
});
