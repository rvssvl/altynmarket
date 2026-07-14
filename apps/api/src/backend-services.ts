import {
  brand,
  calculateFinalTotal,
  calculateGoodsTotal,
  type Address,
  type Category,
  type CategoryId,
  type AuthSession,
  type CancelOrderItemInput,
  type DeliveryTask,
  type DeliveryTaskStatus,
  type Money,
  type MvpMetrics,
  type Order,
  type OrderId,
  type OrderItem,
  type OrderItemId,
  type OrderStatus,
  type Payment,
  type PaymentId,
  type PaymentStatus,
  type PickingTask,
  type ProductAvailability,
  type ProductId,
  type ProductPrice,
  type ProductUnit,
  type Refund,
  type StaffId,
  type StaffProfile,
  type UserRole,
} from "@altyn-market/domain";
import { randomUUID } from "node:crypto";
import type { AuthService } from "./auth-service.js";
import type { RuntimePaymentProvider } from "./modules/payments.js";
import type { RealtimeBus } from "./realtime.js";
import type {
  AuditLogRecord,
  CartSnapshot,
  ProductForSale,
  PushPlatform,
  PushSubscriptionRecord,
  Store,
} from "./store.js";

export interface BackendServices {
  readonly auth: AuthService;
  readonly catalog: {
    readonly listCategories: Store["catalog"]["listCategories"];
    readonly listProducts: Store["catalog"]["listProducts"];
    readonly getProductPrice: (productId: ProductId) => Promise<ProductPrice>;
  };
  readonly cart: {
    readonly get: (session: AuthSession) => Promise<CartSnapshot>;
    readonly addItem: (
      session: AuthSession,
      productId: ProductId,
      quantity: number,
    ) => Promise<CartSnapshot>;
    readonly removeItem: (
      session: AuthSession,
      productId: ProductId,
    ) => Promise<CartSnapshot>;
  };
  readonly checkout: {
    readonly create: (
      session: AuthSession,
      address: CheckoutAddressInput,
    ) => Promise<{ readonly order: Order; readonly payment: Payment }>;
  };
  readonly orders: {
    readonly get: (session: AuthSession, orderId: OrderId) => Promise<Order>;
    readonly listMine: (session: AuthSession) => Promise<readonly Order[]>;
  };
  readonly notifications: {
    readonly registerPushToken: (
      session: AuthSession,
      input: RegisterPushTokenRequest,
    ) => Promise<PushSubscriptionRecord>;
  };
  readonly picking: {
    readonly listAssignedTasks: (
      session: AuthSession,
    ) => Promise<readonly PickingTask[]>;
    readonly startPicking: (
      session: AuthSession,
      orderId: OrderId,
    ) => Promise<Order>;
    readonly updateItem: (
      session: AuthSession,
      input: UpdatePickingItemInput,
    ) => Promise<Order>;
    readonly cancelItem: (
      session: AuthSession,
      input: CancelOrderItemInput,
    ) => Promise<Order>;
    readonly completePicking: (
      session: AuthSession,
      orderId: OrderId,
    ) => Promise<Order>;
  };
  readonly delivery: {
    readonly listAssignedTasks: (
      session: AuthSession,
    ) => Promise<readonly DeliveryTask[]>;
    readonly updateStatus: (
      session: AuthSession,
      orderId: OrderId,
      status: DeliveryTaskStatus,
    ) => Promise<DeliveryTask>;
  };
  readonly admin: {
    readonly listCategories: (
      session: AuthSession,
    ) => Promise<readonly Category[]>;
    readonly listCatalogProducts: (
      session: AuthSession,
    ) => Promise<readonly ProductForSale[]>;
    readonly createCategory: (
      session: AuthSession,
      input: CreateCategoryRequest,
    ) => Promise<Category>;
    readonly updateCategory: (
      session: AuthSession,
      categoryId: CategoryId,
      input: UpdateCategoryRequest,
    ) => Promise<Category>;
    readonly deleteCategory: (
      session: AuthSession,
      categoryId: CategoryId,
    ) => Promise<Category>;
    readonly createProduct: (
      session: AuthSession,
      input: CreateProductRequest,
    ) => Promise<ProductForSale>;
    readonly updateProduct: (
      session: AuthSession,
      productId: ProductId,
      input: UpdateProductRequest,
    ) => Promise<ProductForSale>;
    readonly deleteProduct: (
      session: AuthSession,
      productId: ProductId,
    ) => Promise<void>;
    readonly updateProductAvailability: (
      session: AuthSession,
      productId: ProductId,
      input: UpdateProductAvailabilityRequest,
    ) => Promise<ProductAvailability>;
    readonly updateProductPrice: (
      session: AuthSession,
      productId: ProductId,
      input: UpdateProductPriceRequest,
    ) => Promise<ProductPrice>;
    readonly recordProductImageUpload: (
      session: AuthSession,
      input: ProductImageUploadRequest,
    ) => Promise<void>;
    readonly listProductPriceHistory: (
      session: AuthSession,
      productId: ProductId,
    ) => Promise<readonly ProductPrice[]>;
    readonly listOrders: (
      session: AuthSession,
      status?: OrderStatus,
    ) => Promise<readonly Order[]>;
    readonly assignPicker: (
      session: AuthSession,
      orderId: OrderId,
      pickerId: StaffId,
    ) => Promise<PickingTask>;
    readonly assignCourier: (
      session: AuthSession,
      orderId: OrderId,
      courierId: StaffId,
    ) => Promise<DeliveryTask>;
    readonly createStaffProfile: (
      session: AuthSession,
      input: CreateStaffProfileRequest,
    ) => Promise<StaffProfile>;
    readonly listStaffProfiles: (
      session: AuthSession,
    ) => Promise<readonly StaffProfile[]>;
    readonly deactivateStaffProfile: (
      session: AuthSession,
      staffId: StaffId,
    ) => Promise<void>;
    readonly listPayments: (
      session: AuthSession,
    ) => Promise<readonly Payment[]>;
    readonly listRefunds: (session: AuthSession) => Promise<readonly Refund[]>;
    readonly refundPayment: (
      session: AuthSession,
      input: RefundPaymentRequest,
    ) => Promise<Refund>;
    readonly updatePaymentStatus: (
      session: AuthSession,
      input: UpdatePaymentStatusRequest,
    ) => Promise<Payment>;
    readonly listAuditLog: (
      session: AuthSession,
      limit?: number,
    ) => Promise<readonly AuditLogRecord[]>;
    readonly getMetrics: (session: AuthSession) => Promise<MvpMetrics>;
  };
}

