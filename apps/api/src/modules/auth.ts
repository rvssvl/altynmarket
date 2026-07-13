import type {
  AuthSession,
  PhoneNumber,
  StaffProfile,
  UserRole,
} from "@altyn-market/domain";

export interface AuthService {
  readonly requestOtp: (phone: PhoneNumber) => Promise<void>;
  readonly verifyOtp: (
    phone: PhoneNumber,
    code: string,
    deviceName?: string,
  ) => Promise<AuthSession>;
  readonly requireRole: (
    session: AuthSession,
    roles: readonly UserRole[],
  ) => Promise<void>;
  readonly createStaffProfile: (
    input: CreateStaffProfileInput,
  ) => Promise<StaffProfile>;
  readonly deactivateStaffProfile: (staffId: string) => Promise<void>;
}

export interface CreateStaffProfileInput {
  readonly phone: PhoneNumber;
  readonly displayName: string;
  readonly roles: readonly Exclude<UserRole, "customer">[];
}
