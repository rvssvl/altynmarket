import type { AuthSession } from "./auth.js";
import { Context, Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

const UserRoleSchema = Schema.Literals([
  "customer",
  "picker",
  "courier",
  "admin",
  "super_admin",
]);

const StaffRoleSchema = Schema.Literals([
  "picker",
  "courier",
  "admin",
  "super_admin",
]);
const ProductUnitSchema = Schema.Literals([
  "kg",
  "g",
  "piece",
  "bundle",
  "box",
]);
const CurrencySchema = Schema.Literal("KZT");
const OrderStatusSchema = Schema.Literals([
  "draft",
  "payment_authorized",
  "awaiting_picking",
  "picking",
  "picked",
  "payment_captured",
  "awaiting_courier",
  "delivering",
  "delivered",
  "cancelled",
  "payment_failed",
  "refund_required",
  "refunded",
]);
const OrderItemStatusSchema = Schema.Literals([
  "pending",
  "picked",
  "cancelled",
]);
const PaymentStatusSchema = Schema.Literals([
  "authorization_pending",
  "authorized",
  "authorization_cancelled",
  "capture_pending",
  "captured",
  "capture_failed",
  "refund_pending",
  "refunded",
  "failed",
]);
const PickingTaskStatusSchema = Schema.Literals([
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);
const DeliveryTaskStatusSchema = Schema.Literals([
  "assigned",
  "pickup_started",
  "picked_up",
  "delivering",
  "delivered",
  "cancelled",
]);
const PickingItemStatusSchema = Schema.Literals(["picked", "cancelled"]);
const CancellationReasonSchema = Schema.Literals([
  "unavailable",
  "bad_quality",
]);
const RefundStatusSchema = Schema.Literals(["pending", "completed", "failed"]);
const PushPlatformSchema = Schema.Literals([
  "ios",
  "android",
  "web",
  "unknown",
]);

export const MoneySchema = Schema.Struct({
  amountMinor: Schema.Number,
  currency: CurrencySchema,
});

export const CategorySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  sortOrder: Schema.Number,
  isActive: Schema.Boolean,
});

export const ProductSchema = Schema.Struct({
  id: Schema.String,
  categoryId: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  unit: ProductUnitSchema,
  imageUrl: Schema.optional(Schema.String),
  isActive: Schema.Boolean,
});

export const ProductPriceSchema = Schema.Struct({
  productId: Schema.String,
  customerPrice: MoneySchema,
  internalCost: Schema.optional(MoneySchema),
  effectiveFrom: Schema.String,
});

export const CatalogProductSchema = Schema.Struct({
  product: ProductSchema,
  price: ProductPriceSchema,
});

export const ProductAvailabilitySchema = Schema.Struct({
  productId: Schema.String,
  isAvailable: Schema.Boolean,
  note: Schema.optional(Schema.String),
  updatedAt: Schema.String,
});

export const CartLineSchema = Schema.Struct({
  product: ProductSchema,
  price: ProductPriceSchema,
  availability: ProductAvailabilitySchema,
  quantity: Schema.Number,
});

export const CartSnapshotSchema = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  items: Schema.Array(CartLineSchema),
});

export const DeliveryAddressInputSchema = Schema.Struct({
  label: Schema.optional(Schema.String),
  city: Schema.String,
  street: Schema.String,
  apartment: Schema.optional(Schema.String),
  entrance: Schema.optional(Schema.String),
  floor: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  latitude: Schema.optional(Schema.Number),
  longitude: Schema.optional(Schema.Number),
});

export const OrderItemSchema = Schema.Struct({
  id: Schema.String,
  productId: Schema.String,
  productNameSnapshot: Schema.String,
  unitSnapshot: Schema.String,
  requestedQuantity: Schema.Number,
  pickedQuantity: Schema.optional(Schema.Number),
  unitPriceSnapshot: MoneySchema,
  status: OrderItemStatusSchema,
  cancellationReason: Schema.optional(
    Schema.Literals([
      "unavailable",
      "bad_quality",
      "customer_request",
      "admin_request",
    ]),
  ),
});

