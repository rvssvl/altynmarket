import type {
  AuthorizePaymentInput,
  AuthorizePaymentResult,
  AuthSession,
  CapturePaymentInput,
  CapturePaymentResult,
  CancelAuthorizationInput,
  CreateStaffProfileInput,
  PaymentStatus,
  PhoneNumber,
  RealtimeEvent,
  RefundPaymentInput,
  RefundPaymentResult,
  RequestOtpResult,
  StaffId,
  StaffProfile,
  UserRole,
} from "@altyn-market/domain";
import { Context, Effect, Layer } from "effect";
import { AuthFailure, type AuthService } from "./auth-service.js";
import {
  ApiFailure,
  BackendInfrastructureFailure,
} from "./backend-failures.js";
import type { RuntimePaymentProvider } from "./modules/payments.js";
import {
  ProductImageValidationError,
  type ProductImageStorage,
  type StoredProductImage,
} from "./product-image-storage.js";
import type { RealtimeBus } from "./realtime.js";
import type { Store } from "./store.js";

export interface BackendInfrastructureDependencies {
  readonly store: Store;
  readonly auth: AuthService;
  readonly paymentProvider: RuntimePaymentProvider;
  readonly realtime: RealtimeBus;
}

export type AuthGatewayFailure = AuthFailure | BackendInfrastructureFailure;

export class AuthGateway extends Context.Service<
  AuthGateway,
  {
    readonly requestOtp: (
      phone: PhoneNumber,
    ) => Effect.Effect<RequestOtpResult, AuthGatewayFailure>;
    readonly verifyOtp: (
      phone: PhoneNumber,
      code: string,
      deviceName?: string,
    ) => Effect.Effect<AuthSession, AuthGatewayFailure>;
    readonly refreshSession: (
      refreshToken: string,
    ) => Effect.Effect<AuthSession, AuthGatewayFailure>;
    readonly getCurrentSession: (
      accessToken: string,
    ) => Effect.Effect<AuthSession, AuthGatewayFailure>;
    readonly requireRole: (
      session: AuthSession,
      roles: readonly UserRole[],
    ) => Effect.Effect<void, AuthGatewayFailure>;
    readonly createStaffProfile: (
      input: CreateStaffProfileInput,
    ) => Effect.Effect<StaffProfile, AuthGatewayFailure>;
    readonly deactivateStaffProfile: (
      staffId: StaffId,
    ) => Effect.Effect<void, AuthGatewayFailure>;
  }
>()("@altyn-market/api/AuthGateway") {}

export class ProductImages extends Context.Service<
  ProductImages,
  {
    readonly saveBase64: (
      dataBase64: string,
    ) => Effect.Effect<
      StoredProductImage,
      ApiFailure | BackendInfrastructureFailure
    >;
  }
>()("@altyn-market/api/ProductImages") {}

export const makeProductImagesLayer = (storage?: ProductImageStorage) =>
  Layer.succeed(
    ProductImages,
    ProductImages.of({
      saveBase64: (dataBase64) =>
        storage
          ? Effect.tryPromise({
              try: () => storage.saveBase64(dataBase64),
              catch: (cause) =>
                cause instanceof ProductImageValidationError
                  ? new ApiFailure(cause.message, 400)
                  : new BackendInfrastructureFailure({
                      message:
                        "Infrastructure operation failed: productImages.saveBase64.",
                      cause,
                    }),
            })
          : Effect.fail(
              new BackendInfrastructureFailure({
                message: "Product image storage is not configured.",
                cause: undefined,
              }),
            ),
    }),
  );

export class BackendPersistence extends Context.Service<
  BackendPersistence,
  {
    readonly execute: <A>(
      operation: string,
      work: (store: Store) => Promise<A>,
    ) => Effect.Effect<A, BackendInfrastructureFailure>;
  }
>()("@altyn-market/api/BackendPersistence") {}

export class PaymentGateway extends Context.Service<
  PaymentGateway,
  {
    readonly authorize: (
      input: AuthorizePaymentInput,
    ) => Effect.Effect<AuthorizePaymentResult, BackendInfrastructureFailure>;
    readonly capture: (
      input: CapturePaymentInput,
    ) => Effect.Effect<CapturePaymentResult, BackendInfrastructureFailure>;
    readonly cancelAuthorization: (
      input: CancelAuthorizationInput,
    ) => Effect.Effect<void, BackendInfrastructureFailure>;
    readonly refund: (
      input: RefundPaymentInput,
    ) => Effect.Effect<RefundPaymentResult, BackendInfrastructureFailure>;
    readonly getStatus: (
      providerPaymentId: string,
    ) => Effect.Effect<PaymentStatus, BackendInfrastructureFailure>;
  }
