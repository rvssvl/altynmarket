import type {
  Address,
  Category,
  CategoryId,
  Customer,
  DeliveryTask,
  DeliveryTaskStatus,
  Money,
  MvpMetrics,
  Order,
  OrderId,
  OrderItemId,
  OrderItemStatus,
  OrderStatus,
  Payment,
  PaymentId,
  PaymentStatus,
  PhoneNumber,
  PickingTask,
  PickingTaskStatus,
  Product,
  ProductAvailability,
  ProductId,
  ProductPrice,
  ProductUnit,
  Refund,
  StaffId,
  StaffProfile,
  UserId,
  UserRole,
} from "@altyn-market/domain";

export interface OtpChallengeRecord {
  readonly id: string;
  readonly phone: PhoneNumber;
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAt: string;
}

export interface StoredSessionRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly deviceSessionId: string;
  readonly expiresAt: string;
  readonly customer: Customer;
  readonly staff?: StaffProfile;
}

export interface StoredRefreshTokenRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: UserId;
  readonly deviceSessionId: string;
  readonly expiresAt: string;
  readonly customer: Customer;
  readonly staff?: StaffProfile;
}

export interface ProductForSale {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
}

export interface CartLine {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
  readonly quantity: number;
}

export interface CartSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly items: readonly CartLine[];
}

export interface CreateSessionRecordInput {
  readonly sessionId: string;
  readonly refreshTokenId: string;
  readonly userId: UserId;
  readonly deviceSessionId: string;
  readonly accessTokenHash: string;
  readonly accessExpiresAt: string;
  readonly refreshTokenHash: string;
  readonly refreshExpiresAt: string;
}

export interface CreateCheckoutOrderInput {
  readonly orderId: OrderId;
  readonly paymentId: string;
  readonly customerId: UserId;
  readonly address: Address;
  readonly status: OrderStatus;
  readonly items: readonly CreateCheckoutOrderItemInput[];
  readonly goodsTotal: Money;
  readonly deliveryFee: Money;
  readonly finalTotal: Money;
  readonly payment: CreatePaymentInput;
}

export interface CreateCheckoutOrderItemInput {
  readonly id: OrderItemId;
  readonly productId: ProductId;
  readonly productNameSnapshot: string;
  readonly unitSnapshot: string;
  readonly requestedQuantity: number;
  readonly unitPriceSnapshot: Money;
}

export interface CreatePaymentInput {
  readonly provider: string;
  readonly status: PaymentStatus;
  readonly authorizedAmount: Money;
  readonly providerPaymentId?: string;
  readonly redirectUrl?: string;
  readonly deeplinkUrl?: string;
}

