import type { PhoneNumber, UserRole } from "./auth.js";
import type { ProductUnit } from "./catalog.js";
import type { Order } from "./order.js";
import type { Payment, PaymentStatus } from "./payment.js";
import type { Money } from "./money.js";
import type { CategoryId, OrderId, OrderItemId, PaymentId } from "./ids.js";
import type { PushPlatform } from "./notifications.js";

export interface CheckoutResult {
  readonly order: Order;
  readonly payment: Payment;
}

export interface CancelOrderItemInput {
  readonly orderId: OrderId;
  readonly orderItemId: OrderItemId;
  readonly reason: "unavailable" | "bad_quality";
}

export interface UpdatePickingItemInput {
  readonly orderId: OrderId;
  readonly itemId: OrderItemId;
  readonly status: "picked" | "cancelled";
  readonly pickedQuantity?: number;
  readonly reason?: "unavailable" | "bad_quality";
}

export interface CreateStaffProfileInput {
  readonly phone: PhoneNumber;
  readonly displayName: string;
  readonly roles: readonly Exclude<UserRole, "customer">[];
}

export interface AdminRefundInput {
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly reason: string;
}

export interface UpdatePaymentStatusInput {
  readonly paymentId: PaymentId;
  readonly status: PaymentStatus;
}

export interface CreateCategoryInput {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface UpdateCategoryInput {
  readonly name?: string;
  readonly slug?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface CreateProductInput {
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly description?: string;
  readonly unit: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive: boolean;
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly isAvailable: boolean;
  readonly availabilityNote?: string;
}

export interface UpdateProductInput {
  readonly categoryId?: CategoryId;
  readonly name?: string;
  readonly description?: string;
  readonly unit?: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive?: boolean;
}

export interface UpdateProductAvailabilityInput {
  readonly isAvailable: boolean;
  readonly note?: string;
}

export interface UpdateProductPriceInput {
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly effectiveFrom?: string;
}

export interface RegisterPushTokenInput {
  readonly token: string;
  readonly platform: PushPlatform;
}

export interface PricingConfig {
  readonly flatDeliveryFee: Money;
}
