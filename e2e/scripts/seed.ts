import { adminClient } from "../lib/api.js";
import { ensureSeedData } from "../lib/seed.js";

const admin = await adminClient();
const result = await ensureSeedData(admin);

console.log("E2E seed data is in place:");
console.log(`  category:  ${result.categoryId}`);
console.log(`  products:  ${result.productIds.join(", ")}`);
console.log(`  picker:    ${result.pickerId}`);
console.log(`  courier:   ${result.courierId}`);

// The Effect ManagedRuntime keeps sockets open, so the process never exits on its own.
process.exit(0);
