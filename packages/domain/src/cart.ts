import type { CartId, UserId } from "./ids.js";
import type { Product, ProductAvailability, ProductPrice } from "./catalog.js";

export interface CartLine {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
  readonly quantity: number;
}

export interface CartSnapshot {
  readonly id: CartId;
  readonly userId: UserId;
  readonly items: readonly CartLine[];
}
