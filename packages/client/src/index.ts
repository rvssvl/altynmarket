import type {
  AuthSession,
  Category,
  CheckoutResult,
  DeliveryTask,
  DeliveryTaskStatus,
  Money,
  MvpMetrics,
  Order,
  OrderItemStatus,
  OrderStatus,
  Payment,
  PaymentStatus,
  PickingTask,
  Product,
  ProductAvailability,
  ProductPrice,
  ProductUnit,
  PushPlatform,
  Refund,
  RequestOtpResult,
  StaffProfile,
  UserRole,
} from "@altyn-market/domain";
import {
  PaymentNotFound,
  RefundNotAllowed,
  RpcBackendFailure,
  RpcUnauthorized,
} from "@altyn-market/domain";
import { Effect, ManagedRuntime } from "effect";
import {
  AltynMarketRpcClient,
  makeAltynMarketRpcClientLayer,
} from "./effect-rpc.js";

export * from "./effect-rpc.js";

export type { PushPlatform };

export interface AuthClient {
  readonly requestOtp: (phone: string) => Promise<RequestOtpResult>;
  readonly verifyOtp: (input: {
    readonly phone: string;
    readonly code: string;
    readonly deviceName?: string;
  }) => Promise<AuthSession>;
  readonly refreshSession: (input: {
    readonly refreshToken: string;
    readonly deviceName?: string;
  }) => Promise<AuthSession>;
  readonly getCurrentSession: (accessToken: string) => Promise<AuthSession>;
}

export interface CustomerCatalogProduct {
  readonly product: Product;
  readonly price: ProductPrice;
}

export interface CustomerCartLine {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
  readonly quantity: number;
}

export interface CustomerCartSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly items: readonly CustomerCartLine[];
}

