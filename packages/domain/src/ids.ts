import type { Brand } from "./brand.js";

export type UserId = Brand<string, "UserId">;
export type StaffId = Brand<string, "StaffId">;
export type ProductId = Brand<string, "ProductId">;
export type CategoryId = Brand<string, "CategoryId">;
export type CartId = Brand<string, "CartId">;
export type OrderId = Brand<string, "OrderId">;
export type OrderItemId = Brand<string, "OrderItemId">;
export type PaymentId = Brand<string, "PaymentId">;
export type RefundId = Brand<string, "RefundId">;
export type PickingTaskId = Brand<string, "PickingTaskId">;
export type DeliveryTaskId = Brand<string, "DeliveryTaskId">;
export type NotificationId = Brand<string, "NotificationId">;
export type AuditLogId = Brand<string, "AuditLogId">;
