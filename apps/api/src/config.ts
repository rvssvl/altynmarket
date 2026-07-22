import type { Money } from "@altyn-market/domain";

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly publicApiBaseUrl: string;
  readonly publicRealtimeUrl: string;
  readonly flatDeliveryFee: Money;
}

export interface SecretConfig {
  readonly databaseUrl: string;
  readonly jwtAccessSecret: string;
  readonly jwtRefreshSecret: string;
  readonly paymentProvider: "kaspi" | "mock" | "card_pending";
  readonly kaspiMerchantId: string;
  readonly kaspiRedirectBaseUrl: string;
  readonly kaspiDeeplinkBaseUrl: string;
  readonly otpProvider: "console" | "pending";
  readonly smsProvider: "console" | "tc_telecom";
  readonly tcTelecomApiKey: string;
  readonly tcTelecomSenderId: string;
  readonly tcTelecomBaseUrl: string;
  readonly pushProvider: "console" | "pending";
  readonly bootstrapAdminPhone?: string;
}

export const readAppConfig = (
  env: Record<string, string | undefined>,
): AppConfig => ({
  nodeEnv:
    env.NODE_ENV === "production" || env.NODE_ENV === "test"
      ? env.NODE_ENV
      : "development",
  publicApiBaseUrl: env.PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  publicRealtimeUrl: env.PUBLIC_REALTIME_URL ?? "ws://localhost:4000/realtime",
  flatDeliveryFee: {
    amountMinor: Number(env.DELIVERY_FLAT_FEE_KZT ?? "1500") * 100,
    currency: "KZT",
  },
});

export const readSecretConfig = (
  env: Record<string, string | undefined>,
): SecretConfig => ({
  databaseUrl: isPostgresConnectionUrl(env.DATABASE_URL)
    ? env.DATABASE_URL
    : "",
  jwtAccessSecret: env.JWT_ACCESS_SECRET ?? "",
  jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? "",
  paymentProvider:
    env.PAYMENT_PROVIDER === "mock"
      ? "mock"
      : env.PAYMENT_PROVIDER === "card_pending"
        ? "card_pending"
        : "kaspi",
  kaspiMerchantId: env.KASPI_MERCHANT_ID ?? "altyn-market-dev",
  kaspiRedirectBaseUrl:
    env.KASPI_REDIRECT_BASE_URL ?? "https://kaspi.kz/pay/altyn-market",
  kaspiDeeplinkBaseUrl:
    env.KASPI_DEEPLINK_BASE_URL ?? "kaspi://pay/altyn-market",
  otpProvider: env.OTP_PROVIDER === "console" ? "console" : "pending",
  smsProvider: env.SMS_PROVIDER === "tc_telecom" ? "tc_telecom" : "console",
  tcTelecomApiKey: env.TC_TELECOM_API_KEY ?? "",
  tcTelecomSenderId: env.TC_TELECOM_SENDER_ID ?? "TC_INFO",
  tcTelecomBaseUrl:
    env.TC_TELECOM_BASE_URL ?? "https://acc.tc-telecom.com/api/v1",
  pushProvider: env.PUSH_PROVIDER === "console" ? "console" : "pending",
  ...(env.BOOTSTRAP_ADMIN_PHONE
    ? { bootstrapAdminPhone: env.BOOTSTRAP_ADMIN_PHONE }
    : {}),
});

const isPostgresConnectionUrl = (value: string | undefined): value is string =>
  Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