export interface CheckoutAddressInput {
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

export interface UpdatePickingItemInput {
  readonly orderId: OrderId;
  readonly itemId: OrderItemId;
  readonly status: "picked" | "cancelled";
  readonly pickedQuantity?: number;
  readonly reason?: "unavailable" | "bad_quality";
}

export interface RegisterPushTokenRequest {
  readonly token: string;
  readonly platform: PushPlatform;
}

export interface CreateStaffProfileRequest {
  readonly phone: { readonly e164: string };
  readonly displayName: string;
  readonly roles: readonly Exclude<UserRole, "customer">[];
}

export interface CreateCategoryRequest {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface UpdateCategoryRequest {
  readonly name?: string;
  readonly slug?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface CreateProductRequest {
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

export interface UpdateProductRequest {
  readonly categoryId?: CategoryId;
  readonly name?: string;
  readonly description?: string;
  readonly unit?: ProductUnit;
  readonly imageUrl?: string;
  readonly isActive?: boolean;
}

export interface UpdateProductAvailabilityRequest {
  readonly isAvailable: boolean;
  readonly note?: string;
}

export interface UpdateProductPriceRequest {
  readonly customerPrice: Money;
  readonly internalCost?: Money;
  readonly effectiveFrom?: string;
}

export interface ProductImageUploadRequest {
  readonly fileName: string;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly sizeBytes: number;
}

export interface RefundPaymentRequest {
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly reason: string;
}

export interface UpdatePaymentStatusRequest {
  readonly paymentId: PaymentId;
  readonly status: PaymentStatus;
}

export interface BackendServiceOptions {
  readonly store: Store;
  readonly auth: AuthService;
  readonly paymentProvider: RuntimePaymentProvider;
  readonly realtime: RealtimeBus;
  readonly flatDeliveryFee: Money;
}

export const createBackendServices = (
  options: BackendServiceOptions,
): BackendServices => {
  const { store, auth, paymentProvider, realtime, flatDeliveryFee } = options;

  const publishOrderUpdated = async (order: Order): Promise<void> => {
    await realtime.publish({
      type: "order.updated",
      orderId: order.id,
      status: order.status,
    });
  };

  const publishPaymentUpdated = async (
    order: Order,
    payment: Payment,
  ): Promise<void> => {
    await realtime.publish({
      type: "payment.updated",
      orderId: order.id,
      paymentId: payment.id,
      status: payment.status,
    });
  };

  return {
    auth,
    catalog: {
      listCategories: () => store.catalog.listCategories(),
      listProducts: () => store.catalog.listProducts(),
      getProductPrice: async (productId) => {
        const productForSale = await requireProductForSale(store, productId);
        return productForSale.price;
      },
    },
    cart: {
      get: (session) => store.cart.get(session.customer.id),
      addItem: async (session, productId, quantity) => {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new ApiFailure("quantity must be greater than zero.", 400);
        }

        const productForSale = await requireProductForSale(store, productId);
        assertProductCanBeSold(productForSale);
        return store.cart.addItem(session.customer.id, productId, quantity);
      },
      removeItem: (session, productId) =>
        store.cart.removeItem(session.customer.id, productId),
    },
    checkout: {
      create: async (session, addressInput) => {
        const cart = await store.cart.get(session.customer.id);

        if (cart.items.length === 0) {
          throw new ApiFailure("Cart is empty.", 400);
        }

        const items = await Promise.all(
          cart.items.map(async (line) => {
            const productForSale = await requireProductForSale(
              store,
              line.product.id,
            );
            assertProductCanBeSold(productForSale);
            return {
              id: brand<string, "OrderItemId">(randomUUID()),
              productId: productForSale.product.id,
              productNameSnapshot: productForSale.product.name,
              unitSnapshot: productForSale.product.unit,
              requestedQuantity: line.quantity,
              unitPriceSnapshot: productForSale.price.customerPrice,
            };
          }),
        );
        const goodsTotal = calculateGoodsTotal(
          items.map((item): OrderItem => ({ ...item, status: "pending" })),
        );
        const finalTotal = {
          amountMinor: goodsTotal.amountMinor + flatDeliveryFee.amountMinor,
          currency: "KZT" as const,
        };
        const orderId = brand<string, "OrderId">(randomUUID());
        const authorization = await paymentProvider.authorize({
          orderId,
          amount: finalTotal,
          customerPhone: session.customer.phone.e164,
        });
        const status: OrderStatus =
          authorization.status === "authorized"
            ? "payment_authorized"
            : "draft";
        const address = toAddress(session, addressInput);
        const result = await store.orders.createCheckoutOrder({
          orderId,
          paymentId: randomUUID(),
          customerId: session.customer.id,
          address,
          status,
          items,
          goodsTotal,
          deliveryFee: flatDeliveryFee,
          finalTotal,
          payment: {
            provider: paymentProvider.name,
            status: authorization.status,
            authorizedAmount: finalTotal,
            providerPaymentId: authorization.providerPaymentId,
            ...(authorization.redirectUrl
              ? { redirectUrl: authorization.redirectUrl }
              : {}),
            ...(authorization.deeplinkUrl
              ? { deeplinkUrl: authorization.deeplinkUrl }
              : {}),
          },
        });

        await store.cart.clear(session.customer.id);
        await publishOrderUpdated(result.order);
        await publishPaymentUpdated(result.order, result.payment);
        return result;
      },
    },
    orders: {
      get: async (session, orderId) => {
        const order = await requireOrder(store, orderId);
        await assertCanReadOrder(auth, session, order);
        return order;
      },
      listMine: (session) => store.orders.listByCustomer(session.customer.id),
    },
    notifications: {
      registerPushToken: async (session, input) => {
        const subscription = await store.pushSubscriptions.upsert({
          userId: session.customer.id,
          token: input.token,
          platform: input.platform,
        });
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "customer.push_token_registered",
          entityType: "push_subscription",
          entityId: subscription.token.slice(-16),
          metadata: { platform: subscription.platform },
        });
        return subscription;
      },
    },
    picking: {
      listAssignedTasks: async (session) => {
        await auth.requireRole(session, ["picker", "admin"]);

        if (hasAnyRole(session, ["admin", "super_admin"])) {
          return store.picking.listAssignedTasks();
        }

        if (!session.staff) {
          return [];
        }

        return store.picking.listAssignedTasks(session.staff.id);
      },
      startPicking: async (session, orderId) => {
        await auth.requireRole(session, ["picker", "admin"]);
        const order = await requireOrder(store, orderId);
        const updated = await store.orders.setStatus(
          order.id,
          "picking",
          session.customer.id,
          "Picking started",
        );
        const task = await store.picking.getByOrderId(order.id);
        if (task) {
          await store.picking.updateStatus(task.id, "in_progress");
        }
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "picking.start",
          entityType: "order",
          entityId: order.id,
        });
        await publishOrderUpdated(updated);
        return updated;
      },
      updateItem: async (session, input) => {
        await auth.requireRole(session, ["picker", "admin"]);

        if (input.status === "cancelled") {
          return cancelOrderItem(store, realtime, session, input);
        }

        const existing = await requireOrder(store, input.orderId);
        const item = requireOrderItem(existing, input.itemId);
        const pickedQuantity = input.pickedQuantity ?? item.requestedQuantity;

        if (!Number.isFinite(pickedQuantity) || pickedQuantity < 0) {
          throw new ApiFailure("pickedQuantity must be zero or greater.", 400);
        }

        const updated = await store.orders.updateItemStatus({
          orderId: input.orderId,
          itemId: input.itemId,
          status: "picked",
          pickedQuantity,
        });
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "picking.item_picked",
          entityType: "order_item",
          entityId: input.itemId,
          metadata: { orderId: input.orderId, pickedQuantity },
        });
        await publishOrderUpdated(updated);
        return updated;
      },
      cancelItem: async (session, input) => {
        await auth.requireRole(session, ["picker", "admin"]);
        return cancelOrderItem(store, realtime, session, {
          orderId: input.orderId,
          itemId: input.orderItemId,
          status: "cancelled",
          reason: input.reason,
        });
      },
      completePicking: async (session, orderId) => {
        await auth.requireRole(session, ["picker", "admin"]);
        let order = await requireOrder(store, orderId);

        for (const item of order.items) {
          if (item.status === "pending") {
            order = await store.orders.updateItemStatus({
              orderId,
              itemId: item.id,
              status: "picked",
              pickedQuantity: item.requestedQuantity,
            });
          }
        }

        const goodsTotal = calculateGoodsTotal(order.items);
        const finalTotal = calculateFinalTotal(order.items, order.deliveryFee);
        order = await store.orders.updateTotals(
          order.id,
          goodsTotal,
          finalTotal,
        );
        const payment = await store.payments.getByOrderId(order.id);

        if (!payment?.providerPaymentId) {
          const failed = await store.orders.setStatus(
            order.id,
            "payment_failed",
            session.customer.id,
            "Missing payment authorization",
          );
          await publishOrderUpdated(failed);
          throw new ApiFailure("Payment authorization is missing.", 409);
        }

        if (finalTotal.amountMinor > payment.authorizedAmount.amountMinor) {
          await store.payments.updateStatus(payment.id, "capture_failed");
          const failed = await store.orders.setStatus(
            order.id,
            "payment_failed",
            session.customer.id,
            "Final total exceeded authorized amount",
          );
          await publishOrderUpdated(failed);
          throw new ApiFailure("Final total exceeds authorized amount.", 409);
        }

        let nextPayment = payment;
        if (finalTotal.amountMinor === 0) {
          await paymentProvider.cancelAuthorization({
            providerPaymentId: payment.providerPaymentId,
            reason: "No picked items",
          });
          nextPayment = await store.payments.updateStatus(
            payment.id,
            "authorization_cancelled",
          );
          order = await store.orders.setStatus(
            order.id,
            "cancelled",
            session.customer.id,
            "No picked items",
          );
        } else {
          const capture = await paymentProvider.capture({
            providerPaymentId: payment.providerPaymentId,
            amount: finalTotal,
          });
          nextPayment = await store.payments.updateAfterCapture(
            payment.id,
            capture.status,
            finalTotal,
          );

          const refundDelta =
            payment.authorizedAmount.amountMinor - finalTotal.amountMinor;
          if (refundDelta > 0 && capture.status === "captured") {
            const refundAmount: Money = {
              amountMinor: refundDelta,
              currency: payment.authorizedAmount.currency,
            };
            const refund = await paymentProvider.refund({
              providerPaymentId: payment.providerPaymentId,
              amount: refundAmount,
              reason: "Picked total below authorized amount",
            });
            await store.payments.createRefund({
              id: refund.providerRefundId,
              paymentId: payment.id,
              amount: refundAmount,
              reason: "picked_total_below_authorized",
              status: refund.status,
            });
          }

          order = await store.orders.setStatus(
            order.id,
            capture.status === "captured" ? "payment_captured" : "picked",
            session.customer.id,
            "Picking completed",
          );
        }

        const task = await store.picking.getByOrderId(order.id);
        if (task) {
          await store.picking.updateStatus(task.id, "completed");
        }
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "picking.complete",
          entityType: "order",
          entityId: order.id,
          metadata: {
            finalTotalMinor: finalTotal.amountMinor,
            paymentStatus: nextPayment.status,
          },
        });
        await publishOrderUpdated(order);
        await publishPaymentUpdated(order, nextPayment);
        return order;
      },
    },
    delivery: {
      listAssignedTasks: async (session) => {
        await auth.requireRole(session, ["courier", "admin"]);

        if (hasAnyRole(session, ["admin", "super_admin"])) {
          return store.delivery.listAssignedTasks();
        }

        if (!session.staff) {
          return [];
        }

        return store.delivery.listAssignedTasks(session.staff.id);
      },
      updateStatus: async (session, orderId, status) => {
        await auth.requireRole(session, ["courier", "admin"]);
        const task = await store.delivery.updateStatus(orderId, status);
        const orderStatus = deliveryStatusToOrderStatus(status);
        const order = await store.orders.setStatus(
          orderId,
          orderStatus,
          session.customer.id,
          `Delivery status ${status}`,
        );
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "delivery.status_update",
          entityType: "order",
          entityId: orderId,
          metadata: { status },
        });
        await publishOrderUpdated(order);
        return task;
      },
    },
    admin: {
      listCategories: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.catalog.listAllCategories();
      },
      listCatalogProducts: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.catalog.listProductsForOperations();
      },
      createCategory: async (session, input) => {
        await auth.requireRole(session, ["admin"]);
        const category = await store.catalog.createCategory(input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.category_create",
          entityType: "category",
          entityId: category.id,
          metadata: { name: category.name, slug: category.slug },
        });
        return category;
      },
      updateCategory: async (session, categoryId, input) => {
        await auth.requireRole(session, ["admin"]);
        const category = await store.catalog.updateCategory(categoryId, input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.category_update",
          entityType: "category",
          entityId: category.id,
          metadata: { ...input },
        });
        return category;
      },
      deleteCategory: async (session, categoryId) => {
        await auth.requireRole(session, ["admin"]);
        const result = await store.catalog.deleteCategory(categoryId);

        if (result.kind === "not_found") {
          throw new ApiFailure("Category not found.", 404);
        }
        if (result.kind === "has_products") {
          throw new ApiFailure(
            "A category with products cannot be deleted. Move or delete its products first.",
            409,
          );
        }

        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.category_delete",
          entityType: "category",
          entityId: result.category.id,
          metadata: { name: result.category.name, slug: result.category.slug },
        });
        return result.category;
      },
      createProduct: async (session, input) => {
        await auth.requireRole(session, ["admin"]);
        const product = await store.catalog.createProduct(input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_create",
          entityType: "product",
          entityId: product.product.id,
          metadata: {
            name: product.product.name,
            customerPriceMinor: product.price.customerPrice.amountMinor,
          },
        });
        return product;
      },
      updateProduct: async (session, productId, input) => {
        await auth.requireRole(session, ["admin"]);
        const product = await store.catalog.updateProduct(productId, input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_update",
          entityType: "product",
          entityId: productId,
          metadata: { ...input },
        });
        return product;
      },
      deleteProduct: async (session, productId) => {
        await auth.requireRole(session, ["admin"]);
        const result = await store.catalog.deleteProduct(productId);

        if (result.kind === "not_found") {
          throw new ApiFailure("Product not found.", 404);
        }
        if (result.kind === "has_order_history") {
          throw new ApiFailure(
            "A product with order history cannot be deleted. Deactivate it instead.",
            409,
          );
        }

        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_delete",
          entityType: "product",
          entityId: result.product.id,
          metadata: { name: result.product.name },
        });
      },
      updateProductAvailability: async (session, productId, input) => {
        await auth.requireRole(session, ["admin"]);
        const availability = await store.catalog.updateProductAvailability(
          productId,
          input,
        );
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_availability_update",
          entityType: "product",
          entityId: productId,
          metadata: { ...input },
        });
        return availability;
      },
      updateProductPrice: async (session, productId, input) => {
        await auth.requireRole(session, ["admin"]);
        const price = await store.catalog.setProductPrice(productId, input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_price_update",
          entityType: "product",
          entityId: productId,
          metadata: {
            customerPriceMinor: price.customerPrice.amountMinor,
            internalCostMinor: price.internalCost?.amountMinor,
          },
        });
        return price;
      },
      recordProductImageUpload: async (session, input) => {
        await auth.requireRole(session, ["admin"]);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.product_image_upload",
          entityType: "product_image",
          entityId: input.fileName,
          metadata: {
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
          },
        });
      },
      listProductPriceHistory: async (session, productId) => {
        await auth.requireRole(session, ["admin"]);
        return store.catalog.listProductPriceHistory(productId);
      },
      listOrders: async (session, status) => {
        await auth.requireRole(session, ["admin"]);
        return store.orders.list(status);
      },
      assignPicker: async (session, orderId, pickerId) => {
        await auth.requireRole(session, ["admin"]);
        const picker = await requireStaffWithRole(store, pickerId, "picker");
        const task = await store.picking.createTask(orderId, picker.id);
        const order = await store.orders.setStatus(
          orderId,
          "awaiting_picking",
          session.customer.id,
          `Assigned picker ${picker.displayName}`,
        );
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.assign_picker",
          entityType: "order",
          entityId: orderId,
          metadata: { pickerId },
        });
        await realtime.publish({
          type: "picking.assigned",
          orderId,
          taskId: task.id,
        });
        await publishOrderUpdated(order);
        return task;
      },
      assignCourier: async (session, orderId, courierId) => {
        await auth.requireRole(session, ["admin"]);
        const courier = await requireStaffWithRole(store, courierId, "courier");
        const task = await store.delivery.createTask(orderId, courier.id);
        const order = await store.orders.setStatus(
          orderId,
          "awaiting_courier",
          session.customer.id,
          `Assigned courier ${courier.displayName}`,
        );
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.assign_courier",
          entityType: "order",
          entityId: orderId,
          metadata: { courierId },
        });
        await realtime.publish({
          type: "delivery.assigned",
          orderId,
          taskId: task.id,
        });
        await publishOrderUpdated(order);
        return task;
      },
      createStaffProfile: async (session, input) => {
        await auth.requireRole(session, ["super_admin"]);
        const staff = await auth.createStaffProfile(input);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.staff_create",
          entityType: "staff_profile",
          entityId: staff.id,
          metadata: { roles: staff.roles },
        });
        return staff;
      },
      listStaffProfiles: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.staff.list();
      },
      deactivateStaffProfile: async (session, staffId) => {
        await auth.requireRole(session, ["super_admin"]);
        await auth.deactivateStaffProfile(staffId);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.staff_deactivate",
          entityType: "staff_profile",
          entityId: staffId,
        });
      },
      listPayments: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.payments.list();
      },
      listRefunds: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.payments.listRefunds();
      },
      refundPayment: async (session, input) => {
        await auth.requireRole(session, ["admin"]);
        const payment = await requirePayment(store, input.paymentId);
        if (!payment.providerPaymentId) {
          throw new ApiFailure("Payment provider id is missing.", 409);
        }
        if (!Number.isFinite(input.amount.amountMinor)) {
          throw new ApiFailure("Refund amount must be valid.", 400);
        }
        if (input.amount.amountMinor <= 0) {
          throw new ApiFailure("Refund amount must be greater than zero.", 400);
        }
        const providerRefund = await paymentProvider.refund({
          providerPaymentId: payment.providerPaymentId,
          amount: input.amount,
          reason: input.reason,
        });
        const refund = await store.payments.createRefund({
          id: providerRefund.providerRefundId,
          paymentId: payment.id,
          amount: input.amount,
          reason: input.reason,
          status: providerRefund.status,
        });
        const updatedPayment = await store.payments.updateStatus(
          payment.id,
          providerRefund.status === "completed" ? "refunded" : "refund_pending",
        );
        const order = await store.orders.setStatus(
          payment.orderId,
          providerRefund.status === "completed"
            ? "refunded"
            : "refund_required",
          session.customer.id,
          `Admin refund: ${input.reason}`,
        );
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.payment_refund",
          entityType: "payment",
          entityId: payment.id,
          metadata: {
            refundId: refund.id,
            amountMinor: input.amount.amountMinor,
            reason: input.reason,
          },
        });
        await publishOrderUpdated(order);
        await publishPaymentUpdated(order, updatedPayment);
        return refund;
      },
      updatePaymentStatus: async (session, input) => {
        await auth.requireRole(session, ["admin"]);
        const payment = await requirePayment(store, input.paymentId);
        const updated = await store.payments.updateStatus(
          payment.id,
          input.status,
        );
        const order = await requireOrder(store, payment.orderId);
        await store.audit.record({
          actorUserId: session.customer.id,
          action: "admin.payment_status_update",
          entityType: "payment",
          entityId: payment.id,
          metadata: { status: input.status },
        });
        await publishPaymentUpdated(order, updated);
        return updated;
      },
      listAuditLog: async (session, limit) => {
        await auth.requireRole(session, ["super_admin"]);
        return store.audit.list(limit);
      },
      getMetrics: async (session) => {
        await auth.requireRole(session, ["admin"]);
        return store.metrics.getMvpMetrics();
      },
    },
  };
};

