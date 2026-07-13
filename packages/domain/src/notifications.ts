import type { NotificationId, OrderId, UserId } from "./ids.js";

export type NotificationChannel = "sms" | "push" | "whatsapp";

export type NotificationEvent =
  | "otp_requested"
  | "order_accepted"
  | "picking_started"
  | "item_cancelled"
  | "payment_captured"
  | "courier_assigned"
  | "courier_on_the_way"
  | "delivered"
  | "payment_or_refund_issue"
  | "new_picking_task"
  | "new_delivery_task"
  | "assignment_changed"
  | "urgent_admin_note";

export interface Notification {
  readonly id: NotificationId;
  readonly userId: UserId;
  readonly orderId?: OrderId;
  readonly channel: NotificationChannel;
  readonly event: NotificationEvent;
  readonly status: "pending" | "sent" | "failed";
  readonly createdAt: string;
}
