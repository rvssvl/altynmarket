export type MockOrderItemStatus = "selected" | "confirmed" | "cancelled";

export interface MockOrderItem {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly price: number;
  readonly status: MockOrderItemStatus;
}

export type MockOrderStatus =
  | "payment_authorized"
  | "picking"
  | "ready_for_delivery";

export interface MockOrder {
  readonly id: string;
  readonly status: MockOrderStatus;
  readonly statusLabel: string;
  readonly placedAt: string;
  readonly paymentStatus: string;
  readonly deliveryStatus: string;
  readonly address: string;
  readonly deliveryFee: number;
  readonly providerPaymentId: string;
  readonly items: readonly MockOrderItem[];
}

export interface CreateMockOrderInput {
  readonly providerPaymentId: string;
  readonly address: string;
  readonly deliveryFee: number;
  readonly items: readonly Omit<MockOrderItem, "status">[];
}

export interface MockOrderService {
  readonly createOrder: (input: CreateMockOrderInput) => MockOrder;
  readonly listOrders: () => readonly MockOrder[];
  readonly startPicking: (orderId: string) => MockOrder;
  readonly updateItemStatus: (
    orderId: string,
    itemId: string,
    status: MockOrderItemStatus,
  ) => MockOrder;
  readonly completePicking: (orderId: string) => MockOrder;
}

export class MockOrderFailure extends Error {
  readonly status = 404;
}

export const createMockOrderService = (): MockOrderService => {
  let nextOrderNumber = 1200;
  let orders: readonly MockOrder[] = [];

  const replaceOrder = (nextOrder: MockOrder): MockOrder => {
    orders = orders.map((order) =>
      order.id === nextOrder.id ? nextOrder : order,
    );
    return nextOrder;
  };

  const findOrder = (orderId: string): MockOrder => {
    const order = orders.find((candidate) => candidate.id === orderId);

    if (!order) {
      throw new MockOrderFailure("Order not found.");
    }

    return order;
  };

  return {
    createOrder: (input) => {
      nextOrderNumber += 1;
      const id = `AM-${nextOrderNumber}`;
      const order: MockOrder = {
        id,
        status: "payment_authorized",
        statusLabel: "For picking",
        placedAt: new Date().toISOString(),
        paymentStatus: `Authorized by mock provider (${input.providerPaymentId})`,
        deliveryStatus: "Visible in Altyn Orda picking queue",
        address: input.address,
        deliveryFee: input.deliveryFee,
        providerPaymentId: input.providerPaymentId,
        items: input.items.map((item) => ({
          ...item,
          status: "selected",
        })),
      };

      orders = [order, ...orders];
      return order;
    },
    listOrders: () => orders,
    startPicking: (orderId) => {
      const order = findOrder(orderId);
      return replaceOrder({
        ...order,
        status: "picking",
        statusLabel: "Picking",
        deliveryStatus: "Picker is assembling the order",
      });
    },
    updateItemStatus: (orderId, itemId, status) => {
      const order = findOrder(orderId);
      return replaceOrder({
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, status } : item,
        ),
      });
    },
    completePicking: (orderId) => {
      const order = findOrder(orderId);
      return replaceOrder({
        ...order,
        status: "ready_for_delivery",
        statusLabel: "Ready",
        deliveryStatus: "Ready for courier assignment",
      });
    },
  };
};
