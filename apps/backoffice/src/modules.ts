export const adminModules = [
  "orders",
  "catalog",
  "pricing",
  "staff",
  "payments",
  "delivery",
  "metrics",
  "audit-log",
] as const;

export type AdminModule = (typeof adminModules)[number];

export interface AdminRoute {
  readonly module: AdminModule;
  readonly path: string;
  readonly label: string;
  readonly requiredRole: "admin" | "super_admin";
}

export const adminRoutes: readonly AdminRoute[] = [
  { module: "orders", path: "/orders", label: "Orders", requiredRole: "admin" },
  {
    module: "catalog",
    path: "/catalog",
    label: "Catalog",
    requiredRole: "admin",
  },
  {
    module: "pricing",
    path: "/pricing",
    label: "Pricing",
    requiredRole: "admin",
  },
  {
    module: "staff",
    path: "/staff",
    label: "Staff",
    requiredRole: "super_admin",
  },
  {
    module: "payments",
    path: "/payments",
    label: "Payments",
    requiredRole: "admin",
  },
  {
    module: "delivery",
    path: "/delivery",
    label: "Delivery",
    requiredRole: "admin",
  },
  {
    module: "metrics",
    path: "/metrics",
    label: "Metrics",
    requiredRole: "admin",
  },
  {
    module: "audit-log",
    path: "/audit-log",
    label: "Audit Log",
    requiredRole: "super_admin",
  },
];
