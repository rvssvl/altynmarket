import type {
  AuthSession,
  RefreshSessionInput,
  RequestOtpInput,
  RequestOtpResult,
  VerifyOtpInput,
} from "./auth.js";
import type { Category, Product, ProductPrice } from "./catalog.js";
import type { Order, OrderStatus } from "./order.js";
import type { Payment } from "./payment.js";
import type { DeliveryTask, PickingTask } from "./operations.js";
import type { Money } from "./money.js";
import type { MvpMetrics } from "./metrics.js";
import type { OrderId, OrderItemId, ProductId, StaffId } from "./ids.js";
import type { Address } from "./user.js";

export interface ApiContract {
  readonly auth: {
    readonly requestOtp: (input: RequestOtpInput) => Promise<RequestOtpResult>;
    readonly verifyOtp: (input: VerifyOtpInput) => Promise<AuthSession>;
    readonly refreshSession: (
      input: RefreshSessionInput,
    ) => Promise<AuthSession>;
    readonly getCurrentSession: (accessToken: string) => Promise<AuthSession>;
  };
  readonly catalog: {
    readonly listCategories: () => Promise<readonly Category[]>;
    readonly listProducts: () => Promise<readonly Product[]>;
    readonly getProductPrice: (productId: ProductId) => Promise<ProductPrice>;
  };
  readonly cart: {
    readonly addItem: (input: AddCartItemInput) => Promise<void>;
    readonly removeItem: (productId: ProductId) => Promise<void>;
    readonly checkout: (input: CheckoutInput) => Promise<CheckoutResult>;
  };
  readonly orders: {
    readonly getOrder: (orderId: OrderId) => Promise<Order>;
    readonly listMyOrders: () => Promise<readonly Order[]>;
  };
  readonly picking: {
    readonly listAssignedTasks: () => Promise<readonly PickingTask[]>;
    readonly cancelItem: (input: CancelOrderItemInput) => Promise<Order>;
    readonly completePicking: (orderId: OrderId) => Promise<Order>;
  };
  readonly delivery: {
    readonly listAssignedTasks: () => Promise<readonly DeliveryTask[]>;
    readonly updateStatus: (
      input: UpdateDeliveryStatusInput,
    ) => Promise<DeliveryTask>;
  };
  readonly admin: {
    readonly listOrders: (status?: OrderStatus) => Promise<readonly Order[]>;
    readonly assignPicker: (input: AssignPickerInput) => Promise<PickingTask>;
    readonly assignCourier: (
      input: AssignCourierInput,
    ) => Promise<DeliveryTask>;
    readonly getMetrics: () => Promise<MvpMetrics>;
  };
}

export interface AddCartItemInput {
  readonly productId: ProductId;
  readonly quantity: number;
}

export interface CheckoutInput {
  readonly address: Address;
}

export interface CheckoutResult {
  readonly order: Order;
  readonly payment: Payment;
}

export interface CancelOrderItemInput {
  readonly orderId: OrderId;
  readonly orderItemId: OrderItemId;
  readonly reason: "unavailable" | "bad_quality";
}

export interface UpdateDeliveryStatusInput {
  readonly orderId: OrderId;
  readonly status: "pickup_started" | "picked_up" | "delivering" | "delivered";
}

export interface AssignPickerInput {
  readonly orderId: OrderId;
  readonly pickerId: StaffId;
}

export interface AssignCourierInput {
  readonly orderId: OrderId;
  readonly courierId: StaffId;
}

export interface PricingConfig {
  readonly flatDeliveryFee: Money;
}
