import type {
  AuthorizePaymentInput,
  AuthorizePaymentResult,
  CancelAuthorizationInput,
  CapturePaymentInput,
  CapturePaymentResult,
  PaymentProvider,
  PaymentStatus,
  RefundPaymentInput,
  RefundPaymentResult,
} from "@altyn-market/domain";

export interface RuntimePaymentProvider extends PaymentProvider {
  readonly name: string;
}

export interface KaspiPaymentConfig {
  readonly merchantId: string;
  readonly redirectBaseUrl: string;
  readonly deeplinkBaseUrl: string;
}

export const createMockPaymentProvider = (): RuntimePaymentProvider => ({
  name: "mock",
  authorize: async (
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentResult> => ({
    providerPaymentId: `mock_${input.orderId}_${input.amount.amountMinor}`,
    status: "authorized",
  }),
  capture: async (
    _input: CapturePaymentInput,
  ): Promise<CapturePaymentResult> => ({
    status: "captured",
  }),
  cancelAuthorization: async (
    _input: CancelAuthorizationInput,
  ): Promise<void> => undefined,
  refund: async (input: RefundPaymentInput): Promise<RefundPaymentResult> => ({
    providerRefundId: `mock_refund_${input.providerPaymentId}_${input.amount.amountMinor}`,
    status: "completed",
  }),
  getStatus: async () => "authorized",
});

export const createKaspiPaymentProvider = (
  config: KaspiPaymentConfig,
): RuntimePaymentProvider => ({
  name: "kaspi",
  authorize: async (
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentResult> => {
    const providerPaymentId = `kaspi_${input.orderId}_${Date.now()}`;
    const params = new URLSearchParams({
      merchant_id: config.merchantId,
      invoice_id: String(input.orderId),
      amount_minor: String(input.amount.amountMinor),
      currency: input.amount.currency,
      phone: input.customerPhone,
      payment_id: providerPaymentId,
    });

    return {
      providerPaymentId,
      status: "authorization_pending",
      redirectUrl: `${config.redirectBaseUrl}?${params.toString()}`,
      deeplinkUrl: `${config.deeplinkBaseUrl}?${params.toString()}`,
    };
  },
  capture: async (
    _input: CapturePaymentInput,
  ): Promise<CapturePaymentResult> => ({
    status: "capture_pending",
  }),
  cancelAuthorization: async (
    _input: CancelAuthorizationInput,
  ): Promise<void> => undefined,
  refund: async (input: RefundPaymentInput): Promise<RefundPaymentResult> => ({
    providerRefundId: `kaspi_refund_${input.providerPaymentId}_${Date.now()}`,
    status: "pending",
  }),
  getStatus: async (): Promise<PaymentStatus> => "authorization_pending",
});

export const createPendingCardPaymentProvider = (): RuntimePaymentProvider => ({
  name: "card_pending",
  authorize: async (): Promise<AuthorizePaymentResult> => {
    throw new Error("Card processor fallback is not configured yet.");
  },
  capture: async (): Promise<CapturePaymentResult> => {
    throw new Error("Card processor fallback is not configured yet.");
  },
  cancelAuthorization: async (): Promise<void> => {
    throw new Error("Card processor fallback is not configured yet.");
  },
  refund: async (): Promise<RefundPaymentResult> => {
    throw new Error("Card processor fallback is not configured yet.");
  },
  getStatus: async (): Promise<PaymentStatus> => "failed",
});

export const mockPaymentProvider = createMockPaymentProvider();
