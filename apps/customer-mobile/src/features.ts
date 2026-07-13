export const customerMvpFeatures = {
  auth: ["phone-otp-login", "session-refresh", "device-session-tracking"],
  shopping: ["catalog", "category-filtering", "cart", "checkout"],
  orders: ["active-order-status", "order-history", "item-cancelled-visibility"],
  notifications: ["push-order-events", "payment-issue-alerts"],
} as const;
