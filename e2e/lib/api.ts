import {
  createAdminOperationsClient,
  createAuthClient,
  createCustomerAppClient,
  createStaffOperationsClient,
} from "@altyn-market/client";
import type {
  AdminOperationsClient,
  CustomerAppClient,
  StaffOperationsClient,
} from "@altyn-market/client";
import type { AuthSession } from "@altyn-market/domain";
import { e2eConfig } from "../config.js";

export const loginWithOtp = async (phone: string): Promise<AuthSession> => {
  const auth = createAuthClient(e2eConfig.apiBaseUrl);
  const requested = await auth.requestOtp(phone);
  const code = requested.devCode ?? e2eConfig.devOtp;
  return auth.verifyOtp({ phone, code, deviceName: "e2e" });
};

export const adminClient = async (): Promise<AdminOperationsClient> => {
  const session = await loginWithOtp(e2eConfig.superAdminPhone);
  return createAdminOperationsClient(
    e2eConfig.apiBaseUrl,
    () => session.accessToken,
  );
};

export const customerClient = async (
  phone: string = e2eConfig.customerPhone,
): Promise<CustomerAppClient> => {
  const session = await loginWithOtp(phone);
  return createCustomerAppClient(
    e2eConfig.apiBaseUrl,
    () => session.accessToken,
  );
};

export const staffClient = async (
  phone: string,
): Promise<StaffOperationsClient> => {
  const session = await loginWithOtp(phone);
  return createStaffOperationsClient(
    e2eConfig.apiBaseUrl,
    () => session.accessToken,
  );
};