export interface CustomerCheckoutAddress {
  readonly label?: string;
  readonly city: string;
  readonly street: string;
  readonly apartment?: string;
  readonly entrance?: string;
  readonly floor?: string;
  readonly comment?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export type CustomerPaymentMethod = "kaspi" | "card";

export interface PushRegistration {
  readonly token: string;
  readonly platform: PushPlatform;
}

export interface CustomerAppClient {
  readonly listCategories: () => Promise<readonly Category[]>;
  readonly listProducts: () => Promise<readonly CustomerCatalogProduct[]>;
  readonly getCart: () => Promise<CustomerCartSnapshot>;
  readonly setCartItemQuantity: (
    productId: string,
    quantity: number,
  ) => Promise<CustomerCartSnapshot>;
  readonly removeCartItem: (productId: string) => Promise<CustomerCartSnapshot>;
  readonly checkout: (input: {
    readonly address: CustomerCheckoutAddress;
    readonly paymentMethod: CustomerPaymentMethod;
  }) => Promise<CheckoutResult>;
  readonly listOrders: () => Promise<readonly Order[]>;
  readonly getOrder: (orderId: string) => Promise<Order>;
  readonly registerPushToken: (
    input: PushRegistration,
  ) => Promise<PushRegistration>;
}

export type PickingTaskAssignment = PickingTask;

export interface StaffOperationsClient {
  readonly listPickingTasks: () => Promise<readonly PickingTaskAssignment[]>;
  readonly getOrder: (orderId: string) => Promise<Order>;
  readonly startPicking: (orderId: string) => Promise<Order>;
  readonly updatePickingItem: (input: {
    readonly orderId: string;
    readonly itemId: string;
    readonly status: Extract<OrderItemStatus, "picked" | "cancelled">;
    readonly pickedQuantity?: number;
    readonly reason?: "unavailable" | "bad_quality";
  }) => Promise<Order>;
  readonly completePicking: (orderId: string) => Promise<Order>;
  readonly listDeliveryTasks: () => Promise<readonly DeliveryTask[]>;
  readonly updateDeliveryStatus: (input: {
    readonly orderId: string;
    readonly status: Extract<
      DeliveryTaskStatus,
      "pickup_started" | "picked_up" | "delivering" | "delivered"
    >;
  }) => Promise<DeliveryTask>;
}

export interface AdminCatalogProduct {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
}

export interface AdminAuditLogEntry {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
}

export type StaffRole = Exclude<UserRole, "customer">;

export interface AdminCategoryDraft {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface AdminCategoryPatch {
  readonly name?: string;
  readonly slug?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface AdminProductDraft {
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string;
  readonly unit: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive: boolean;
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly isAvailable: boolean;
  readonly availabilityNote?: string;
}

export interface AdminProductPatch {
  readonly categoryId?: string;
  readonly name?: string;
  readonly description?: string;
  readonly unit?: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive?: boolean;
}

export interface AdminOperationsClient {
  readonly listOrders: (status?: OrderStatus) => Promise<readonly Order[]>;
  readonly listCategories: () => Promise<readonly Category[]>;
  readonly listProducts: () => Promise<readonly AdminCatalogProduct[]>;
  readonly createCategory: (input: AdminCategoryDraft) => Promise<Category>;
  readonly updateCategory: (
    categoryId: string,
    input: AdminCategoryPatch,
  ) => Promise<Category>;
  readonly deleteCategory: (categoryId: string) => Promise<Category>;
  readonly createProduct: (
    input: AdminProductDraft,
  ) => Promise<AdminCatalogProduct>;
  readonly updateProduct: (
    productId: string,
    input: AdminProductPatch,
  ) => Promise<AdminCatalogProduct>;
  readonly deleteProduct: (productId: string) => Promise<void>;
  readonly updateProductAvailability: (
    productId: string,
    input: { readonly isAvailable: boolean; readonly note?: string },
  ) => Promise<ProductAvailability>;
  readonly updateProductPrice: (
    productId: string,
    input: {
      readonly customerPrice: Money;
      readonly internalCost?: Money;
      readonly effectiveFrom?: string;
    },
  ) => Promise<ProductPrice>;
  readonly listProductPriceHistory: (
    productId: string,
  ) => Promise<readonly ProductPrice[]>;
  readonly assignPicker: (
    orderId: string,
    pickerId: string,
  ) => Promise<PickingTask>;
  readonly assignCourier: (
    orderId: string,
    courierId: string,
  ) => Promise<DeliveryTask>;
  readonly createStaffProfile: (input: {
    readonly phone: string;
    readonly displayName: string;
    readonly roles: readonly StaffRole[];
  }) => Promise<StaffProfile>;
  readonly listStaffProfiles: () => Promise<readonly StaffProfile[]>;
  readonly deactivateStaffProfile: (staffId: string) => Promise<void>;
  readonly listPayments: () => Promise<readonly Payment[]>;
  readonly listRefunds: () => Promise<readonly Refund[]>;
  readonly refundPayment: (input: {
    readonly paymentId: string;
    readonly amount: Money;
    readonly reason: string;
  }) => Promise<Refund>;
  readonly updatePaymentStatus: (input: {
    readonly paymentId: string;
    readonly status: PaymentStatus;
  }) => Promise<Payment>;
  readonly listAuditLog: (
    limit?: number,
  ) => Promise<readonly AdminAuditLogEntry[]>;
  readonly getMetrics: () => Promise<MvpMetrics>;
  readonly uploadProductImage: (
    dataBase64: string,
  ) => Promise<{ readonly url: string }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type RpcClientService = AltynMarketRpcClient["Service"];

type RpcCall = <A, E>(
  work: (client: RpcClientService) => Effect.Effect<A, E>,
) => Promise<A>;

const createRpcCaller = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): RpcCall => {
  const runtime = ManagedRuntime.make(
    makeAltynMarketRpcClientLayer({
      rpcUrl: `${apiBaseUrl}/rpc`,
      accessToken: { getAccessToken: async () => getAccessToken() },
    }),
  );

  return async (work) => {
    try {
      return await runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* AltynMarketRpcClient;
          return yield* work(client);
        }),
      );
    } catch (cause) {
      throw toApiError(cause);
    }
  };
};

const toApiError = (cause: unknown): ApiError => {
  if (cause instanceof RpcBackendFailure) {
    return new ApiError(cause.message, statusFromCode(cause.code));
  }

  if (cause instanceof RpcUnauthorized) {
    return new ApiError(cause.message, 401);
  }

  if (cause instanceof PaymentNotFound) {
    return new ApiError("Payment not found.", 404);
  }

  if (cause instanceof RefundNotAllowed) {
    return new ApiError(cause.message, 409);
  }

  if (cause instanceof Error) {
    return new ApiError(cause.message, 0);
  }

  return new ApiError("Request failed.", 0);
};

const statusFromCode = (code: string): number => {
  const match = /^(?:API|AUTH)_(\d{3})$/.exec(code);
  return match?.[1] ? Number(match[1]) : 500;
};

const asDomain = <T>(value: unknown): T => value as T;

