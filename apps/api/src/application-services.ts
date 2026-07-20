import type {
  AdminRefundInput,
  AuthSession,
  CartSnapshot,
  Category,
  CategoryId,
  CheckoutResult,
  CreateCategoryInput,
  CreateProductInput,
  CreateStaffProfileInput,
  DeliveryAddressInput,
  DeliveryTask,
  DeliveryTaskStatus,
  Money,
  MvpMetrics,
  Order,
  OrderId,
  OrderStatus,
  Payment,
  PaymentNotFound,
  PhoneNumber,
  PickingTask,
  Product,
  ProductAvailability,
  ProductId,
  ProductPrice,
  Refund,
  RefundNotAllowed,
  RegisterPushTokenInput,
  RequestOtpResult,
  StaffId,
  StaffProfile,
  UpdateCategoryInput,
  UpdatePaymentStatusInput,
  UpdatePickingItemInput,
  UpdateProductAvailabilityInput,
  UpdateProductInput,
  UpdateProductPriceInput,
  UserRole,
} from "@altyn-market/domain";
import { Context, Effect, Layer } from "effect";
import type { AuthFailure, AuthService } from "./auth-service.js";
import {
  ApiFailure,
  BackendInfrastructureFailure,
} from "./backend-failures.js";
import {
  AuthGateway,
  BackendPersistence,
  makeBackendInfrastructureLayer,
  makeProductImagesLayer,
  ProductImages,
  RealtimePublisher,
} from "./infrastructure-services.js";
import type { RuntimePaymentProvider } from "./modules/payments.js";
import {
  makeOrderFulfillmentLayer,
  OrderFulfillmentWorkflow,
} from "./order-fulfillment-workflow.js";
import {
  PaymentAdministration,
  paymentAdministrationLayer,
} from "./payment-administration-workflow.js";
import type { ProductImageStorage } from "./product-image-storage.js";
import type { RealtimeBus } from "./realtime.js";
import type {
  AuditLogRecord,
  ProductForSale,
  PushSubscriptionRecord,
  Store,
} from "./store.js";

export interface BackendDependencies {
  readonly store: Store;
  readonly auth: AuthService;
  readonly paymentProvider: RuntimePaymentProvider;
  readonly realtime: RealtimeBus;
  readonly flatDeliveryFee: Money;
}

export type BackendFailure =
  | AuthFailure
  | ApiFailure
  | BackendInfrastructureFailure;

export interface CatalogProduct {
  readonly product: Product;
  readonly price: ProductPrice;
}

export interface ProductImageUploadInput {
  readonly fileName: string;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly sizeBytes: number;
}

export class CatalogApplication extends Context.Service<
  CatalogApplication,
  {
    readonly listCategories: () => Effect.Effect<
      readonly Category[],
      BackendFailure
    >;
    readonly listCatalog: () => Effect.Effect<
      readonly CatalogProduct[],
      BackendFailure
    >;
  }
>()("@altyn-market/api/CatalogApplication") {}

export class AuthenticationApplication extends Context.Service<
  AuthenticationApplication,
  {
    readonly requestOtp: (
      phone: PhoneNumber,
    ) => Effect.Effect<RequestOtpResult, BackendFailure>;
    readonly verifyOtp: (
      phone: PhoneNumber,
      code: string,
      deviceName?: string,
    ) => Effect.Effect<AuthSession, BackendFailure>;
    readonly refreshSession: (
      refreshToken: string,
    ) => Effect.Effect<AuthSession, BackendFailure>;
    readonly getCurrentSession: (
      accessToken: string,
    ) => Effect.Effect<AuthSession, BackendFailure>;
  }
>()("@altyn-market/api/AuthenticationApplication") {}

