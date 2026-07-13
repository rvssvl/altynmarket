import { describe, expect, it } from "vitest";
import { brand } from "./brand.js";
import type { Order } from "./order.js";
import { calculateFinalTotal, withCancelledItem } from "./workflow.js";

describe("order workflow", () => {
  it("removes cancelled items from final total while keeping delivery fee", () => {
    const order: Order = {
      id: brand("order-1"),
      customerId: brand("user-1"),
      addressId: brand("address-1"),
      status: "picking",
      items: [
        {
          id: brand("item-1"),
          productId: brand("product-1"),
          productNameSnapshot: "Tomatoes",
          unitSnapshot: "kg",
          requestedQuantity: 2,
          unitPriceSnapshot: { amountMinor: 50000, currency: "KZT" },
          status: "pending",
        },
        {
          id: brand("item-2"),
          productId: brand("product-2"),
          productNameSnapshot: "Apples",
          unitSnapshot: "kg",
          requestedQuantity: 1,
          unitPriceSnapshot: { amountMinor: 70000, currency: "KZT" },
          status: "pending",
        },
      ],
      goodsTotal: { amountMinor: 170000, currency: "KZT" },
      deliveryFee: { amountMinor: 150000, currency: "KZT" },
      finalTotal: { amountMinor: 320000, currency: "KZT" },
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    const updated = withCancelledItem(order, "item-2", "bad_quality");

    expect(updated.goodsTotal.amountMinor).toBe(100000);
    expect(updated.finalTotal).toEqual(
      calculateFinalTotal(updated.items, order.deliveryFee),
    );
    expect(updated.finalTotal.amountMinor).toBe(250000);
    expect(updated.items[1]?.status).toBe("cancelled");
  });
});
