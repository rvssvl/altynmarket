import type {
  ApiContract,
  Category,
  CheckoutResult,
  AuthSession,
  Product,
  ProductAvailability,
  ProductPrice,
  DeliveryTask,
  DeliveryTaskStatus,
  Order,
  OrderItemStatus,
  RealtimeEvent,
  RequestOtpResult,
} from "@altyn-market/domain";

export interface AltynMarketClient {
  readonly api: ApiContract;
  readonly realtime: RealtimeClient;
}

export interface RealtimeClient {
  readonly connect: () => Promise<void>;
  readonly close: () => void;
  readonly onEvent: (handler: (event: RealtimeEvent) => void) => () => void;
}

export interface ClientConfig {
  readonly apiBaseUrl: string;
  readonly realtimeUrl: string;
  readonly getAccessToken: () => Promise<string | undefined>;
}

export const createClientConfig = (input: ClientConfig): ClientConfig => input;

export interface SessionStore {
  readonly getAccessToken: () => Promise<string | undefined>;
  readonly setTokens: (tokens: {
    readonly accessToken: string;
    readonly refreshToken: string;
  }) => Promise<void>;
  readonly clear: () => Promise<void>;
}

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

export type PushPlatform = "ios" | "android" | "web" | "unknown";

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

export type MockOrderItemStatus = "selected" | "confirmed" | "cancelled";

export interface MockOrderItem {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly price: number;
  readonly status: MockOrderItemStatus;
}

export type MockOrderStatus =
  | "payment_authorized"
  | "picking"
  | "ready_for_delivery";

export interface MockOrder {
  readonly id: string;
  readonly status: MockOrderStatus;
  readonly statusLabel: string;
  readonly placedAt: string;
  readonly paymentStatus: string;
  readonly deliveryStatus: string;
  readonly address: string;
  readonly deliveryFee: number;
  readonly providerPaymentId: string;
  readonly items: readonly MockOrderItem[];
}

export interface MockOrdersClient {
  readonly createOrder: (input: {
    readonly providerPaymentId: string;
    readonly address: string;
    readonly deliveryFee: number;
    readonly items: readonly Omit<MockOrderItem, "status">[];
  }) => Promise<MockOrder>;
  readonly listOrders: () => Promise<readonly MockOrder[]>;
  readonly startPicking: (orderId: string) => Promise<MockOrder>;
  readonly updateItemStatus: (input: {
    readonly orderId: string;
    readonly itemId: string;
    readonly status: MockOrderItemStatus;
  }) => Promise<MockOrder>;
  readonly completePicking: (orderId: string) => Promise<MockOrder>;
}

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

export type PickingTaskAssignment = ApiContract["picking"] extends {
  readonly listAssignedTasks: () => Promise<infer T>;
}
  ? T extends readonly (infer Task)[]
    ? Task
    : never
  : never;

export const createAuthClient = (apiBaseUrl: string): AuthClient => ({
  requestOtp: (phone) =>
    postJson<RequestOtpResult>(apiBaseUrl, "/api/auth/request-otp", { phone }),
  verifyOtp: (input) =>
    postJson<AuthSession>(apiBaseUrl, "/api/auth/verify-otp", input),
  refreshSession: (input) =>
    postJson<AuthSession>(apiBaseUrl, "/api/auth/refresh", input),
  getCurrentSession: (accessToken) =>
    getJson<AuthSession>(apiBaseUrl, "/api/auth/me", accessToken),
});

export const createCustomerAppClient = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): CustomerAppClient => ({
  listCategories: async () => {
    const result = await getPublicJson<{
      readonly categories: readonly Category[];
    }>(apiBaseUrl, "/api/catalog/categories");
    return result.categories;
  },
  listProducts: async () => {
    const result = await getPublicJson<{
      readonly products: readonly Product[];
    }>(apiBaseUrl, "/api/catalog/products");

    const products = result.products.filter((product) => product.isActive);
    return Promise.all(
      products.map(async (product) => ({
        product,
        price: await getPublicJson<ProductPrice>(
          apiBaseUrl,
          `/api/catalog/products/${encodeURIComponent(product.id)}/price`,
        ),
      })),
    );
  },
  getCart: () =>
    getAuthorizedJson<CustomerCartSnapshot>(
      apiBaseUrl,
      "/api/cart",
      requireAccessToken(getAccessToken),
    ),
  setCartItemQuantity: (productId, quantity) =>
    postAuthorizedJson<CustomerCartSnapshot>(
      apiBaseUrl,
      "/api/cart/items",
      { productId, quantity },
      requireAccessToken(getAccessToken),
    ),
  removeCartItem: (productId) =>
    deleteAuthorizedJson<CustomerCartSnapshot>(
      apiBaseUrl,
      `/api/cart/items/${encodeURIComponent(productId)}`,
      requireAccessToken(getAccessToken),
    ),
  checkout: ({ address, paymentMethod }) =>
    postAuthorizedJson<CheckoutResult>(
      apiBaseUrl,
      "/api/checkout",
      { address, paymentMethod },
      requireAccessToken(getAccessToken),
    ),
  listOrders: async () => {
    const result = await getAuthorizedJson<{
      readonly orders: readonly Order[];
    }>(apiBaseUrl, "/api/orders", requireAccessToken(getAccessToken));
    return result.orders;
  },
  getOrder: (orderId) =>
    getAuthorizedJson<Order>(
      apiBaseUrl,
      `/api/orders/${encodeURIComponent(orderId)}`,
      requireAccessToken(getAccessToken),
    ),
  registerPushToken: (input) =>
    postAuthorizedJson<PushRegistration>(
      apiBaseUrl,
      "/api/notifications/push-token",
      input,
      requireAccessToken(getAccessToken),
    ),
});