export class CustomerShoppingApplication extends Context.Service<
  CustomerShoppingApplication,
  {
    readonly cart: {
      readonly get: (
        session: AuthSession,
      ) => Effect.Effect<CartSnapshot, BackendFailure>;
      readonly addItem: (
        session: AuthSession,
        productId: ProductId,
        quantity: number,
      ) => Effect.Effect<CartSnapshot, BackendFailure>;
      readonly removeItem: (
        session: AuthSession,
        productId: ProductId,
      ) => Effect.Effect<CartSnapshot, BackendFailure>;
    };
    readonly checkout: {
      readonly create: (
        session: AuthSession,
        address: DeliveryAddressInput,
      ) => Effect.Effect<CheckoutResult, BackendFailure>;
    };
    readonly orders: {
      readonly get: (
        session: AuthSession,
        orderId: OrderId,
      ) => Effect.Effect<Order, BackendFailure>;
      readonly listMine: (
        session: AuthSession,
      ) => Effect.Effect<readonly Order[], BackendFailure>;
    };
    readonly notifications: {
      readonly registerPushToken: (
        session: AuthSession,
        input: RegisterPushTokenInput,
      ) => Effect.Effect<PushSubscriptionRecord, BackendFailure>;
    };
  }
>()("@altyn-market/api/CustomerShoppingApplication") {}

export class StaffOperationsApplication extends Context.Service<
  StaffOperationsApplication,
  {
    readonly picking: {
      readonly listAssignedTasks: (
        session: AuthSession,
      ) => Effect.Effect<readonly PickingTask[], BackendFailure>;
      readonly start: (
        session: AuthSession,
        orderId: OrderId,
      ) => Effect.Effect<Order, BackendFailure>;
      readonly updateItem: (
        session: AuthSession,
        input: UpdatePickingItemInput,
      ) => Effect.Effect<Order, BackendFailure>;
      readonly complete: (
        session: AuthSession,
        orderId: OrderId,
      ) => Effect.Effect<Order, BackendFailure>;
    };
    readonly delivery: {
      readonly listAssignedTasks: (
        session: AuthSession,
      ) => Effect.Effect<readonly DeliveryTask[], BackendFailure>;
      readonly updateStatus: (
        session: AuthSession,
        orderId: OrderId,
        status: DeliveryTaskStatus,
      ) => Effect.Effect<DeliveryTask, BackendFailure>;
    };
  }
>()("@altyn-market/api/StaffOperationsApplication") {}

export class AdministrationApplication extends Context.Service<
  AdministrationApplication,
  {
    readonly orders: {
      readonly list: (
        session: AuthSession,
        status?: OrderStatus,
      ) => Effect.Effect<readonly Order[], BackendFailure>;
    };
    readonly dispatch: {
      readonly assignPicker: (
        session: AuthSession,
        orderId: OrderId,
        pickerId: StaffId,
      ) => Effect.Effect<PickingTask, BackendFailure>;
      readonly assignCourier: (
        session: AuthSession,
        orderId: OrderId,
        courierId: StaffId,
      ) => Effect.Effect<DeliveryTask, BackendFailure>;
    };
    readonly staff: {
      readonly create: (
        session: AuthSession,
        input: CreateStaffProfileInput,
      ) => Effect.Effect<StaffProfile, BackendFailure>;
      readonly list: (
        session: AuthSession,
      ) => Effect.Effect<readonly StaffProfile[], BackendFailure>;
      readonly deactivate: (
        session: AuthSession,
        staffId: StaffId,
      ) => Effect.Effect<void, BackendFailure>;
    };
    readonly payments: {
      readonly list: (
        session: AuthSession,
      ) => Effect.Effect<readonly Payment[], BackendFailure>;
      readonly listRefunds: (
        session: AuthSession,
      ) => Effect.Effect<readonly Refund[], BackendFailure>;
      readonly refund: (
        session: AuthSession,
        input: AdminRefundInput,
      ) => Effect.Effect<
        Refund,
        BackendFailure | PaymentNotFound | RefundNotAllowed
      >;
      readonly updateStatus: (
        session: AuthSession,
        input: UpdatePaymentStatusInput,
      ) => Effect.Effect<Payment, BackendFailure | PaymentNotFound>;
    };
    readonly audit: {
      readonly list: (
        session: AuthSession,
        limit?: number,
      ) => Effect.Effect<readonly AuditLogRecord[], BackendFailure>;
    };
    readonly metrics: {
      readonly get: (
        session: AuthSession,
      ) => Effect.Effect<MvpMetrics, BackendFailure>;
    };
    readonly catalog: {
      readonly listCategories: (
        session: AuthSession,
      ) => Effect.Effect<readonly Category[], BackendFailure>;
      readonly listProducts: (
        session: AuthSession,
      ) => Effect.Effect<readonly ProductForSale[], BackendFailure>;
      readonly createCategory: (
        session: AuthSession,
        input: CreateCategoryInput,
      ) => Effect.Effect<Category, BackendFailure>;
      readonly updateCategory: (
        session: AuthSession,
        categoryId: CategoryId,
        input: UpdateCategoryInput,
      ) => Effect.Effect<Category, BackendFailure>;
      readonly deleteCategory: (
        session: AuthSession,
        categoryId: CategoryId,
      ) => Effect.Effect<Category, BackendFailure>;
      readonly createProduct: (
        session: AuthSession,
        input: CreateProductInput,
      ) => Effect.Effect<ProductForSale, BackendFailure>;
      readonly updateProduct: (
        session: AuthSession,
        productId: ProductId,
        input: UpdateProductInput,
      ) => Effect.Effect<ProductForSale, BackendFailure>;
      readonly deleteProduct: (
        session: AuthSession,
        productId: ProductId,
      ) => Effect.Effect<void, BackendFailure>;
      readonly updateAvailability: (
        session: AuthSession,
        productId: ProductId,
        input: UpdateProductAvailabilityInput,
      ) => Effect.Effect<ProductAvailability, BackendFailure>;
      readonly updatePrice: (
        session: AuthSession,
        productId: ProductId,
        input: UpdateProductPriceInput,
      ) => Effect.Effect<ProductPrice, BackendFailure>;
      readonly listPriceHistory: (
        session: AuthSession,
        productId: ProductId,
      ) => Effect.Effect<readonly ProductPrice[], BackendFailure>;
      readonly recordImageUpload: (
        session: AuthSession,
        input: ProductImageUploadInput,
      ) => Effect.Effect<void, BackendFailure>;
      readonly uploadImage: (
        session: AuthSession,
        dataBase64: string,
      ) => Effect.Effect<{ readonly url: string }, BackendFailure>;
    };
  }
