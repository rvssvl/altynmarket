import type { OrderId, PaymentId, RefundId } from "./ids.js";
import type { Money } from "./money.js";

export type PaymentStatus =
  | "authorization_pending"
  | "authorized"
  | "authorization_cancelled"
  | "capture_pending"
  | "captured"
  | "capture_failed"
  | "refund_pending"
  | "refunded"
  | "failed";

export interface Payment {
  readonly id: PaymentId;
  readonly orderId: OrderId;
  readonly provider: string;
  readonly status: PaymentStatus;
  readonly authorizedAmount: Money;
  readonly capturedAmount?: Money;
  readonly providerPaymentId?: string;
  readonly redirectUrl?: string;
  readonly deeplinkUrl?: string;
}

export interface Refund {
  readonly id: RefundId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly reason: string;
  readonly status: "pending" | "completed" | "failed";
}

export interface PaymentProvider {
  readonly authorize: (
    input: AuthorizePaymentInput,
  ) => Promise<AuthorizePaymentResult>;
  readonly capture: (
    input: CapturePaymentInput,
  ) => Promise<CapturePaymentResult>;
  readonly cancelAuthorization: (
    input: CancelAuthorizationInput,
  ) => Promise<void>;
  readonly refund: (input: RefundPaymentInput) => Promise<RefundPaymentResult>;
  readonly getStatus: (providerPaymentId: string) => Promise<PaymentStatus>;
}

export interface AuthorizePaymentInput {
  readonly orderId: OrderId;
  readonly amount: Money;
  readonly customerPhone: string;
}

export interface AuthorizePaymentResult {
  readonly providerPaymentId: string;
  readonly status: "authorized" | "authorization_pending";
  readonly redirectUrl?: string;
  readonly deeplinkUrl?: string;
}

export interface CapturePaymentInput {
  readonly providerPaymentId: string;
  readonly amount: Money;
}

export interface CapturePaymentResult {
  readonly status: "captured" | "capture_pending";
}

export interface CancelAuthorizationInput {
  readonly providerPaymentId: string;
  readonly reason: string;
}

export interface RefundPaymentInput {
  readonly providerPaymentId: string;
  readonly amount: Money;
  readonly reason: string;
}

export interface RefundPaymentResult {
  readonly providerRefundId: string;
  readonly status: "pending" | "completed";
}
