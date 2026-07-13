import type {
  AuthSession,
  PhoneNumber,
  RequestOtpResult,
  StaffProfile,
  UserRole,
} from "@altyn-market/domain";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { StaffProfileInput, Store, StoredSessionRecord } from "./store.js";

export interface AuthService {
  readonly requestOtp: (phone: PhoneNumber) => Promise<RequestOtpResult>;
  readonly verifyOtp: (
    phone: PhoneNumber,
    code: string,
    deviceName?: string,
  ) => Promise<AuthSession>;
  readonly refreshSession: (refreshToken: string) => Promise<AuthSession>;
  readonly getCurrentSession: (accessToken: string) => Promise<AuthSession>;
  readonly requireRole: (
    session: AuthSession,
    roles: readonly UserRole[],
  ) => Promise<void>;
  readonly createStaffProfile: (
    input: StaffProfileInput,
  ) => Promise<StaffProfile>;
  readonly deactivateStaffProfile: (staffId: string) => Promise<void>;
}

export interface AuthServiceOptions {
  readonly otpSecret: string;
  readonly tokenSecret: string;
  readonly devOtp?: string;
  readonly exposeDevCode?: boolean;
  readonly accessTtlMs?: number;
  readonly refreshTtlMs?: number;
  readonly now?: () => Date;
}

const otpTtlMs = 5 * 60 * 1000;
const sessionTtlMs = 24 * 60 * 60 * 1000;
const refreshTtlMs = 30 * 24 * 60 * 60 * 1000;
const maxOtpAttempts = 5;