export const createAuthClient = (apiBaseUrl: string): AuthClient => {
  let sessionToken: string | undefined;
  const call = createRpcCaller(apiBaseUrl, () => sessionToken);

  return {
    requestOtp: (phone) =>
      call((client) => client.RequestOtp({ phone: { e164: phone } })).then(
        asDomain<RequestOtpResult>,
      ),
    verifyOtp: ({ phone, code, deviceName }) =>
      call((client) =>
        client.VerifyOtp({
          phone: { e164: phone },
          code,
          ...(deviceName === undefined ? {} : { deviceName }),
        }),
      ).then(asDomain<AuthSession>),
    refreshSession: ({ refreshToken, deviceName }) =>
      call((client) =>
        client.RefreshSession({
          refreshToken,
          ...(deviceName === undefined ? {} : { deviceName }),
        }),
      ).then(asDomain<AuthSession>),
    getCurrentSession: (accessToken) => {
      sessionToken = accessToken;
      return call((client) => client.GetCurrentSession()).then(
        asDomain<AuthSession>,
      );
    },
  };
};

export const createCustomerAppClient = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): CustomerAppClient => {
  const call = createRpcCaller(apiBaseUrl, getAccessToken);

  return {
    listCategories: () =>
      call((client) => client.ListCategories()).then(
        asDomain<readonly Category[]>,
      ),
    listProducts: async () => {
      const catalog = await call((client) => client.ListCatalog());
      return asDomain<readonly CustomerCatalogProduct[]>(
        catalog.filter((entry) => entry.product.isActive),
      );
    },
    getCart: () =>
      call((client) => client.GetCart()).then(asDomain<CustomerCartSnapshot>),
    setCartItemQuantity: (productId, quantity) =>
      call((client) => client.AddCartItem({ productId, quantity })).then(
        asDomain<CustomerCartSnapshot>,
      ),
    removeCartItem: (productId) =>
      call((client) => client.RemoveCartItem({ productId })).then(
        asDomain<CustomerCartSnapshot>,
      ),
    checkout: ({ address }) =>
      call((client) =>
        client.Checkout({ address: toAddressPayload(address) }),
      ).then(asDomain<CheckoutResult>),
    listOrders: () =>
      call((client) => client.ListMyOrders()).then(asDomain<readonly Order[]>),
    getOrder: (orderId) =>
      call((client) => client.GetOrder({ orderId })).then(asDomain<Order>),
    registerPushToken: async (input) => {
      const subscription = await call((client) =>
        client.RegisterPushToken(input),
      );
      return { token: subscription.token, platform: subscription.platform };
    },
  };
};

export const createStaffOperationsClient = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): StaffOperationsClient => {
  const call = createRpcCaller(apiBaseUrl, getAccessToken);

  return {
    listPickingTasks: () =>
      call((client) => client.ListPickingTasks()).then(
        asDomain<readonly PickingTask[]>,
      ),
    getOrder: (orderId) =>
      call((client) => client.GetOrder({ orderId })).then(asDomain<Order>),
    startPicking: (orderId) =>
      call((client) => client.StartPicking({ orderId })).then(asDomain<Order>),
    updatePickingItem: (input) =>
      call((client) =>
        client.UpdatePickingItem({
          orderId: input.orderId,
          itemId: input.itemId,
          status: input.status,
          ...(input.pickedQuantity === undefined
            ? {}
            : { pickedQuantity: input.pickedQuantity }),
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        }),
      ).then(asDomain<Order>),
    completePicking: (orderId) =>
      call((client) => client.CompletePicking({ orderId })).then(
        asDomain<Order>,
      ),
    listDeliveryTasks: () =>
      call((client) => client.ListDeliveryTasks()).then(
        asDomain<readonly DeliveryTask[]>,
      ),
    updateDeliveryStatus: (input) =>
      call((client) => client.UpdateDeliveryStatus(input)).then(
        asDomain<DeliveryTask>,
      ),
  };
};