export const OrderSchema = Schema.Struct({
  id: Schema.String,
  customerId: Schema.String,
  addressId: Schema.String,
  status: OrderStatusSchema,
  items: Schema.Array(OrderItemSchema),
  goodsTotal: MoneySchema,
  deliveryFee: MoneySchema,
  finalTotal: MoneySchema,
  paymentId: Schema.optional(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const PaymentSchema = Schema.Struct({
  id: Schema.String,
  orderId: Schema.String,
  provider: Schema.String,
  status: PaymentStatusSchema,
  authorizedAmount: MoneySchema,
  capturedAmount: Schema.optional(MoneySchema),
  providerPaymentId: Schema.optional(Schema.String),
  redirectUrl: Schema.optional(Schema.String),
  deeplinkUrl: Schema.optional(Schema.String),
});

export const CheckoutResultSchema = Schema.Struct({
  order: OrderSchema,
  payment: PaymentSchema,
});

export const PickingTaskSchema = Schema.Struct({
  id: Schema.String,
  orderId: Schema.String,
  pickerId: Schema.String,
  status: PickingTaskStatusSchema,
  assignedAt: Schema.String,
  completedAt: Schema.optional(Schema.String),
});

export const DeliveryTaskSchema = Schema.Struct({
  id: Schema.String,
  orderId: Schema.String,
  courierId: Schema.String,
  status: DeliveryTaskStatusSchema,
  assignedAt: Schema.String,
  deliveredAt: Schema.optional(Schema.String),
});

export const PhoneNumberSchema = Schema.Struct({
  e164: Schema.String,
});

export const CustomerSchema = Schema.Struct({
  id: Schema.String,
  phone: PhoneNumberSchema,
  fullName: Schema.optional(Schema.String),
  createdAt: Schema.String,
});

export const StaffProfileSchema = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  roles: Schema.Array(StaffRoleSchema),
  displayName: Schema.String,
  isActive: Schema.Boolean,
});

export const AuthSessionSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.String,
  customer: CustomerSchema,
  staff: Schema.optional(StaffProfileSchema),
  roles: Schema.optional(Schema.Array(UserRoleSchema)),
});

export const RefundSchema = Schema.Struct({
  id: Schema.String,
  paymentId: Schema.String,
  amount: MoneySchema,
  reason: Schema.String,
  status: RefundStatusSchema,
});

export const AuditLogRecordSchema = Schema.Struct({
  id: Schema.String,
  actorUserId: Schema.String,
  action: Schema.String,
  entityType: Schema.String,
  entityId: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  createdAt: Schema.String,
});

export const MvpMetricsSchema = Schema.Struct({
  orderCount: Schema.Number,
  averageCheck: MoneySchema,
  deliveryFeeRevenue: MoneySchema,
  pickingCost: MoneySchema,
  refundAmount: MoneySchema,
  grossProfitPerOrder: MoneySchema,
});

