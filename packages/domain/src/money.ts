export type Currency = "KZT";

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

export const kzt = (tenge: number): Money => ({
  amountMinor: Math.round(tenge * 100),
  currency: "KZT",
});