>()("@altyn-market/api/AdministrationApplication") {}

type Persistence = BackendPersistence["Service"];

const requireOrder = Effect.fnUntraced(function* (
  persistence: Persistence,
  orderId: OrderId,
) {
  const order = yield* persistence.execute("orders.get", (store) =>
    store.orders.get(orderId),
  );

  if (!order) {
    return yield* Effect.fail(new ApiFailure("Order not found.", 404));
  }

  return order;
});

const requireSellableProduct = Effect.fnUntraced(function* (
  persistence: Persistence,
  productId: ProductId,
) {
  const productForSale = yield* persistence.execute(
    "catalog.getProductForSale",
    (store) => store.catalog.getProductForSale(productId),
  );

  if (!productForSale) {
    return yield* Effect.fail(new ApiFailure("Product not found.", 404));
  }

  if (
    !productForSale.product.isActive ||
    !productForSale.availability.isAvailable
  ) {
    return yield* Effect.fail(new ApiFailure("Product is unavailable.", 409));
  }

  return productForSale;
});

const requireStaffWithRole = Effect.fnUntraced(function* (
  persistence: Persistence,
  staffId: StaffId,
  role: Exclude<UserRole, "customer">,
) {
  const staff = yield* persistence.execute("staff.getById", (store) =>
    store.staff.getById(staffId),
  );

  if (!staff?.isActive || !staff.roles.includes(role)) {
    return yield* Effect.fail(
      new ApiFailure(`Staff profile must have ${role} role.`, 400),
    );
  }

  return staff;
});

const hasAnyRole = (
  session: AuthSession,
  roles: readonly UserRole[],
): boolean => {
  const sessionRoles = session.roles ?? ["customer"];
  return roles.some((role) => sessionRoles.includes(role));
};

const deliveryStatusToOrderStatus = (
  status: DeliveryTaskStatus,
): OrderStatus => {
  switch (status) {
    case "assigned":
      return "awaiting_courier";
    case "pickup_started":
    case "picked_up":
    case "delivering":
      return "delivering";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
  }
};

