import type { StaffId, UserId } from "./ids.js";

export type UserRole =
  | "customer"
  | "picker"
  | "courier"
  | "admin"
  | "super_admin";

export interface PhoneNumber {
  readonly e164: string;
}

export interface Customer {
  readonly id: UserId;
  readonly phone: PhoneNumber;
  readonly fullName?: string;
  readonly createdAt: string;
}

export interface StaffProfile {
  readonly id: StaffId;
  readonly userId: UserId;
  readonly roles: readonly Exclude<UserRole, "customer">[];
  readonly displayName: string;
  readonly isActive: boolean;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly customer: Customer;
  readonly staff?: StaffProfile;
  readonly roles?: readonly UserRole[];
}

export interface RequestOtpInput {
  readonly phone: PhoneNumber;
}

export interface RequestOtpResult {
  readonly ok: true;
  readonly devCode?: string;
}

export interface VerifyOtpInput {
  readonly phone: PhoneNumber;
  readonly code: string;
  readonly deviceName?: string;
}

export interface RefreshSessionInput {
  readonly refreshToken: string;
  readonly deviceName?: string;
}