export const PushSubscriptionSchema = Schema.Struct({
  userId: Schema.String,
  token: Schema.String,
  platform: PushPlatformSchema,
  enabled: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const AdminCatalogProductSchema = Schema.Struct({
  product: ProductSchema,
  price: ProductPriceSchema,
  availability: ProductAvailabilitySchema,
});

export class RpcUnauthorized extends Schema.TaggedErrorClass<RpcUnauthorized>()(
  "RpcUnauthorized",
  {
    message: Schema.String,
  },
) {}

export class PaymentNotFound extends Schema.TaggedErrorClass<PaymentNotFound>()(
  "PaymentNotFound",
  {
    paymentId: Schema.String,
  },
) {}

export class RefundNotAllowed extends Schema.TaggedErrorClass<RefundNotAllowed>()(
  "RefundNotAllowed",
  {
    reason: Schema.Literals([
      "invalid_amount",
      "provider_payment_missing",
      "not_captured",
      "amount_exceeds_captured",
    ]),
    message: Schema.String,
  },
) {}

export class RpcBackendFailure extends Schema.TaggedErrorClass<RpcBackendFailure>()(
  "RpcBackendFailure",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

export class RpcSession extends Context.Service<RpcSession, AuthSession>()(
  "@altyn-market/domain/RpcSession",
) {}

export class RpcAuthentication extends RpcMiddleware.Service<
  RpcAuthentication,
  {
    provides: RpcSession;
  }
>()("@altyn-market/domain/RpcAuthentication", {
  error: RpcUnauthorized,
  requiredForClient: true,
}) {}

export const AltynMarketRpcs = RpcGroup.make(
  Rpc.make("Health", {
    success: Schema.Struct({
      ok: Schema.Boolean,
      service: Schema.String,
      environment: Schema.String,
    }),
  }),
  Rpc.make("ListCategories", {
    success: Schema.Array(CategorySchema),
    error: RpcBackendFailure,
  }),
  Rpc.make("ListCatalog", {
    success: Schema.Array(CatalogProductSchema),
    error: RpcBackendFailure,
  }),
  Rpc.make("RequestOtp", {
    payload: { phone: PhoneNumberSchema },
    success: Schema.Struct({
      ok: Schema.Literal(true),
      devCode: Schema.optional(Schema.String),
    }),
    error: RpcBackendFailure,
  }),
  Rpc.make("VerifyOtp", {
    payload: {
      phone: PhoneNumberSchema,
      code: Schema.String,
      deviceName: Schema.optional(Schema.String),
    },
    success: AuthSessionSchema,
    error: RpcBackendFailure,
  }),
  Rpc.make("RefreshSession", {
    payload: {
      refreshToken: Schema.String,
      deviceName: Schema.optional(Schema.String),
    },
    success: AuthSessionSchema,
    error: RpcBackendFailure,
  }),
  Rpc.make("GetCurrentSession", {
    success: AuthSessionSchema,
  }).middleware(RpcAuthentication),
  Rpc.make("GetCart", {
    success: CartSnapshotSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("AddCartItem", {
    payload: {
      productId: Schema.String,
      quantity: Schema.Number,
    },
    success: CartSnapshotSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("RemoveCartItem", {
    payload: { productId: Schema.String },
    success: CartSnapshotSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("Checkout", {
    payload: { address: DeliveryAddressInputSchema },
    success: CheckoutResultSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListMyOrders", {
    success: Schema.Array(OrderSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("GetOrder", {
    payload: { orderId: Schema.String },
    success: OrderSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListPickingTasks", {
    success: Schema.Array(PickingTaskSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("StartPicking", {
    payload: { orderId: Schema.String },
    success: OrderSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdatePickingItem", {
    payload: {
      orderId: Schema.String,
      itemId: Schema.String,
      status: PickingItemStatusSchema,
      pickedQuantity: Schema.optional(Schema.Number),
      reason: Schema.optional(CancellationReasonSchema),
    },
    success: OrderSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("CompletePicking", {
    payload: { orderId: Schema.String },
    success: OrderSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListDeliveryTasks", {
    success: Schema.Array(DeliveryTaskSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdateDeliveryStatus", {
    payload: {
      orderId: Schema.String,
      status: DeliveryTaskStatusSchema,
    },
    success: DeliveryTaskSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListAdminOrders", {
    payload: { status: Schema.optional(OrderStatusSchema) },
    success: Schema.Array(OrderSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("AssignPicker", {
    payload: {
      orderId: Schema.String,
      pickerId: Schema.String,
    },
    success: PickingTaskSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("AssignCourier", {
    payload: {
      orderId: Schema.String,
      courierId: Schema.String,
    },
    success: DeliveryTaskSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("CreateStaffProfile", {
    payload: {
      phone: PhoneNumberSchema,
      displayName: Schema.String,
      roles: Schema.Array(StaffRoleSchema),
    },
    success: StaffProfileSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListStaffProfiles", {
    success: Schema.Array(StaffProfileSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("DeactivateStaffProfile", {
    payload: { staffId: Schema.String },
    success: Schema.Void,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListAdminPayments", {
    success: Schema.Array(PaymentSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListAdminRefunds", {
    success: Schema.Array(RefundSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("RefundPayment", {
    payload: {
      paymentId: Schema.String,
      amount: MoneySchema,
      reason: Schema.String,
    },
    success: RefundSchema,
    error: Schema.Union([RpcBackendFailure, PaymentNotFound, RefundNotAllowed]),
  }).middleware(RpcAuthentication),
  Rpc.make("UpdatePaymentStatus", {
    payload: {
      paymentId: Schema.String,
      status: PaymentStatusSchema,
    },
    success: PaymentSchema,
    error: Schema.Union([RpcBackendFailure, PaymentNotFound]),
  }).middleware(RpcAuthentication),
  Rpc.make("ListAuditLog", {
    payload: { limit: Schema.optional(Schema.Number) },
    success: Schema.Array(AuditLogRecordSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("GetMetrics", {
    success: MvpMetricsSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListAdminCategories", {
    success: Schema.Array(CategorySchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListAdminProducts", {
    success: Schema.Array(AdminCatalogProductSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("CreateCategory", {
    payload: {
      name: Schema.String,
      slug: Schema.String,
      sortOrder: Schema.Number,
      isActive: Schema.Boolean,
    },
    success: CategorySchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdateCategory", {
    payload: {
      categoryId: Schema.String,
      name: Schema.optional(Schema.String),
      slug: Schema.optional(Schema.String),
      sortOrder: Schema.optional(Schema.Number),
      isActive: Schema.optional(Schema.Boolean),
    },
    success: CategorySchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("DeleteCategory", {
    payload: { categoryId: Schema.String },
    success: CategorySchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("CreateProduct", {
    payload: {
      categoryId: Schema.String,
      name: Schema.String,
      description: Schema.optional(Schema.String),
      unit: ProductUnitSchema,
      imageUrl: Schema.optional(Schema.String),
      isActive: Schema.Boolean,
      customerPrice: MoneySchema,
      internalCost: Schema.optional(MoneySchema),
      isAvailable: Schema.Boolean,
      availabilityNote: Schema.optional(Schema.String),
    },
    success: AdminCatalogProductSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdateProduct", {
    payload: {
      productId: Schema.String,
      categoryId: Schema.optional(Schema.String),
      name: Schema.optional(Schema.String),
      description: Schema.optional(Schema.String),
      unit: Schema.optional(ProductUnitSchema),
      imageUrl: Schema.optional(Schema.String),
      isActive: Schema.optional(Schema.Boolean),
    },
    success: AdminCatalogProductSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("DeleteProduct", {
    payload: { productId: Schema.String },
    success: Schema.Void,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdateProductAvailability", {
    payload: {
      productId: Schema.String,
      isAvailable: Schema.Boolean,
      note: Schema.optional(Schema.String),
    },
    success: ProductAvailabilitySchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UpdateProductPrice", {
    payload: {
      productId: Schema.String,
      customerPrice: MoneySchema,
      internalCost: Schema.optional(MoneySchema),
      effectiveFrom: Schema.optional(Schema.String),
    },
    success: ProductPriceSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("ListProductPriceHistory", {
    payload: { productId: Schema.String },
    success: Schema.Array(ProductPriceSchema),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("RegisterPushToken", {
    payload: {
      token: Schema.String,
      platform: PushPlatformSchema,
    },
    success: PushSubscriptionSchema,
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
  Rpc.make("UploadProductImage", {
    payload: { dataBase64: Schema.String },
    success: Schema.Struct({ url: Schema.String }),
    error: RpcBackendFailure,
  }).middleware(RpcAuthentication),
);