export const ensureBootstrapAdmin = async (
  auth: AuthService,
  phone: string | undefined,
): Promise<void> => {
  if (!phone) {
    return;
  }

  await auth.createStaffProfile({
    phone: { e164: phone },
    displayName: "Bootstrap admin",
    roles: ["super_admin", "admin", "picker", "courier"],
  });
};

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const requireProductForSale = async (
  store: Store,
  productId: ProductId,
): Promise<ProductForSale> => {
  const productForSale = await store.catalog.getProductForSale(productId);

  if (!productForSale) {
    throw new ApiFailure("Product not found.", 404);
  }

  return productForSale;
};

const assertProductCanBeSold = (productForSale: ProductForSale): void => {
  if (
    !productForSale.product.isActive ||
    !productForSale.availability.isAvailable
  ) {
    throw new ApiFailure("Product is unavailable.", 409);
  }
};

const requireOrder = async (store: Store, orderId: OrderId): Promise<Order> => {
  const order = await store.orders.get(orderId);

  if (!order) {
    throw new ApiFailure("Order not found.", 404);
  }

  return order;
};

const requirePayment = async (
  store: Store,
  paymentId: PaymentId,
): Promise<Payment> => {
  const payment = await store.payments.getById(paymentId);

  if (!payment) {
    throw new ApiFailure("Payment not found.", 404);
  }

  return payment;
};