export interface AuditLogInput {
  readonly actorUserId: UserId;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditLogRecord extends AuditLogInput {
  readonly id: string;
  readonly createdAt: string;
}

export type PushPlatform = "ios" | "android" | "web" | "unknown";

export interface PushSubscriptionInput {
  readonly userId: UserId;
  readonly token: string;
  readonly platform: PushPlatform;
}

export interface PushSubscriptionRecord extends PushSubscriptionInput {
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffProfileInput {
  readonly phone: PhoneNumber;
  readonly displayName: string;
  readonly roles: readonly Exclude<UserRole, "customer">[];
}

export interface CategoryInput {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface CategoryUpdateInput {
  readonly name?: string;
  readonly slug?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface ProductInput {
  readonly categoryId: CategoryId;
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

export interface ProductUpdateInput {
  readonly categoryId?: CategoryId;
  readonly name?: string;
  readonly description?: string;
  readonly unit?: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive?: boolean;
}

export interface ProductAvailabilityInput {
  readonly isAvailable: boolean;
  readonly note?: string;
}

export interface ProductPriceInput {
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly effectiveFrom?: string;
}

export interface Store {
  readonly auth: {
    readonly createOtpChallenge: (input: OtpChallengeRecord) => Promise<void>;
    readonly findActiveOtpChallenge: (
      phone: PhoneNumber,
      now: Date,
    ) => Promise<OtpChallengeRecord | undefined>;
    readonly updateOtpAttempts: (
      challengeId: string,
      attempts: number,
    ) => Promise<void>;
    readonly consumeOtpChallenge: (challengeId: string) => Promise<void>;
    readonly upsertCustomer: (
      phone: PhoneNumber,
      fullName?: string,
    ) => Promise<Customer>;
    readonly createDeviceSession: (input: {
      readonly id: string;
      readonly userId: UserId;
      readonly deviceName?: string;
      readonly userAgent?: string;
      readonly ipAddress?: string;
    }) => Promise<void>;
    readonly createSession: (input: CreateSessionRecordInput) => Promise<void>;
    readonly findSessionByAccessTokenHash: (
      tokenHash: string,
      now: Date,
    ) => Promise<StoredSessionRecord | undefined>;
    readonly findRefreshTokenByHash: (
      tokenHash: string,
      now: Date,
    ) => Promise<StoredRefreshTokenRecord | undefined>;
    readonly markRefreshTokenUsed: (
      refreshTokenId: string,
      replacementTokenId: string,
    ) => Promise<void>;
    readonly revokeSession: (sessionId: string) => Promise<void>;
    readonly touchSession: (sessionId: string) => Promise<void>;
  };
  readonly staff: {
    readonly list: () => Promise<readonly StaffProfile[]>;
    readonly getByUserId: (userId: UserId) => Promise<StaffProfile | undefined>;
    readonly getById: (staffId: StaffId) => Promise<StaffProfile | undefined>;
    readonly upsertStaffProfile: (
      input: StaffProfileInput,
    ) => Promise<StaffProfile>;
    readonly deactivateStaffProfile: (staffId: StaffId) => Promise<void>;
  };
  readonly catalog: {
    readonly listCategories: () => Promise<readonly Category[]>;
    readonly listProducts: () => Promise<readonly Product[]>;
    readonly listAllCategories: () => Promise<readonly Category[]>;
    readonly listProductsForOperations: () => Promise<
      readonly ProductForSale[]
    >;
    readonly getProductForSale: (
      productId: ProductId,
    ) => Promise<ProductForSale | undefined>;
    readonly createCategory: (input: CategoryInput) => Promise<Category>;
    readonly updateCategory: (
      categoryId: CategoryId,
      input: CategoryUpdateInput,
    ) => Promise<Category>;
    readonly createProduct: (input: ProductInput) => Promise<ProductForSale>;
    readonly updateProduct: (
      productId: ProductId,
      input: ProductUpdateInput,
    ) => Promise<ProductForSale>;
    readonly updateProductAvailability: (
      productId: ProductId,
      input: ProductAvailabilityInput,
    ) => Promise<ProductAvailability>;
    readonly setProductPrice: (
      productId: ProductId,
      input: ProductPriceInput,
    ) => Promise<ProductPrice>;
    readonly listProductPriceHistory: (
      productId: ProductId,
    ) => Promise<readonly ProductPrice[]>;
  };
  readonly cart: {
    readonly get: (userId: UserId) => Promise<CartSnapshot>;
    readonly addItem: (
      userId: UserId,
      productId: ProductId,
      quantity: number,
    ) => Promise<CartSnapshot>;
    readonly removeItem: (
      userId: UserId,
      productId: ProductId,
    ) => Promise<CartSnapshot>;
    readonly clear: (userId: UserId) => Promise<void>;
  };
  readonly orders: {
    readonly createCheckoutOrder: (
      input: CreateCheckoutOrderInput,
    ) => Promise<{ readonly order: Order; readonly payment: Payment }>;
    readonly get: (orderId: OrderId) => Promise<Order | undefined>;
    readonly listByCustomer: (userId: UserId) => Promise<readonly Order[]>;
    readonly list: (status?: OrderStatus) => Promise<readonly Order[]>;
    readonly setStatus: (
      orderId: OrderId,
      status: OrderStatus,
      actorUserId: UserId,
      note?: string,
    ) => Promise<Order>;
    readonly updateItemStatus: (input: {
      readonly orderId: OrderId;
      readonly itemId: OrderItemId;
      readonly status: OrderItemStatus;
      readonly pickedQuantity?: number;
      readonly cancellationReason?: "unavailable" | "bad_quality";
    }) => Promise<Order>;
    readonly updateTotals: (
      orderId: OrderId,
      goodsTotal: Money,
      finalTotal: Money,
    ) => Promise<Order>;
  };
  readonly payments: {
    readonly list: () => Promise<readonly Payment[]>;
    readonly getById: (paymentId: PaymentId) => Promise<Payment | undefined>;
    readonly getByOrderId: (orderId: OrderId) => Promise<Payment | undefined>;
    readonly listRefunds: () => Promise<readonly Refund[]>;
    readonly updateAfterCapture: (
      paymentId: string,
      status: PaymentStatus,
      capturedAmount: Money,
    ) => Promise<Payment>;
    readonly updateStatus: (
      paymentId: string,
      status: PaymentStatus,
    ) => Promise<Payment>;
    readonly createRefund: (input: {
      readonly id: string;
      readonly paymentId: string;
      readonly amount: Money;
      readonly reason: string;
      readonly status: Refund["status"];
    }) => Promise<Refund>;
  };
  readonly picking: {
    readonly listAssignedTasks: (
      pickerId?: StaffId,
    ) => Promise<readonly PickingTask[]>;
    readonly createTask: (
      orderId: OrderId,
      pickerId: StaffId,
    ) => Promise<PickingTask>;
    readonly updateStatus: (
      taskId: string,
      status: PickingTaskStatus,
    ) => Promise<PickingTask>;
    readonly getByOrderId: (
      orderId: OrderId,
    ) => Promise<PickingTask | undefined>;
  };
  readonly delivery: {
    readonly listAssignedTasks: (
      courierId?: StaffId,
    ) => Promise<readonly DeliveryTask[]>;
    readonly createTask: (
      orderId: OrderId,
      courierId: StaffId,
    ) => Promise<DeliveryTask>;
    readonly updateStatus: (
      orderId: OrderId,
      status: DeliveryTaskStatus,
    ) => Promise<DeliveryTask>;
  };
  readonly audit: {
    readonly record: (input: AuditLogInput) => Promise<void>;
    readonly list: (limit?: number) => Promise<readonly AuditLogRecord[]>;
  };
  readonly pushSubscriptions: {
    readonly upsert: (
      input: PushSubscriptionInput,
    ) => Promise<PushSubscriptionRecord>;
  };
  readonly metrics: {
    readonly getMvpMetrics: () => Promise<MvpMetrics>;
  };
}
