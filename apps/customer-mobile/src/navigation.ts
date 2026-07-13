export type CustomerRoute =
  | "OtpLogin"
  | "Catalog"
  | "Product"
  | "Cart"
  | "Checkout"
  | "OrderStatus"
  | "OrderHistory"
  | "Profile";

export const customerRoutes: readonly CustomerRoute[] = [
  "OtpLogin",
  "Catalog",
  "Product",
  "Cart",
  "Checkout",
  "OrderStatus",
  "OrderHistory",
  "Profile",
];
