import {
  PaymentNotFound,
  RefundNotAllowed,
  type AdminRefundInput,
  type AuthSession,
  type Order,
  type Payment,
  type PaymentStatus,
  type Refund,
  type UpdatePaymentStatusInput,
} from "@altyn-market/domain";
import { Context, Effect, Layer } from "effect";
import type { AuthFailure } from "./auth-service.js";
import { BackendInfrastructureFailure } from "./backend-failures.js";
import {
  AuthGateway,
  BackendPersistence,
  PaymentGateway,
  RealtimePublisher,
} from "./infrastructure-services.js";

export type PaymentAdministrationFailure =
  | AuthFailure
  | PaymentNotFound
  | RefundNotAllowed
  | BackendInfrastructureFailure;

export type PaymentStatusUpdateFailure =
  | AuthFailure
  | PaymentNotFound
  | BackendInfrastructureFailure;

const refundableStatuses: readonly PaymentStatus[] = [
  "captured",
  "refund_pending",
  "refunded",
];

export class PaymentAdministration extends Context.Service<
  PaymentAdministration,
  {
    readonly refundPayment: (
      session: AuthSession,
      input: AdminRefundInput,
    ) => Effect.Effect<Refund, PaymentAdministrationFailure>;
    readonly updatePaymentStatus: (
      session: AuthSession,
      input: UpdatePaymentStatusInput,
    ) => Effect.Effect<Payment, PaymentStatusUpdateFailure>;
  }
>()("@altyn-market/api/PaymentAdministration") {}

export const paymentAdministrationLayer = Layer.effect(
  PaymentAdministration,
  Effect.gen(function* () {
    const persistence = yield* BackendPersistence;
    const paymentGateway = yield* PaymentGateway;
    const publisher = yield* RealtimePublisher;
    const { requireRole } = yield* AuthGateway;

    const requirePayment = Effect.fnUntraced(function* (
      paymentId: AdminRefundInput["paymentId"],
    ) {
      const payment = yield* persistence.execute("payments.getById", (store) =>
        store.payments.getById(paymentId),
      );

      if (!payment) {
        return yield* Effect.fail(new PaymentNotFound({ paymentId }));
      }

      return payment;
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

    const refundPayment = Effect.fnUntraced(function* (
      session: AuthSession,
      input: AdminRefundInput,
    ) {
      yield* requireRole(session, ["admin"]);
      const payment = yield* requirePayment(input.paymentId);

      if (
        !Number.isFinite(input.amount.amountMinor) ||
        input.amount.amountMinor <= 0
      ) {
        return yield* Effect.fail(
          new RefundNotAllowed({
            reason: "invalid_amount",
            message: "Refund amount must be greater than zero.",
          }),
        );
      }

      if (!payment.providerPaymentId) {
        return yield* Effect.fail(
          new RefundNotAllowed({
            reason: "provider_payment_missing",
            message: "Payment provider id is missing.",
          }),
        );
      }

      const capturedAmount = payment.capturedAmount;
      if (!capturedAmount || !refundableStatuses.includes(payment.status)) {
        return yield* Effect.fail(
          new RefundNotAllowed({
            reason: "not_captured",
            message: "Only captured payments can be refunded.",
          }),
        );
      }

      const allRefunds = yield* persistence.execute(
        "payments.listRefunds",
        (store) => store.payments.listRefunds(),
      );
      const refundedSoFar = allRefunds
        .filter(
          (refund) =>
            refund.paymentId === payment.id && refund.status !== "failed",
        )
        .reduce((total, refund) => total + refund.amount.amountMinor, 0);

      if (
        input.amount.amountMinor + refundedSoFar >
        capturedAmount.amountMinor
      ) {
        return yield* Effect.fail(
          new RefundNotAllowed({
            reason: "amount_exceeds_captured",
            message: "Refund amount exceeds the captured amount.",
          }),
        );
      }

      const providerRefund = yield* paymentGateway.refund({
        providerPaymentId: payment.providerPaymentId,
        amount: input.amount,
        reason: input.reason,
      });
      const refund = yield* persistence.execute(
        "payments.createRefund",
        (store) =>
          store.payments.createRefund({
            id: providerRefund.providerRefundId,
            paymentId: payment.id,
            amount: input.amount,
            reason: input.reason,
            status: providerRefund.status,
          }),
      );
      const updatedPayment = yield* persistence.execute(
        "payments.updateStatus",
        (store) =>
          store.payments.updateStatus(
            payment.id,
            providerRefund.status === "completed"
              ? "refunded"
              : "refund_pending",
          ),
      );
      const order = yield* persistence.execute("orders.setStatus", (store) =>
        store.orders.setStatus(
          payment.orderId,
          providerRefund.status === "completed"
            ? "refunded"
            : "refund_required",
          session.customer.id,
          `Admin refund: ${input.reason}`,
        ),
      );
      yield* persistence.execute("audit.record", (store) =>
        store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.payment_refund",
          entityType: "payment",
          entityId: payment.id,
          metadata: {
            refundId: refund.id,
            amountMinor: input.amount.amountMinor,
            reason: input.reason,
          },
        }),
      );
      yield* publishOrderUpdated(order);
      yield* publishPaymentUpdated(order, updatedPayment);
      return refund;
    });

    const updatePaymentStatus = Effect.fnUntraced(function* (
      session: AuthSession,
      input: UpdatePaymentStatusInput,
    ) {
      yield* requireRole(session, ["admin"]);
      const payment = yield* requirePayment(input.paymentId);
      const updated = yield* persistence.execute(
        "payments.updateStatus",
        (store) => store.payments.updateStatus(payment.id, input.status),
      );
      const order = yield* persistence.execute("orders.get", (store) =>
        store.orders.get(payment.orderId),
      );

      if (!order) {
        return yield* Effect.fail(
          new BackendInfrastructureFailure({
            message: "Order is missing for an existing payment.",
            cause: { orderId: payment.orderId, paymentId: payment.id },
          }),
        );
      }

      yield* persistence.execute("audit.record", (store) =>
        store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.payment_status_update",
          entityType: "payment",
          entityId: payment.id,
          metadata: { status: input.status },
        }),
      );
      yield* publishPaymentUpdated(order, updated);
      return updated;
    });

    return PaymentAdministration.of({
      refundPayment,
      updatePaymentStatus,
    });
  }),
);
