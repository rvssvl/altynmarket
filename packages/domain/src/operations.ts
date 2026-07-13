import type { DeliveryTaskId, OrderId, PickingTaskId, StaffId } from "./ids.js";

export type PickingTaskStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";
export type DeliveryTaskStatus =
  | "assigned"
  | "pickup_started"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled";

export interface PickingTask {
  readonly id: PickingTaskId;
  readonly orderId: OrderId;
  readonly pickerId: StaffId;
  readonly status: PickingTaskStatus;
  readonly assignedAt: string;
  readonly completedAt?: string;
}

export interface DeliveryTask {
  readonly id: DeliveryTaskId;
  readonly orderId: OrderId;
  readonly courierId: StaffId;
  readonly status: DeliveryTaskStatus;
  readonly assignedAt: string;
  readonly deliveredAt?: string;
}