const requireOrderItem = (order: Order, itemId: OrderItemId): OrderItem => {
  const item = order.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new ApiFailure("Order item not found.", 404);
  }

  return item;
};

const assertCanReadOrder = async (
  auth: AuthService,
  session: AuthSession,
  order: Order,
): Promise<void> => {
  if (order.customerId === session.customer.id) {
    return;
  }

  await auth.requireRole(session, ["picker", "courier", "admin"]);
};

const cancelOrderItem = async (
  store: Store,
  realtime: RealtimeBus,
  session: AuthSession,
  input: UpdatePickingItemInput,
): Promise<Order> => {
  const reason = input.reason ?? "unavailable";
  const updated = await store.orders.updateItemStatus({
    orderId: input.orderId,
    itemId: input.itemId,
    status: "cancelled",
    cancellationReason: reason,
  });
  await store.audit.record({
    actorUserId: session.customer.id,
    action: "picking.item_cancelled",
    entityType: "order_item",
    entityId: input.itemId,
    metadata: { orderId: input.orderId, reason },
  });
  await realtime.publish({
    type: "order.updated",
    orderId: updated.id,
    status: updated.status,
  });
  return updated;
};

const requireStaffWithRole = async (
  store: Store,
  staffId: StaffId,
  role: Exclude<UserRole, "customer">,
): Promise<StaffProfile> => {
  const staff = await store.staff.getById(staffId);

  if (!staff?.isActive || !staff.roles.includes(role)) {
    throw new ApiFailure(`Staff profile must have ${role} role.`, 400);
  }

  return staff;
};

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

const toAddress = (
  session: AuthSession,
  input: CheckoutAddressInput,
): Address => ({
  id: brand(randomUUID()),
  userId: session.customer.id,
  label: input.label ?? "Delivery",
  city: input.city,
  street: input.street,
  ...(input.apartment ? { apartment: input.apartment } : {}),
  ...(input.entrance ? { entrance: input.entrance } : {}),
  ...(input.floor ? { floor: input.floor } : {}),
  ...(input.comment ? { comment: input.comment } : {}),
  ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
  ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
});
