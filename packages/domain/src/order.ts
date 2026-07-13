import type { AddressId } from "./user.js";
import type {
  OrderId,
  OrderItemId,
  PaymentId,
  ProductId,
  UserId,
} from "./ids.js";
import type { Money } from "./money.js";

export type OrderStatus =
  | "draft"
  | "payment_authorized"
  | "awaiting_picking"
  | "picking"
  | "picked"
  | "payment_captured"
  | "awaiting_courier"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "payment_failed"
  | "refund_required"
  | "refunded";

export type OrderItemStatus = "pending" | "picked" | "cancelled";

export interface OrderItem {
  readonly id: OrderItemId;
  readonly productId: ProductId;
  readonly productNameSnapshot: string;
  readonly unitSnapshot: string;
  readonly requestedQuantity: number;
  readonly pickedQuantity?: number;
  readonly unitPriceSnapshot: Money;
  readonly status: OrderItemStatus;
  readonly cancellationReason?:
    | "unavailable"
    | "bad_quality"
    | "customer_request"
    | "admin_request";
}

export interface Order {
  readonly id: OrderId;
  readonly customerId: UserId;
  readonly addressId: AddressId;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly goodsTotal: Money;
  readonly deliveryFee: Money;
  readonly finalTotal: Money;
  readonly paymentId?: PaymentId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderStatusHistory {
  readonly orderId: OrderId;
  readonly from?: OrderStatus;
  readonly to: OrderStatus;
  readonly changedBy: UserId;
  readonly note?: string;
  readonly createdAt: string;
}

export const activeOrderItemStatuses = ["pending", "picked"] as const;
