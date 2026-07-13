import {
  createPostgresDatabase,
  migrations,
  runMigrations,
} from "@altyn-market/database";
import { createAuthService } from "./auth-service.js";
import {
  createBackendServices,
  ensureBootstrapAdmin,
} from "./backend-services.js";
import { readAppConfig, readSecretConfig } from "./config.js";
import { createHttpApiServer } from "./http.js";
import { createInMemoryStore } from "./in-memory-store.js";
import {
  createKaspiPaymentProvider,
  createMockPaymentProvider,
  createPendingCardPaymentProvider,
  type RuntimePaymentProvider,
} from "./modules/payments.js";
import { createPostgresStore } from "./postgres-store.js";
import { createInMemoryRealtimeBus } from "./realtime.js";

const appConfig = readAppConfig(process.env);
const secretConfig = readSecretConfig(process.env);
const realtime = createInMemoryRealtimeBus();

const store = secretConfig.databaseUrl
  ? await createPostgresRuntime(secretConfig.databaseUrl)
  : createInMemoryStore();

if (!secretConfig.databaseUrl) {
  console.warn("DATABASE_URL is not set; using in-memory backend store.");
}

const authService = createAuthService(store, {
  otpSecret: secretConfig.jwtAccessSecret || "dev-otp-secret",
  tokenSecret:
    secretConfig.jwtRefreshSecret ||
    secretConfig.jwtAccessSecret ||
    "dev-token-secret",
  exposeDevCode:
    appConfig.nodeEnv !== "production" ||
    process.env.AUTH_EXPOSE_DEV_CODE === "1",
  ...(process.env.AUTH_DEV_OTP ? { devOtp: process.env.AUTH_DEV_OTP } : {}),
});
await ensureBootstrapAdmin(authService, secretConfig.bootstrapAdminPhone);

const paymentProvider = createRuntimePaymentProvider(secretConfig);
const api = createBackendServices({
  store,
  auth: authService,
  paymentProvider,
  realtime,
  flatDeliveryFee: appConfig.flatDeliveryFee,
});
const server = createHttpApiServer(api, realtime);

await server.start(Number(process.env.PORT ?? "4000"));

async function createPostgresRuntime(databaseUrl: string) {
  const database = await createPostgresDatabase({
    databaseUrl,
    ssl: process.env.DATABASE_SSL === "1",
  });
  await runMigrations(database, migrations);
  return createPostgresStore(database);
}

function createRuntimePaymentProvider(
  secretConfig: ReturnType<typeof readSecretConfig>,
): RuntimePaymentProvider {
  switch (secretConfig.paymentProvider) {
    case "mock":
      return createMockPaymentProvider();
    case "card_pending":
      return createPendingCardPaymentProvider();
    case "kaspi":
      return createKaspiPaymentProvider({
        merchantId: secretConfig.kaspiMerchantId,
        redirectBaseUrl: secretConfig.kaspiRedirectBaseUrl,
        deeplinkBaseUrl: secretConfig.kaspiDeeplinkBaseUrl,
      });
  }
}
