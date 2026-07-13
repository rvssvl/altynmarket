import type { Order, OrderItem } from "./order.js";
import type { Money } from "./money.js";

export const calculateGoodsTotal = (items: readonly OrderItem[]): Money => {
  const amountMinor = items
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => {
      const quantity = item.pickedQuantity ?? item.requestedQuantity;
      return sum + Math.round(item.unitPriceSnapshot.amountMinor * quantity);
    }, 0);

  return { amountMinor, currency: "KZT" };
};

export const calculateFinalTotal = (
  items: readonly OrderItem[],
  deliveryFee: Money,
): Money => {
  const goodsTotal = calculateGoodsTotal(items);
  return {
    amountMinor: goodsTotal.amountMinor + deliveryFee.amountMinor,
    currency: goodsTotal.currency,
  };
};

export const withCancelledItem = (
  order: Order,
  itemId: string,
  reason: "unavailable" | "bad_quality",
): Order => {
  const items = order.items.map((item) =>
    item.id === itemId
      ? { ...item, status: "cancelled" as const, cancellationReason: reason }
      : item,
  );
  const goodsTotal = calculateGoodsTotal(items);
  const finalTotal = calculateFinalTotal(items, order.deliveryFee);
  return { ...order, items, goodsTotal, finalTotal };
};