export const createMockOrdersClient = (
  apiBaseUrl: string,
): MockOrdersClient => ({
  createOrder: (input) =>
    postJson<MockOrder>(apiBaseUrl, "/api/mock/orders", input),
  listOrders: async () => {
    const result = await getPublicJson<{
      readonly orders: readonly MockOrder[];
    }>(apiBaseUrl, "/api/mock/orders");
    return result.orders;
  },
  startPicking: (orderId) =>
    postJson<MockOrder>(
      apiBaseUrl,
      `/api/mock/orders/${encodeURIComponent(orderId)}/start-picking`,
      {},
    ),
  updateItemStatus: (input) =>
    postJson<MockOrder>(
      apiBaseUrl,
      `/api/mock/orders/${encodeURIComponent(input.orderId)}/items/${encodeURIComponent(input.itemId)}/status`,
      { status: input.status },
    ),
  completePicking: (orderId) =>
    postJson<MockOrder>(
      apiBaseUrl,
      `/api/mock/orders/${encodeURIComponent(orderId)}/complete-picking`,
      {},
    ),
});

export const createStaffOperationsClient = (
  apiBaseUrl: string,
  getAccessToken: () => string | undefined,
): StaffOperationsClient => ({
  listPickingTasks: async () => {
    const result = await getAuthorizedJson<{
      readonly tasks: readonly PickingTaskAssignment[];
    }>(apiBaseUrl, "/api/picking/tasks", requireAccessToken(getAccessToken));
    return result.tasks;
  },
  getOrder: (orderId) =>
    getAuthorizedJson<Order>(
      apiBaseUrl,
      `/api/orders/${encodeURIComponent(orderId)}`,
      requireAccessToken(getAccessToken),
    ),
  startPicking: (orderId) =>
    postAuthorizedJson<Order>(
      apiBaseUrl,
      `/api/picking/orders/${encodeURIComponent(orderId)}/start`,
      {},
      requireAccessToken(getAccessToken),
    ),
  updatePickingItem: (input) =>
    postAuthorizedJson<Order>(
      apiBaseUrl,
      `/api/picking/orders/${encodeURIComponent(input.orderId)}/items/${encodeURIComponent(input.itemId)}`,
      {
        status: input.status,
        ...(input.pickedQuantity === undefined
          ? {}
          : { pickedQuantity: input.pickedQuantity }),
        ...(input.reason ? { reason: input.reason } : {}),
      },
      requireAccessToken(getAccessToken),
    ),
  completePicking: (orderId) =>
    postAuthorizedJson<Order>(
      apiBaseUrl,
      `/api/picking/orders/${encodeURIComponent(orderId)}/complete`,
      {},
      requireAccessToken(getAccessToken),
    ),
  listDeliveryTasks: async () => {
    const result = await getAuthorizedJson<{
      readonly tasks: readonly DeliveryTask[];
    }>(apiBaseUrl, "/api/delivery/tasks", requireAccessToken(getAccessToken));
    return result.tasks;
  },
  updateDeliveryStatus: (input) =>
    postAuthorizedJson<DeliveryTask>(
      apiBaseUrl,
      `/api/delivery/orders/${encodeURIComponent(input.orderId)}/status`,
      { status: input.status },
      requireAccessToken(getAccessToken),
    ),
});

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const postJson = async <T>(
  apiBaseUrl: string,
  path: string,
  body: unknown,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<T>(response);
};

const getJson = async <T>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseJsonResponse<T>(response);
};

const postAuthorizedJson = async <T>(
  apiBaseUrl: string,
  path: string,
  body: unknown,
  accessToken: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<T>(response);
};

const getAuthorizedJson = async <T>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseJsonResponse<T>(response);
};

const deleteAuthorizedJson = async <T>(
  apiBaseUrl: string,
  path: string,
  accessToken: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return parseJsonResponse<T>(response);
};

const getPublicJson = async <T>(
  apiBaseUrl: string,
  path: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, { method: "GET" });

  return parseJsonResponse<T>(response);
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => ({}))) as {
    readonly error?: string;
  };

  if (!response.ok) {
    throw new ApiError(body.error ?? "Request failed.", response.status);
  }

  return body as T;
};

const requireAccessToken = (
  getAccessToken: () => string | undefined,
): string => {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new ApiError("Staff session expired. Sign in again.", 401);
  }

  return accessToken;
};
