import type { AdminOperationsClient } from "@altyn-market/client";
import type { CheckoutResult, Order } from "@altyn-market/domain";
import { e2eConfig } from "../config.js";
import { customerClient, staffClient } from "./api.js";

export const createCustomerOrder = async (
  phone: string = e2eConfig.customerPhone,
): Promise<CheckoutResult> => {
  const customer = await customerClient(phone);
  const catalog = await customer.listProducts();
  const seedProduct = catalog.find((entry) =>
    entry.product.name.startsWith("E2E "),
  );
  if (!seedProduct) {
    throw new Error("No seeded E2E-* product in the catalog; run the seed first.");
  }
  await customer.setCartItemQuantity(seedProduct.product.id, 2);
  return customer.checkout({
    address: e2eConfig.checkoutAddress,
    paymentMethod: "card",
  });
};

const assignQuietly = async (assign: () => Promise<unknown>): Promise<void> => {
  try {
    await assign();
  } catch {
    // Already assigned (e.g. through the UI earlier in the test) — fine.
  }
};

export const pickOrder = async (
  admin: AdminOperationsClient,
  orderId: string,
  pickerId: string,
  pickerPhone: string = e2eConfig.pickerPhone,
): Promise<Order> => {
  await assignQuietly(() => admin.assignPicker(orderId, pickerId));
  const picker = await staffClient(pickerPhone);
  await picker.startPicking(orderId);
  const order = await picker.getOrder(orderId);
  for (const item of order.items) {
    await picker.updatePickingItem({
      orderId,
      itemId: item.id,
      status: "picked",
      pickedQuantity: item.requestedQuantity,
    });
  }
  return picker.completePicking(orderId);
};

// Finishes every unfinished task of the given staff pair so the app's task
// lists stay short and contain exactly one "Assigned" card per fixture run.
export const finishStaleTasks = async (
  pickerPhone: string,
  courierPhone: string,
): Promise<void> => {
  const picker = await staffClient(pickerPhone);
  for (const task of await picker.listPickingTasks()) {
    if (task.status !== "assigned" && task.status !== "in_progress") {
      continue;
    }
    try {
      if (task.status === "assigned") {
        await picker.startPicking(task.orderId);
      }
      const order = await picker.getOrder(task.orderId);
      for (const item of order.items) {
        if (item.status === "pending") {
          await picker.updatePickingItem({
            orderId: task.orderId,
            itemId: item.id,
            status: "picked",
            pickedQuantity: item.requestedQuantity,
          });
        }
      }
      await picker.completePicking(task.orderId);
    } catch {
      // Stale task in an odd state — leave it; the flows tap fresh ones first.
    }
  }

  const courier = await staffClient(courierPhone);
  for (const task of await courier.listDeliveryTasks()) {
    if (task.status === "delivered" || task.status === "cancelled") {
      continue;
    }
    for (const status of [
      "pickup_started",
      "picked_up",
      "delivering",
      "delivered",
    ] as const) {
      try {
        await courier.updateDeliveryStatus({ orderId: task.orderId, status });
      } catch {
        // Transition not applicable from the current state — keep going.
      }
    }
  }
};

export const deliverOrder = async (
  admin: AdminOperationsClient,
  orderId: string,
  courierId: string,
  courierPhone: string = e2eConfig.courierPhone,
): Promise<void> => {
  await assignQuietly(() => admin.assignCourier(orderId, courierId));
  const courier = await staffClient(courierPhone);
  for (const status of [
    "pickup_started",
    "picked_up",
    "delivering",
    "delivered",
  ] as const) {
    await courier.updateDeliveryStatus({ orderId, status });
  }
};