const catalog = Layer.effect(
  CatalogApplication,
  Effect.gen(function* () {
    const persistence = yield* BackendPersistence;

    return CatalogApplication.of({
      listCategories: Effect.fnUntraced(function* () {
        return yield* persistence.execute("catalog.listCategories", (store) =>
          store.catalog.listCategories(),
        );
      }),
      listCatalog: Effect.fnUntraced(function* () {
        const products = yield* persistence.execute(
          "catalog.listProducts",
          (store) => store.catalog.listProducts(),
        );

        return yield* Effect.forEach(products, (product) =>
          persistence
            .execute("catalog.getProductPrice", (store) =>
              store.catalog.getProductForSale(product.id),
            )
            .pipe(
              Effect.flatMap((sale) =>
                sale
                  ? Effect.succeed(sale.price)
                  : Effect.fail(new ApiFailure("Product not found.", 404)),
              ),
              Effect.map((price) => ({ product, price })),
            ),
        );
      }),
    });
  }),
);

const authentication = Layer.effect(
  AuthenticationApplication,
  Effect.gen(function* () {
    const gateway = yield* AuthGateway;

    return AuthenticationApplication.of({
      requestOtp: gateway.requestOtp,
      verifyOtp: gateway.verifyOtp,
      refreshSession: gateway.refreshSession,
      getCurrentSession: gateway.getCurrentSession,
    });
  }),
);

const customerShopping = Layer.effect(
  CustomerShoppingApplication,
  Effect.gen(function* () {
    const persistence = yield* BackendPersistence;
    const fulfillment = yield* OrderFulfillmentWorkflow;
    const { requireRole } = yield* AuthGateway;

    return CustomerShoppingApplication.of({
      cart: {
        get: Effect.fnUntraced(function* (session: AuthSession) {
          return yield* persistence.execute("cart.get", (store) =>
            store.cart.get(session.customer.id),
          );
        }),
        addItem: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
          quantity: number,
        ) {
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return yield* Effect.fail(
              new ApiFailure("quantity must be greater than zero.", 400),
            );
          }

          yield* requireSellableProduct(persistence, productId);
          return yield* persistence.execute("cart.addItem", (store) =>
            store.cart.addItem(session.customer.id, productId, quantity),
          );
        }),
        removeItem: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
        ) {
          return yield* persistence.execute("cart.removeItem", (store) =>
            store.cart.removeItem(session.customer.id, productId),
          );
        }),
      },
      checkout: {
        create: fulfillment.checkout,
      },
      orders: {
        get: Effect.fnUntraced(function* (
          session: AuthSession,
          orderId: OrderId,
        ) {
          const order = yield* requireOrder(persistence, orderId);

          if (order.customerId !== session.customer.id) {
            yield* requireRole(session, ["picker", "courier", "admin"]);
          }

          return order;
        }),
        listMine: Effect.fnUntraced(function* (session: AuthSession) {
          return yield* persistence.execute("orders.listByCustomer", (store) =>
            store.orders.listByCustomer(session.customer.id),
          );
        }),
      },
      notifications: {
        registerPushToken: Effect.fnUntraced(function* (
          session: AuthSession,
          input: RegisterPushTokenInput,
        ) {
          const subscription = yield* persistence.execute(
            "pushSubscriptions.upsert",
            (store) =>
              store.pushSubscriptions.upsert({
                userId: session.customer.id,
                token: input.token,
                platform: input.platform,
              }),
          );
          yield* persistence.execute("audit.record", (store) =>
            store.audit.record({
              actorUserId: session.customer.id,
              action: "customer.push_token_registered",
              entityType: "push_subscription",
              entityId: subscription.token.slice(-16),
              metadata: { platform: subscription.platform },
            }),
          );
          return subscription;
        }),
      },
    });
  }),
);

