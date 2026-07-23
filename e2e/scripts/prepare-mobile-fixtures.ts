// Prepares fresh staging fixtures for the mobile Maestro flows. The iOS and
// Android jobs run concurrently, so each platform gets its own staff accounts
// and its own orders:
//   - a picking task per picker (Android + iOS)
//   - a picked order with an assigned courier, per courier (Android + iOS)
import { adminClient } from "../lib/api.js";
import {
  createCustomerOrder,
  finishStaleTasks,
  pickOrder,
} from "../lib/advance-order.js";
import { ensureSeedData } from "../lib/seed.js";
import { e2eConfig } from "../config.js";

const admin = await adminClient();
const seed = await ensureSeedData(admin);

const prepare = async (
  label: string,
  customerPhone: string,
  pickerId: string,
  pickerPhone: string,
  courierId: string,
  courierPhone: string,
) => {
  // Close out leftovers from previous runs first, so exactly one "Assigned"
  // card is waiting for each flow.
  await finishStaleTasks(pickerPhone, courierPhone);

  const picking = await createCustomerOrder(customerPhone);
  await admin.assignPicker(picking.order.id, pickerId);

  const delivery = await createCustomerOrder(customerPhone);
  await pickOrder(admin, delivery.order.id, pickerId, pickerPhone);
  await admin.assignCourier(delivery.order.id, courierId);

  console.log(`  ${label}: picking=${picking.order.id} delivery=${delivery.order.id}`);
};

console.log("Mobile e2e fixtures ready:");
await prepare(
  "android",
  e2eConfig.customerPhone,
  seed.pickerId,
  e2eConfig.pickerPhone,
  seed.courierId,
  e2eConfig.courierPhone,
);
await prepare(
  "ios",
  e2eConfig.customerPhoneIos,
  seed.pickerIosId,
  e2eConfig.pickerPhoneIos,
  seed.courierIosId,
  e2eConfig.courierPhoneIos,
);

// The Effect ManagedRuntime keeps sockets open, so the process never exits on its own.
process.exit(0);