export const createAuthService = (
  store: Store,
  options: AuthServiceOptions,
): AuthService => {
  const now = options.now ?? (() => new Date());
  const accessTtl = options.accessTtlMs ?? sessionTtlMs;
  const refreshTtl = options.refreshTtlMs ?? refreshTtlMs;

  const createPersistedSession = async (input: {
    readonly userId: string;
    readonly deviceSessionId: string;
    readonly customer: StoredSessionRecord["customer"];
    readonly staff?: StaffProfile;
  }): Promise<AuthSession> => {
    const accessToken = createSessionToken();
    const refreshToken = createSessionToken();
    const accessExpiresAt = new Date(now().getTime() + accessTtl).toISOString();
    const refreshExpiresAt = new Date(
      now().getTime() + refreshTtl,
    ).toISOString();

    await store.auth.createSession({
      sessionId: randomUUID(),
      refreshTokenId: randomUUID(),
      userId: input.customer.id,
      deviceSessionId: input.deviceSessionId,
      accessTokenHash: hashToken(options.tokenSecret, accessToken),
      accessExpiresAt,
      refreshTokenHash: hashToken(options.tokenSecret, refreshToken),
      refreshExpiresAt,
    });

    return toAuthSession({
      accessToken,
      refreshToken,
      expiresAt: accessExpiresAt,
      customer: input.customer,
      ...(input.staff ? { staff: input.staff } : {}),
    });
  };

  return {
    requestOtp: async (phone) => {
      const code = options.devOtp ?? createOtpCode();
      await store.auth.createOtpChallenge({
        id: randomUUID(),
        phone,
        codeHash: hashOtp(options.otpSecret, phone, code),
        attempts: 0,
        expiresAt: new Date(now().getTime() + otpTtlMs).toISOString(),
      });

      if (process.env.NODE_ENV !== "test") {
        console.log(`OTP for ${phone.e164}: ${code}`);
      }

      return options.exposeDevCode ? { ok: true, devCode: code } : { ok: true };
    },
    verifyOtp: async (phone, code, deviceName) => {
      const challenge = await store.auth.findActiveOtpChallenge(phone, now());

      if (!challenge) {
        throw new AuthFailure("OTP expired. Request a new code.");
      }

      if (challenge.attempts >= maxOtpAttempts) {
        await store.auth.consumeOtpChallenge(challenge.id);
        throw new AuthFailure("Too many attempts. Request a new code.");
      }

      if (
        challenge.codeHash !== hashOtp(options.otpSecret, phone, code.trim())
      ) {
        const attempts = challenge.attempts + 1;
        if (attempts >= maxOtpAttempts) {
          await store.auth.consumeOtpChallenge(challenge.id);
        } else {
          await store.auth.updateOtpAttempts(challenge.id, attempts);
        }
        throw new AuthFailure("Invalid OTP code.");
      }

      await store.auth.consumeOtpChallenge(challenge.id);

      const customer = await store.auth.upsertCustomer(phone, deviceName);
      const staff = await store.staff.getByUserId(customer.id);
      const deviceSessionId = randomUUID();
      await store.auth.createDeviceSession({
        id: deviceSessionId,
        userId: customer.id,
        ...(deviceName ? { deviceName } : {}),
      });

      return createPersistedSession({
        userId: customer.id,
        deviceSessionId,
        customer,
        ...(staff ? { staff } : {}),
      });
    },
    refreshSession: async (refreshToken) => {
      const record = await store.auth.findRefreshTokenByHash(
        hashToken(options.tokenSecret, refreshToken),
        now(),
      );

      if (!record) {
        throw new AuthFailure("Refresh token expired.");
      }

      const replacementRefreshTokenId = randomUUID();
      const accessToken = createSessionToken();
      const nextRefreshToken = createSessionToken();
      const accessExpiresAt = new Date(
        now().getTime() + accessTtl,
      ).toISOString();
      const refreshExpiresAt = new Date(
        now().getTime() + refreshTtl,
      ).toISOString();
      const sessionId = randomUUID();

      await store.auth.createSession({
        sessionId,
        refreshTokenId: replacementRefreshTokenId,
        userId: record.customer.id,
        deviceSessionId: record.deviceSessionId,
        accessTokenHash: hashToken(options.tokenSecret, accessToken),
        accessExpiresAt,
        refreshTokenHash: hashToken(options.tokenSecret, nextRefreshToken),
        refreshExpiresAt,
      });
      await store.auth.markRefreshTokenUsed(
        record.id,
        replacementRefreshTokenId,
      );
      await store.auth.revokeSession(record.sessionId);

      return toAuthSession({
        accessToken,
        refreshToken: nextRefreshToken,
        expiresAt: accessExpiresAt,
        customer: record.customer,
        ...(record.staff ? { staff: record.staff } : {}),
      });
    },
    getCurrentSession: async (accessToken) => {
      const record = await store.auth.findSessionByAccessTokenHash(
        hashToken(options.tokenSecret, accessToken),
        now(),
      );

      if (!record) {
        throw new AuthFailure("Session expired.");
      }

      await store.auth.touchSession(record.id);

      return toAuthSession({
        accessToken,
        refreshToken: "",
        expiresAt: record.expiresAt,
        customer: record.customer,
        ...(record.staff ? { staff: record.staff } : {}),
      });
    },
    requireRole: async (session, roles) => {
      const sessionRoles = session.roles ?? ["customer"];

      if (
        sessionRoles.includes("super_admin") ||
        roles.some((role) => sessionRoles.includes(role))
      ) {
        return;
      }

      throw new AuthFailure("Forbidden.", 403);
    },
    createStaffProfile: (input) => store.staff.upsertStaffProfile(input),
    deactivateStaffProfile: (staffId) =>
      store.staff.deactivateStaffProfile(staffId as StaffProfile["id"]),
  };
};

export class AuthFailure extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
}

const createOtpCode = (): string => String(randomInt(100000, 999999));

const createSessionToken = (): string => randomBytes(32).toString("base64url");

const hashOtp = (secret: string, phone: PhoneNumber, code: string): string =>
  hashToken(secret, `${phone.e164}:${code}`);

const hashToken = (secret: string, token: string): string =>
  createHash("sha256").update(`${secret}:${token}`).digest("base64url");

const toAuthSession = (input: {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly customer: AuthSession["customer"];
  readonly staff?: StaffProfile;
}): AuthSession => {
  const roles: readonly UserRole[] = input.staff
    ? ["customer", ...input.staff.roles]
    : ["customer"];

  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    customer: input.customer,
    roles,
    ...(input.staff ? { staff: input.staff } : {}),
  };
};