const staffOperations = Layer.effect(
  StaffOperationsApplication,
  Effect.gen(function* () {
    const persistence = yield* BackendPersistence;
    const fulfillment = yield* OrderFulfillmentWorkflow;
    const publisher = yield* RealtimePublisher;
    const { requireRole } = yield* AuthGateway;

    return StaffOperationsApplication.of({
      picking: {
        listAssignedTasks: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["picker", "admin"]);

          if (hasAnyRole(session, ["admin", "super_admin"])) {
            return yield* persistence.execute(
              "picking.listAssignedTasks",
              (store) => store.picking.listAssignedTasks(),
            );
          }

          const staff = session.staff;
          if (!staff) {
            return [];
          }

          return yield* persistence.execute(
            "picking.listAssignedTasks",
            (store) => store.picking.listAssignedTasks(staff.id),
          );
        }),
        start: fulfillment.startPicking,
        updateItem: fulfillment.updatePickingItem,
        complete: fulfillment.completePicking,
      },
      delivery: {
        listAssignedTasks: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["courier", "admin"]);

          if (hasAnyRole(session, ["admin", "super_admin"])) {
            return yield* persistence.execute(
              "delivery.listAssignedTasks",
              (store) => store.delivery.listAssignedTasks(),
            );
          }

          const staff = session.staff;
          if (!staff) {
            return [];
          }

          return yield* persistence.execute(
            "delivery.listAssignedTasks",
            (store) => store.delivery.listAssignedTasks(staff.id),
          );
        }),
        updateStatus: Effect.fnUntraced(function* (
          session: AuthSession,
          orderId: OrderId,
          status: DeliveryTaskStatus,
        ) {
          yield* requireRole(session, ["courier", "admin"]);
          const task = yield* persistence.execute(
            "delivery.updateStatus",
            (store) => store.delivery.updateStatus(orderId, status),
          );
          const order = yield* persistence.execute(
            "orders.setStatus",
            (store) =>
              store.orders.setStatus(
                orderId,
                deliveryStatusToOrderStatus(status),
                session.customer.id,
                `Delivery status ${status}`,
              ),
          );
          yield* persistence.execute("audit.record", (store) =>
            store.audit.record({
              actorUserId: session.customer.id,
              action: "delivery.status_update",
              entityType: "order",
              entityId: orderId,
              metadata: { status },
            }),
          );
          yield* publisher.publish({
            type: "order.updated",
            orderId: order.id,
            status: order.status,
          });
          return task;
        }),
      },
    });
  }),
);

