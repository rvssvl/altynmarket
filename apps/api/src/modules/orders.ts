import type {
  AssignCourierInput,
  AssignPickerInput,
  CancelOrderItemInput,
  CheckoutInput,
  CheckoutResult,
  DeliveryTask,
  Order,
  OrderId,
  PickingTask,
} from "@altyn-market/domain";

export interface OrderService {
  readonly checkout: (input: CheckoutInput) => Promise<CheckoutResult>;
  readonly getOrder: (orderId: OrderId) => Promise<Order>;
  readonly cancelItem: (input: CancelOrderItemInput) => Promise<Order>;
  readonly completePicking: (orderId: OrderId) => Promise<Order>;
  readonly assignPicker: (input: AssignPickerInput) => Promise<PickingTask>;
  readonly assignCourier: (input: AssignCourierInput) => Promise<DeliveryTask>;
}
