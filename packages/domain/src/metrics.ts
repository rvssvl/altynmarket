import type { Money } from "./money.js";

export interface MvpMetrics {
  readonly orderCount: number;
  readonly averageCheck: Money;
  readonly deliveryFeeRevenue: Money;
  readonly pickingCost: Money;
  readonly refundAmount: Money;
  readonly grossProfitPerOrder: Money;
}