const administration = Layer.effect(
  AdministrationApplication,
  Effect.gen(function* () {
    const persistence = yield* BackendPersistence;
    const paymentAdministration = yield* PaymentAdministration;
    const productImages = yield* ProductImages;
    const publisher = yield* RealtimePublisher;
    const gateway = yield* AuthGateway;
    const { requireRole } = gateway;

    const recordAudit = (
      session: AuthSession,
      action: string,
      entityType: string,
      entityId: string,
      metadata?: Record<string, unknown>,
    ) =>
      persistence.execute("audit.record", (store) =>
        store.audit.record({
          actorUserId: session.customer.id,
          action,
          entityType,
          entityId,
          ...(metadata === undefined ? {} : { metadata }),
        }),
      );

    const recordImageUpload = Effect.fnUntraced(function* (
      session: AuthSession,
      input: ProductImageUploadInput,
    ) {
      yield* requireRole(session, ["admin"]);
      yield* recordAudit(
        session,
        "admin.product_image_upload",
        "product_image",
        input.fileName,
        { contentType: input.contentType, sizeBytes: input.sizeBytes },
      );
    });

    return AdministrationApplication.of({
      orders: {
        list: Effect.fnUntraced(function* (
          session: AuthSession,
          status?: OrderStatus,
        ) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute("orders.list", (store) =>
            status === undefined
              ? store.orders.list()
              : store.orders.list(status),
          );
        }),
      },
      dispatch: {
        assignPicker: Effect.fnUntraced(function* (
          session: AuthSession,
          orderId: OrderId,
          pickerId: StaffId,
        ) {
          yield* requireRole(session, ["admin"]);
          const picker = yield* requireStaffWithRole(
            persistence,
            pickerId,
            "picker",
          );
          const task = yield* persistence.execute(
            "picking.createTask",
            (store) => store.picking.createTask(orderId, picker.id),
          );
          const order = yield* persistence.execute(
            "orders.setStatus",
            (store) =>
              store.orders.setStatus(
                orderId,
                "awaiting_picking",
                session.customer.id,
                `Assigned picker ${picker.displayName}`,
              ),
          );
          yield* recordAudit(session, "admin.assign_picker", "order", orderId, {
            pickerId,
          });
          yield* publisher.publish({
            type: "picking.assigned",
            orderId,
            taskId: task.id,
          });
          yield* publisher.publish({
            type: "order.updated",
            orderId: order.id,
            status: order.status,
          });
          return task;
        }),
        assignCourier: Effect.fnUntraced(function* (
          session: AuthSession,
          orderId: OrderId,
          courierId: StaffId,
        ) {
          yield* requireRole(session, ["admin"]);
          const courier = yield* requireStaffWithRole(
            persistence,
            courierId,
            "courier",
          );
          const task = yield* persistence.execute(
            "delivery.createTask",
            (store) => store.delivery.createTask(orderId, courier.id),
          );
          const order = yield* persistence.execute(
            "orders.setStatus",
            (store) =>
              store.orders.setStatus(
                orderId,
                "awaiting_courier",
                session.customer.id,
                `Assigned courier ${courier.displayName}`,
              ),
          );
          yield* recordAudit(
            session,
            "admin.assign_courier",
            "order",
            orderId,
            { courierId },
          );
          yield* publisher.publish({
            type: "delivery.assigned",
            orderId,
            taskId: task.id,
          });
          yield* publisher.publish({
            type: "order.updated",
            orderId: order.id,
            status: order.status,
          });
          return task;
        }),
      },
      staff: {
        create: Effect.fnUntraced(function* (
          session: AuthSession,
          input: CreateStaffProfileInput,
        ) {
          yield* requireRole(session, ["super_admin"]);
          const staff = yield* gateway.createStaffProfile(input);
          yield* recordAudit(
            session,
            "admin.staff_create",
            "staff_profile",
            staff.id,
            { roles: staff.roles },
          );
          return staff;
        }),
        list: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute("staff.list", (store) =>
            store.staff.list(),
          );
        }),
        deactivate: Effect.fnUntraced(function* (
          session: AuthSession,
          staffId: StaffId,
        ) {
          yield* requireRole(session, ["super_admin"]);
          yield* gateway.deactivateStaffProfile(staffId);
          yield* recordAudit(
            session,
            "admin.staff_deactivate",
            "staff_profile",
            staffId,
          );
        }),
      },
      payments: {
        list: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute("payments.list", (store) =>
            store.payments.list(),
          );
        }),
        listRefunds: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute("payments.listRefunds", (store) =>
            store.payments.listRefunds(),
          );
        }),
        refund: paymentAdministration.refundPayment,
        updateStatus: paymentAdministration.updatePaymentStatus,
      },
      audit: {
        list: Effect.fnUntraced(function* (
          session: AuthSession,
          limit?: number,
        ) {
          yield* requireRole(session, ["super_admin"]);
          return yield* persistence.execute("audit.list", (store) =>
            store.audit.list(limit),
          );
        }),
      },
      metrics: {
        get: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute("metrics.getMvpMetrics", (store) =>
            store.metrics.getMvpMetrics(),
          );
        }),
      },
      catalog: {
        listCategories: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute(
            "catalog.listAllCategories",
            (store) => store.catalog.listAllCategories(),
          );
        }),
        listProducts: Effect.fnUntraced(function* (session: AuthSession) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute(
            "catalog.listProductsForOperations",
            (store) => store.catalog.listProductsForOperations(),
          );
        }),
        createCategory: Effect.fnUntraced(function* (
          session: AuthSession,
          input: CreateCategoryInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const category = yield* persistence.execute(
            "catalog.createCategory",
            (store) => store.catalog.createCategory(input),
          );
          yield* recordAudit(
            session,
            "admin.category_create",
            "category",
            category.id,
            { name: category.name, slug: category.slug },
          );
          return category;
        }),
        updateCategory: Effect.fnUntraced(function* (
          session: AuthSession,
          categoryId: CategoryId,
          input: UpdateCategoryInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const category = yield* persistence.execute(
            "catalog.updateCategory",
            (store) => store.catalog.updateCategory(categoryId, input),
          );
          yield* recordAudit(
            session,
            "admin.category_update",
            "category",
            category.id,
            { ...input },
          );
          return category;
        }),
        deleteCategory: Effect.fnUntraced(function* (
          session: AuthSession,
          categoryId: CategoryId,
        ) {
          yield* requireRole(session, ["admin"]);
          const result = yield* persistence.execute(
            "catalog.deleteCategory",
            (store) => store.catalog.deleteCategory(categoryId),
          );

          if (result.kind === "not_found") {
            return yield* Effect.fail(
              new ApiFailure("Category not found.", 404),
            );
          }
          if (result.kind === "has_products") {
            return yield* Effect.fail(
              new ApiFailure(
                "A category with products cannot be deleted. Move or delete its products first.",
                409,
              ),
            );
          }

          yield* recordAudit(
            session,
            "admin.category_delete",
            "category",
            result.category.id,
            { name: result.category.name, slug: result.category.slug },
          );
          return result.category;
        }),
        createProduct: Effect.fnUntraced(function* (
          session: AuthSession,
          input: CreateProductInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const product = yield* persistence.execute(
            "catalog.createProduct",
            (store) => store.catalog.createProduct(input),
          );
          yield* recordAudit(
            session,
            "admin.product_create",
            "product",
            product.product.id,
            {
              name: product.product.name,
              customerPriceMinor: product.price.customerPrice.amountMinor,
            },
          );
          return product;
        }),
        updateProduct: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
          input: UpdateProductInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const product = yield* persistence.execute(
            "catalog.updateProduct",
            (store) => store.catalog.updateProduct(productId, input),
          );
          yield* recordAudit(
            session,
            "admin.product_update",
            "product",
            productId,
            { ...input },
          );
          return product;
        }),
        deleteProduct: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
        ) {
          yield* requireRole(session, ["admin"]);
          const result = yield* persistence.execute(
            "catalog.deleteProduct",
            (store) => store.catalog.deleteProduct(productId),
          );

          if (result.kind === "not_found") {
            return yield* Effect.fail(
              new ApiFailure("Product not found.", 404),
            );
          }
          if (result.kind === "has_order_history") {
            return yield* Effect.fail(
              new ApiFailure(
                "A product with order history cannot be deleted. Deactivate it instead.",
                409,
              ),
            );
          }

          yield* recordAudit(
            session,
            "admin.product_delete",
            "product",
            result.product.id,
            { name: result.product.name },
          );
        }),
        updateAvailability: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
          input: UpdateProductAvailabilityInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const availability = yield* persistence.execute(
            "catalog.updateProductAvailability",
            (store) =>
              store.catalog.updateProductAvailability(productId, input),
          );
          yield* recordAudit(
            session,
            "admin.product_availability_update",
            "product",
            productId,
            { ...input },
          );
          return availability;
        }),
        updatePrice: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
          input: UpdateProductPriceInput,
        ) {
          yield* requireRole(session, ["admin"]);
          const price = yield* persistence.execute(
            "catalog.setProductPrice",
            (store) => store.catalog.setProductPrice(productId, input),
          );
          yield* recordAudit(
            session,
            "admin.product_price_update",
            "product",
            productId,
            {
              customerPriceMinor: price.customerPrice.amountMinor,
              internalCostMinor: price.internalCost?.amountMinor,
            },
          );
          return price;
        }),
        listPriceHistory: Effect.fnUntraced(function* (
          session: AuthSession,
          productId: ProductId,
        ) {
          yield* requireRole(session, ["admin"]);
          return yield* persistence.execute(
            "catalog.listProductPriceHistory",
            (store) => store.catalog.listProductPriceHistory(productId),
          );
        }),
        recordImageUpload,
        uploadImage: Effect.fnUntraced(function* (
          session: AuthSession,
          dataBase64: string,
        ) {
          yield* requireRole(session, ["admin"]);
          const image = yield* productImages.saveBase64(dataBase64);
          yield* recordAudit(
            session,
            "admin.product_image_upload",
            "product_image",
            image.fileName,
            { contentType: image.contentType, sizeBytes: image.sizeBytes },
          );
          return { url: image.url };
        }),
      },
    });
  }),
);

export interface ApplicationLayerOptions {
  readonly productImageStorage?: ProductImageStorage;
}

export const makeApplicationLayer = (
  dependencies: BackendDependencies,
  options: ApplicationLayerOptions = {},
) =>
  Layer.mergeAll(
    catalog,
    authentication,
    customerShopping,
    staffOperations,
    administration,
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        makeOrderFulfillmentLayer({
          flatDeliveryFee: dependencies.flatDeliveryFee,
          paymentProviderName: dependencies.paymentProvider.name,
        }),
        paymentAdministrationLayer,
      ),
    ),
    Layer.provide(makeProductImagesLayer(options.productImageStorage)),
    Layer.provide(makeBackendInfrastructureLayer(dependencies)),
  );
