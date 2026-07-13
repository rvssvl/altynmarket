export const staffMvpFeatures = {
  auth: [
    "staff-phone-otp-login",
    "picker-courier-role-mode",
    "staff-access-guard",
  ],
  picker: [
    "assigned-picking-tasks",
    "confirm-picked-item",
    "cancel-unavailable-item",
    "cancel-bad-quality-item",
    "complete-picking",
  ],
  courier: [
    "assigned-deliveries",
    "pickup-status",
    "delivery-status",
    "complete-delivery",
  ],
  notifications: [
    "foreground-new-task-alert",
    "assignment-changed-push",
    "urgent-admin-note",
  ],
  reliability: [
    "retained-offline-queue",
    "loading-state",
    "action-error-banner",
  ],
} as const;
