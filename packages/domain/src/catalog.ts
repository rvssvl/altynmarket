import type { CategoryId, ProductId } from "./ids.js";
import type { Money } from "./money.js";

export type ProductUnit = "kg" | "g" | "piece" | "bundle" | "box";

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface Product {
  readonly id: ProductId;
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly description?: string;
  readonly unit: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive: boolean;
}

export interface ProductPrice {
  readonly productId: ProductId;
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly effectiveFrom: string;
}

export interface ProductAvailability {
  readonly productId: ProductId;
  readonly isAvailable: boolean;
  readonly note?: string;
  readonly updatedAt: string;
}
