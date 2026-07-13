export type StaffRoute =
  | "StaffLogin"
  | "RoleHome"
  | "PickingQueue"
  | "PickingTask"
  | "DeliveryQueue"
  | "DeliveryTask"
  | "Profile";

export const staffRoutes: readonly StaffRoute[] = [
  "StaffLogin",
  "RoleHome",
  "PickingQueue",
  "PickingTask",
  "DeliveryQueue",
  "DeliveryTask",
  "Profile",
];
