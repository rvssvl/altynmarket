import type {
  Category,
  Product,
  ProductAvailability,
  ProductPrice,
} from "@altyn-market/domain";

export interface CatalogService {
  readonly listCategories: () => Promise<readonly Category[]>;
  readonly listProducts: () => Promise<readonly Product[]>;
  readonly upsertProduct: (input: Product) => Promise<Product>;
  readonly setPrice: (input: ProductPrice) => Promise<ProductPrice>;
  readonly setAvailability: (
    input: ProductAvailability,
  ) => Promise<ProductAvailability>;
}
