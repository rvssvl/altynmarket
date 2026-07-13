import type {
  DeliveryTaskId,
  OrderId,
  PaymentId,
  PickingTaskId,
} from "./ids.js";
import type { OrderStatus } from "./order.js";
import type { PaymentStatus } from "./payment.js";

export type RealtimeEvent =
  | {
      readonly type: "order.updated";
      readonly orderId: OrderId;
      readonly status: OrderStatus;
    }
  | {
      readonly type: "picking.assigned";
      readonly orderId: OrderId;
      readonly taskId: PickingTaskId;
    }
  | {
      readonly type: "delivery.assigned";
      readonly orderId: OrderId;
      readonly taskId: DeliveryTaskId;
    }
  | {
      readonly type: "payment.updated";
      readonly orderId: OrderId;
      readonly paymentId: PaymentId;
      readonly status: PaymentStatus;
    };