>()("@altyn-market/api/PaymentGateway") {}

export class RealtimePublisher extends Context.Service<
  RealtimePublisher,
  {
    readonly publish: (
      event: RealtimeEvent,
    ) => Effect.Effect<void, BackendInfrastructureFailure>;
  }
>()("@altyn-market/api/RealtimePublisher") {}

export const makeBackendInfrastructureLayer = (
  dependencies: BackendInfrastructureDependencies,
) =>
  Layer.mergeAll(
    Layer.succeed(
      BackendPersistence,
      BackendPersistence.of({
        execute: (operation, work) =>
          fromPromise(operation, () => work(dependencies.store)),
      }),
    ),
    Layer.succeed(
      AuthGateway,
      AuthGateway.of({
        requestOtp: (phone) =>
          fromAuthPromise("auth.requestOtp", () =>
            dependencies.auth.requestOtp(phone),
          ),
        verifyOtp: (phone, code, deviceName) =>
          fromAuthPromise("auth.verifyOtp", () =>
            dependencies.auth.verifyOtp(phone, code, deviceName),
          ),
        refreshSession: (refreshToken) =>
          fromAuthPromise("auth.refreshSession", () =>
            dependencies.auth.refreshSession(refreshToken),
          ),
        getCurrentSession: (accessToken) =>
          fromAuthPromise("auth.getCurrentSession", () =>
            dependencies.auth.getCurrentSession(accessToken),
          ),
        requireRole: (session, roles) =>
          fromAuthPromise("auth.requireRole", () =>
            dependencies.auth.requireRole(session, roles),
          ),
        createStaffProfile: (input) =>
          fromAuthPromise("auth.createStaffProfile", () =>
            dependencies.auth.createStaffProfile(input),
          ),
        deactivateStaffProfile: (staffId) =>
          fromAuthPromise("auth.deactivateStaffProfile", () =>
            dependencies.auth.deactivateStaffProfile(staffId),
          ),
      }),
    ),
    Layer.succeed(
      PaymentGateway,
      PaymentGateway.of({
        authorize: Effect.fnUntraced(function* (input: AuthorizePaymentInput) {
          return yield* fromPromise("payment.authorize", () =>
            dependencies.paymentProvider.authorize(input),
          );
        }),
        capture: Effect.fnUntraced(function* (input: CapturePaymentInput) {
          return yield* fromPromise("payment.capture", () =>
            dependencies.paymentProvider.capture(input),
          );
        }),
        cancelAuthorization: Effect.fnUntraced(function* (
          input: CancelAuthorizationInput,
        ) {
          return yield* fromPromise("payment.cancelAuthorization", () =>
            dependencies.paymentProvider.cancelAuthorization(input),
          );
        }),
        refund: Effect.fnUntraced(function* (input: RefundPaymentInput) {
          return yield* fromPromise("payment.refund", () =>
            dependencies.paymentProvider.refund(input),
          );
        }),
        getStatus: Effect.fnUntraced(function* (providerPaymentId: string) {
          return yield* fromPromise("payment.getStatus", () =>
            dependencies.paymentProvider.getStatus(providerPaymentId),
          );
        }),
      }),
    ),
    Layer.succeed(
      RealtimePublisher,
      RealtimePublisher.of({
        publish: Effect.fnUntraced(function* (event: RealtimeEvent) {
          return yield* fromPromise("realtime.publish", () =>
            dependencies.realtime.publish(event),
          );
        }),
      }),
    ),
  );

const fromPromise = <A>(
  operation: string,
  work: () => Promise<A>,
): Effect.Effect<A, BackendInfrastructureFailure> =>
  Effect.tryPromise({
    try: work,
    catch: (cause) =>
      new BackendInfrastructureFailure({
        message: `Infrastructure operation failed: ${operation}.`,
        cause,
      }),
  });

const fromAuthPromise = <A>(
  operation: string,
  work: () => Promise<A>,
): Effect.Effect<A, AuthGatewayFailure> =>
  Effect.tryPromise({
    try: work,
    catch: (cause) =>
      cause instanceof AuthFailure
        ? cause
        : new BackendInfrastructureFailure({
            message: `Infrastructure operation failed: ${operation}.`,
            cause,
          }),
  });