export const createAdminOperationsClient = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): AdminOperationsClient => {
  const call = createRpcCaller(apiBaseUrl, getAccessToken);

  return {
    listOrders: (status) =>
      call((client) =>
        client.ListAdminOrders(status === undefined ? {} : { status }),
      ).then(asDomain<readonly Order[]>),
    listCategories: () =>
      call((client) => client.ListAdminCategories()).then(
        asDomain<readonly Category[]>,
      ),
    listProducts: () =>
      call((client) => client.ListAdminProducts()).then(
        asDomain<readonly AdminCatalogProduct[]>,
      ),
    createCategory: (input) =>
      call((client) => client.CreateCategory(input)).then(asDomain<Category>),
    updateCategory: (categoryId, input) =>
      call((client) =>
        client.UpdateCategory({
          categoryId,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.sortOrder === undefined
            ? {}
            : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        }),
      ).then(asDomain<Category>),
    deleteCategory: (categoryId) =>
      call((client) => client.DeleteCategory({ categoryId })).then(
        asDomain<Category>,
      ),
    createProduct: (input) =>
      call((client) =>
        client.CreateProduct({
          categoryId: input.categoryId,
          name: input.name,
          unit: input.unit,
          isActive: input.isActive,
          customerPrice: input.customerPrice,
          isAvailable: input.isAvailable,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
          ...(input.internalCost === undefined
            ? {}
            : { internalCost: input.internalCost }),
          ...(input.availabilityNote === undefined
            ? {}
            : { availabilityNote: input.availabilityNote }),
        }),
      ).then(asDomain<AdminCatalogProduct>),
    updateProduct: (productId, input) =>
      call((client) =>
        client.UpdateProduct({
          productId,
          ...(input.categoryId === undefined
            ? {}
            : { categoryId: input.categoryId }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.unit === undefined ? {} : { unit: input.unit }),
          ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        }),
      ).then(asDomain<AdminCatalogProduct>),
    deleteProduct: (productId) =>
      call((client) => client.DeleteProduct({ productId })).then(() => {}),
    updateProductAvailability: (productId, input) =>
      call((client) =>
        client.UpdateProductAvailability({
          productId,
          isAvailable: input.isAvailable,
          ...(input.note === undefined ? {} : { note: input.note }),
        }),
      ).then(asDomain<ProductAvailability>),
    updateProductPrice: (productId, input) =>
      call((client) =>
        client.UpdateProductPrice({
          productId,
          customerPrice: input.customerPrice,
          ...(input.internalCost === undefined
            ? {}
            : { internalCost: input.internalCost }),
          ...(input.effectiveFrom === undefined
            ? {}
            : { effectiveFrom: input.effectiveFrom }),
        }),
      ).then(asDomain<ProductPrice>),
    listProductPriceHistory: (productId) =>
      call((client) => client.ListProductPriceHistory({ productId })).then(
        asDomain<readonly ProductPrice[]>,
      ),
    assignPicker: (orderId, pickerId) =>
      call((client) => client.AssignPicker({ orderId, pickerId })).then(
        asDomain<PickingTask>,
      ),
    assignCourier: (orderId, courierId) =>
      call((client) => client.AssignCourier({ orderId, courierId })).then(
        asDomain<DeliveryTask>,
      ),
    createStaffProfile: (input) =>
      call((client) =>
        client.CreateStaffProfile({
          phone: { e164: input.phone },
          displayName: input.displayName,
          roles: input.roles,
        }),
      ).then(asDomain<StaffProfile>),
    listStaffProfiles: () =>
      call((client) => client.ListStaffProfiles()).then(
        asDomain<readonly StaffProfile[]>,
      ),
    deactivateStaffProfile: (staffId) =>
      call((client) => client.DeactivateStaffProfile({ staffId })).then(
        () => {},
      ),
    listPayments: () =>
      call((client) => client.ListAdminPayments()).then(
        asDomain<readonly Payment[]>,
      ),
    listRefunds: () =>
      call((client) => client.ListAdminRefunds()).then(
        asDomain<readonly Refund[]>,
      ),
    refundPayment: (input) =>
      call((client) => client.RefundPayment(input)).then(asDomain<Refund>),
    updatePaymentStatus: (input) =>
      call((client) => client.UpdatePaymentStatus(input)).then(
        asDomain<Payment>,
      ),
    listAuditLog: (limit) =>
      call((client) =>
        client.ListAuditLog(limit === undefined ? {} : { limit }),
      ).then(asDomain<readonly AdminAuditLogEntry[]>),
    getMetrics: () =>
      call((client) => client.GetMetrics()).then(asDomain<MvpMetrics>),
    uploadProductImage: (dataBase64) =>
      call((client) => client.UploadProductImage({ dataBase64 })),
  };
};

const toAddressPayload = (address: CustomerCheckoutAddress) => ({
  city: address.city,
  street: address.street,
  ...(address.label === undefined ? {} : { label: address.label }),
  ...(address.apartment === undefined ? {} : { apartment: address.apartment }),
  ...(address.entrance === undefined ? {} : { entrance: address.entrance }),
  ...(address.floor === undefined ? {} : { floor: address.floor }),
  ...(address.comment === undefined ? {} : { comment: address.comment }),
  ...(address.latitude === undefined ? {} : { latitude: address.latitude }),
  ...(address.longitude === undefined ? {} : { longitude: address.longitude }),
});
