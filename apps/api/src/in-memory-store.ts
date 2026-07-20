import {
  brand,
  calculateFinalTotal,
  calculateGoodsTotal,
  type CartId,
  type Category,
  type CategoryId,
  type Customer,
  type DeliveryTask,
  type Money,
  type Order,
  type OrderId,
  type OrderItem,
  type Payment,
  type PhoneNumber,
  type PickingTask,
  type Product,
  type ProductAvailability,
  type ProductId,
  type ProductPrice,
  type ProductUnit,
  type CartLine,
  type CartSnapshot,
  type Refund,
  type StaffProfile,
  type UserId,
} from "@altyn-market/domain";
import { randomUUID } from "node:crypto";
import type {
  AuditLogRecord,
  CreateSessionRecordInput,
  OtpChallengeRecord,
  ProductForSale,
  PushSubscriptionRecord,
  Store,
  StoredSessionRecord,
} from "./store.js";

interface SessionState extends CreateSessionRecordInput {}

interface RefreshTokenState {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly usedAt?: string;
  readonly revokedAt?: string;
  readonly replacedByTokenId?: string;
}

interface CartState {
  readonly id: CartId;
  readonly userId: UserId;
  readonly items: Map<string, number>;
}

interface PriceState extends ProductPrice {
  readonly internalCost?: Money;
}

export const createInMemoryStore = (): Store => {
  const usersById = new Map<string, Customer>();
  const usersByPhone = new Map<string, Customer>();
  const staffById = new Map<string, StaffProfile>();
  const staffByUserId = new Map<string, StaffProfile>();
  const challenges = new Map<string, OtpChallengeRecord>();
  const sessionsByAccessHash = new Map<string, SessionState>();
  const refreshTokensByHash = new Map<string, RefreshTokenState>();
  const refreshTokensById = new Map<string, RefreshTokenState>();
  const cartsByUser = new Map<string, CartState>();
  const categories = new Map<string, Category>();
  const products = new Map<string, Product>();
  const prices = new Map<string, PriceState>();
  const priceHistory = new Map<string, PriceState[]>();
  const availability = new Map<string, ProductAvailability>();
  const orders = new Map<string, Order>();
  const paymentsById = new Map<string, Payment>();
  const paymentIdByOrderId = new Map<string, string>();
  const refunds = new Map<string, Refund>();
  const pickingTasks = new Map<string, PickingTask>();
  const deliveryTasks = new Map<string, DeliveryTask>();
  const pushSubscriptions = new Map<string, PushSubscriptionRecord>();
  const auditLog: AuditLogRecord[] = [];

  seedCatalog(categories, products, prices, priceHistory, availability);

  const getProductForSale = (
    productId: ProductId,
  ): ProductForSale | undefined => {
    const product = products.get(productId);
    const price = prices.get(productId);
    const productAvailability = availability.get(productId);

    if (!product || !price || !productAvailability) {
      return undefined;
    }

    return { product, price, availability: productAvailability };
  };

  const toCartSnapshot = (cart: CartState): CartSnapshot => {
    const items: CartLine[] = [];

    for (const [productId, quantity] of cart.items) {
      const productForSale = getProductForSale(brand(productId));
      if (productForSale) {
        items.push({ ...productForSale, quantity });
      }
    }

    return { id: cart.id, userId: cart.userId, items };
  };

  const getOrCreateCart = (userId: UserId): CartState => {
    const existing = cartsByUser.get(userId);

    if (existing) {
      return existing;
    }

    const cart: CartState = {
      id: brand<string, "CartId">(randomUUID()),
      userId,
      items: new Map(),
    };
    cartsByUser.set(userId, cart);
    return cart;
  };

  const sessionToStored = (
    session: SessionState,
  ): StoredSessionRecord | undefined => {
    const customer = usersById.get(session.userId);

    if (!customer) {
      return undefined;
    }

    const staff = staffByUserId.get(session.userId);
    const record: StoredSessionRecord = {
      id: session.sessionId,
      userId: session.userId,
      deviceSessionId: session.deviceSessionId,
      expiresAt: session.accessExpiresAt,
      customer,
      ...(staff ? { staff } : {}),
    };
    return record;
  };

  return {
    auth: {
      createOtpChallenge: async (input) => {
        challenges.set(input.id, input);
      },
      findActiveOtpChallenge: async (phone, now) => {
        const active = [...challenges.values()]
          .filter(
            (challenge) =>
              challenge.phone.e164 === phone.e164 &&
              Date.parse(challenge.expiresAt) > now.getTime(),
          )
          .sort(
            (left, right) =>
              Date.parse(right.expiresAt) - Date.parse(left.expiresAt),
          );
        return active[0];
      },
      updateOtpAttempts: async (challengeId, attempts) => {
        const challenge = challenges.get(challengeId);
        if (challenge) {
          challenges.set(challengeId, { ...challenge, attempts });
        }
      },
      consumeOtpChallenge: async (challengeId) => {
        challenges.delete(challengeId);
      },
      upsertCustomer: async (phone, fullName) => {
        const existing = usersByPhone.get(phone.e164);
        if (existing) {
          const updated = fullName ? { ...existing, fullName } : existing;
          usersById.set(updated.id, updated);
          usersByPhone.set(phone.e164, updated);
          return updated;
        }

        const customer = optionalFullName(
          {
            id: brand(randomUUID()),
            phone,
            createdAt: new Date().toISOString(),
          },
          fullName,
        );
        usersById.set(customer.id, customer);
        usersByPhone.set(phone.e164, customer);
        return customer;
      },
      createDeviceSession: async () => undefined,
      createSession: async (input) => {
        sessionsByAccessHash.set(input.accessTokenHash, input);
        const refreshToken: RefreshTokenState = {
          id: input.refreshTokenId,
          sessionId: input.sessionId,
          tokenHash: input.refreshTokenHash,
          expiresAt: input.refreshExpiresAt,
        };
        refreshTokensByHash.set(input.refreshTokenHash, refreshToken);
        refreshTokensById.set(input.refreshTokenId, refreshToken);
      },
      findSessionByAccessTokenHash: async (tokenHash, now) => {
        const session = sessionsByAccessHash.get(tokenHash);

        if (!session || Date.parse(session.accessExpiresAt) <= now.getTime()) {
          return undefined;
        }

        return sessionToStored(session);
      },
      findRefreshTokenByHash: async (tokenHash, now) => {
        const refreshToken = refreshTokensByHash.get(tokenHash);

        if (
          !refreshToken ||
          refreshToken.usedAt ||
          refreshToken.revokedAt ||
          Date.parse(refreshToken.expiresAt) <= now.getTime()
        ) {
          return undefined;
        }

        const session = [...sessionsByAccessHash.values()].find(
          (candidate) => candidate.sessionId === refreshToken.sessionId,
        );

        if (!session) {
          return undefined;
        }

        const customer = usersById.get(session.userId);

        if (!customer) {
          return undefined;
        }

        const staff = staffByUserId.get(session.userId);
        return {
          id: refreshToken.id,
          sessionId: refreshToken.sessionId,
          userId: session.userId,
          deviceSessionId: session.deviceSessionId,
          expiresAt: refreshToken.expiresAt,
          customer,
          ...(staff ? { staff } : {}),
        };
      },
      markRefreshTokenUsed: async (refreshTokenId, replacementTokenId) => {
        const refreshToken = refreshTokensById.get(refreshTokenId);
        if (refreshToken) {
          const updated = {
            ...refreshToken,
            usedAt: new Date().toISOString(),
            replacedByTokenId: replacementTokenId,
          };
          refreshTokensById.set(refreshTokenId, updated);
          refreshTokensByHash.set(refreshToken.tokenHash, updated);
        }
      },
      revokeSession: async (sessionId) => {
        for (const [hash, session] of sessionsByAccessHash) {
          if (session.sessionId === sessionId) {
            sessionsByAccessHash.delete(hash);
          }
        }
      },
      touchSession: async () => undefined,
    },
    staff: {
      list: async () =>
        [...staffById.values()].sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
      getByUserId: async (userId) => staffByUserId.get(userId),
      getById: async (staffId) => staffById.get(staffId),
      upsertStaffProfile: async (input) => {
        const customer = await upsertCustomerFromMaps(
          usersById,
          usersByPhone,
          input.phone,
        );
        const existing = staffByUserId.get(customer.id);
        const staff: StaffProfile = {
          id: existing?.id ?? brand(randomUUID()),
          userId: customer.id,
          displayName: input.displayName,
          roles: input.roles,
          isActive: true,
        };
        staffById.set(staff.id, staff);
        staffByUserId.set(customer.id, staff);
        return staff;
      },
      deactivateStaffProfile: async (staffId) => {
        const staff = staffById.get(staffId);
        if (staff) {
          const updated = { ...staff, isActive: false };
          staffById.set(staffId, updated);
          staffByUserId.set(staff.userId, updated);
        }
      },
    },
    catalog: {
      listCategories: async () =>
        [...categories.values()]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .filter((category) => category.isActive),
      listProducts: async () =>
        [...products.values()]
          .filter((product) => product.isActive)
          .sort((left, right) => left.name.localeCompare(right.name)),
      listAllCategories: async () =>
        [...categories.values()].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      listProductsForOperations: async () =>
        [...products.values()]
          .map((product) => getProductForSale(product.id))
          .filter((product): product is ProductForSale => Boolean(product))
          .sort((left, right) =>
            left.product.name.localeCompare(right.product.name),
          ),
      getProductForSale: async (productId) => getProductForSale(productId),
      createCategory: async (input) => {
        const category: Category = {
          id: brand(randomUUID()),
          name: input.name,
          slug: input.slug,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        };
        categories.set(category.id, category);
        return category;
      },
      updateCategory: async (categoryId, input) => {
        const category = categories.get(categoryId);
        if (!category) {
          throw new Error("Category not found.");
        }
        const updated: Category = {
          ...category,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
          ...(input.sortOrder === undefined
            ? {}
            : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        };
        categories.set(categoryId, updated);
        return updated;
      },
      deleteCategory: async (categoryId) => {
        const category = categories.get(categoryId);
        if (!category) {
          return { kind: "not_found" };
        }
        if (
          [...products.values()].some(
            (product) => product.categoryId === categoryId,
          )
        ) {
          return { kind: "has_products" };
        }

        categories.delete(categoryId);
        return { kind: "deleted", category };
      },
      createProduct: async (input) => {
        const productRecord: Product = {
          id: brand(randomUUID()),
          categoryId: input.categoryId,
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          unit: input.unit,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
          isActive: input.isActive,
        };
        products.set(productRecord.id, productRecord);
        availability.set(productRecord.id, {
          productId: productRecord.id,
          isAvailable: input.isAvailable,
          ...(input.availabilityNote ? { note: input.availabilityNote } : {}),
          updatedAt: new Date().toISOString(),
        });
        setCurrentPrice(prices, priceHistory, {
          productId: productRecord.id,
          customerPrice: input.customerPrice,
          ...(input.internalCost ? { internalCost: input.internalCost } : {}),
          effectiveFrom: new Date().toISOString(),
        });
        const productForSale = getProductForSale(productRecord.id);
        if (!productForSale) {
          throw new Error("Product not created.");
        }
        return productForSale;
      },
      updateProduct: async (productId, input) => {
        const productRecord = products.get(productId);
        if (!productRecord) {
          throw new Error("Product not found.");
        }
        const updated: Product = {
          ...productRecord,
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
        };
        products.set(productId, updated);
        const productForSale = getProductForSale(productId);
        if (!productForSale) {
          throw new Error("Product not found.");
        }
        return productForSale;
      },
      deleteProduct: async (productId) => {
        const product = products.get(productId);
        if (!product) {
          return { kind: "not_found" };
        }
        if (
          [...orders.values()].some((order) =>
            order.items.some((item) => item.productId === productId),
          )
        ) {
          return { kind: "has_order_history" };
        }

        products.delete(productId);
        prices.delete(productId);
        priceHistory.delete(productId);
        availability.delete(productId);
        for (const cart of cartsByUser.values()) {
          cart.items.delete(productId);
        }
        return { kind: "deleted", product };
      },
      updateProductAvailability: async (productId, input) => {
        const productRecord = products.get(productId);
        if (!productRecord) {
          throw new Error("Product not found.");
        }
        const next: ProductAvailability = {
          productId,
          isAvailable: input.isAvailable,
          ...(input.note ? { note: input.note } : {}),
          updatedAt: new Date().toISOString(),
        };
        availability.set(productId, next);
        return next;
      },
      setProductPrice: async (productId, input) => {
        const productRecord = products.get(productId);
        if (!productRecord) {
          throw new Error("Product not found.");
        }
        const next: PriceState = {
          productId,
          customerPrice: input.customerPrice,
          ...(input.internalCost ? { internalCost: input.internalCost } : {}),
          effectiveFrom: input.effectiveFrom ?? new Date().toISOString(),
        };
        setCurrentPrice(prices, priceHistory, next);
        return next;
      },
      listProductPriceHistory: async (productId) =>
        [...(priceHistory.get(productId) ?? [])].sort(
          (left, right) =>
            Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom),
        ),
    },
    cart: {
      get: async (userId) => toCartSnapshot(getOrCreateCart(userId)),
      addItem: async (userId, productId, quantity) => {
        const cart = getOrCreateCart(userId);
        cart.items.set(productId, quantity);
        return toCartSnapshot(cart);
      },
      removeItem: async (userId, productId) => {
        const cart = getOrCreateCart(userId);
        cart.items.delete(productId);
        return toCartSnapshot(cart);
      },
      clear: async (userId) => {
        cartsByUser.delete(userId);
      },
    },
    orders: {
      createCheckoutOrder: async (input) => {
        const order: Order = {
          id: input.orderId,
          customerId: input.customerId,
          addressId: input.address.id,
          status: input.status,
          items: input.items.map((item) => ({
            ...item,
            status: "pending",
          })),
          goodsTotal: input.goodsTotal,
          deliveryFee: input.deliveryFee,
          finalTotal: input.finalTotal,
          paymentId: brand(input.paymentId),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const payment = optionalPaymentUrls(
          {
            id: brand(input.paymentId),
            orderId: input.orderId,
            provider: input.payment.provider,
            status: input.payment.status,
            authorizedAmount: input.payment.authorizedAmount,
            ...(input.payment.providerPaymentId
              ? { providerPaymentId: input.payment.providerPaymentId }
              : {}),
          },
          input.payment.redirectUrl,
          input.payment.deeplinkUrl,
        );

        orders.set(order.id, order);
        paymentsById.set(payment.id, payment);
        paymentIdByOrderId.set(order.id, payment.id);
        return { order, payment };
      },
      get: async (orderId) => orders.get(orderId),
      listByCustomer: async (userId) =>
        [...orders.values()].filter((order) => order.customerId === userId),
      list: async (status) =>
        [...orders.values()].filter(
          (order) => !status || order.status === status,
        ),
      setStatus: async (orderId, status) => {
        const order = requireOrder(orders, orderId);
        const updated: Order = {
          ...order,
          status,
          updatedAt: new Date().toISOString(),
        };
        orders.set(orderId, updated);
        return updated;
      },
      updateItemStatus: async (input) => {
        const order = requireOrder(orders, input.orderId);
        const items = order.items.map((item): OrderItem => {
          if (item.id !== input.itemId) {
            return item;
          }

          if (input.status === "cancelled") {
            return {
              ...item,
              status: "cancelled",
              ...(input.cancellationReason
                ? { cancellationReason: input.cancellationReason }
                : {}),
            };
          }

          return {
            ...item,
            status: input.status,
            ...(input.pickedQuantity === undefined
              ? {}
              : { pickedQuantity: input.pickedQuantity }),
          };
        });
        const updated: Order = {
          ...order,
          items,
          goodsTotal: calculateGoodsTotal(items),
          finalTotal: calculateFinalTotal(items, order.deliveryFee),
          updatedAt: new Date().toISOString(),
        };
        orders.set(order.id, updated);
        return updated;
      },
      updateTotals: async (orderId, goodsTotal, finalTotal) => {
        const order = requireOrder(orders, orderId);
        const updated = {
          ...order,
          goodsTotal,
          finalTotal,
          updatedAt: new Date().toISOString(),
        };
        orders.set(orderId, updated);
        return updated;
      },
    },
    payments: {
      list: async () =>
        [...paymentsById.values()].sort((left, right) =>
          left.orderId.localeCompare(right.orderId),
        ),
      getById: async (paymentId) => paymentsById.get(paymentId),
      getByOrderId: async (orderId) => {
        const paymentId = paymentIdByOrderId.get(orderId);
        return paymentId ? paymentsById.get(paymentId) : undefined;
      },
      listRefunds: async () => [...refunds.values()],
      updateAfterCapture: async (paymentId, status, capturedAmount) => {
        const payment = requirePayment(paymentsById, paymentId);
        const updated = { ...payment, status, capturedAmount };
        paymentsById.set(paymentId, updated);
        return updated;
      },
      updateStatus: async (paymentId, status) => {
        const payment = requirePayment(paymentsById, paymentId);
        const updated = { ...payment, status };
        paymentsById.set(paymentId, updated);
        return updated;
      },
      createRefund: async (input) => {
        const refund: Refund = {
          id: brand(input.id),
          paymentId: brand(input.paymentId),
          amount: input.amount,
          reason: input.reason,
          status: input.status,
        };
        refunds.set(refund.id, refund);
        return refund;
      },
    },
    picking: {
      listAssignedTasks: async (pickerId) =>
        [...pickingTasks.values()].filter(
          (task) => !pickerId || task.pickerId === pickerId,
        ),
      createTask: async (orderId, pickerId) => {
        const task: PickingTask = {
          id: brand(randomUUID()),
          orderId,
          pickerId,
          status: "assigned",
          assignedAt: new Date().toISOString(),
        };
        pickingTasks.set(task.id, task);
        return task;
      },
      updateStatus: async (taskId, status) => {
        const task = pickingTasks.get(taskId);
        if (!task) {
          throw new Error("Picking task not found.");
        }
        const updated: PickingTask = {
          ...task,
          status,
          ...(status === "completed"
            ? { completedAt: new Date().toISOString() }
            : {}),
        };
        pickingTasks.set(taskId, updated);
        return updated;
      },
      getByOrderId: async (orderId) =>
        [...pickingTasks.values()].find((task) => task.orderId === orderId),
    },
    delivery: {
      listAssignedTasks: async (courierId) =>
        [...deliveryTasks.values()].filter(
          (task) => !courierId || task.courierId === courierId,
        ),
      createTask: async (orderId, courierId) => {
        const task: DeliveryTask = {
          id: brand(randomUUID()),
          orderId,
          courierId,
          status: "assigned",
          assignedAt: new Date().toISOString(),
        };
        deliveryTasks.set(task.id, task);
        return task;
      },
      updateStatus: async (orderId, status) => {
        const task = [...deliveryTasks.values()].find(
          (candidate) => candidate.orderId === orderId,
        );
        if (!task) {
          throw new Error("Delivery task not found.");
        }
        const updated: DeliveryTask = {
          ...task,
          status,
          ...(status === "delivered"
            ? { deliveredAt: new Date().toISOString() }
            : {}),
        };
        deliveryTasks.set(task.id, updated);
        return updated;
      },
    },
    audit: {
      record: async (input) => {
        auditLog.push({
          id: randomUUID(),
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          createdAt: new Date().toISOString(),
        });
      },
      list: async (limit = 100) => auditLog.slice(-limit).reverse(),
    },
    pushSubscriptions: {
      upsert: async (input) => {
        const existing = pushSubscriptions.get(input.token);
        const now = new Date().toISOString();
        const subscription: PushSubscriptionRecord = {
          ...input,
          enabled: true,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        pushSubscriptions.set(input.token, subscription);
        return subscription;
      },
    },
    metrics: {
      getMvpMetrics: async () => {
        const orderValues = [...orders.values()];
        const orderCount = orderValues.length;
        const finalTotal = sumMoney(
          orderValues.map((order) => order.finalTotal),
        );
        const deliveryFeeRevenue = sumMoney(
          orderValues.map((order) => order.deliveryFee),
        );
        const refundAmount = sumMoney(
          [...refunds.values()].map((refund) => refund.amount),
        );
        const completedPickingTasks = [...pickingTasks.values()].filter(
          (task) => task.status === "completed",
        ).length;
        const pickingCost: Money = {
          amountMinor: completedPickingTasks * 30000,
          currency: "KZT",
        };
        const grossProfit = {
          amountMinor:
            finalTotal.amountMinor -
            refundAmount.amountMinor -
            pickingCost.amountMinor,
          currency: "KZT" as const,
        };

        return {
          orderCount,
          averageCheck: divideMoney(finalTotal, orderCount),
          deliveryFeeRevenue,
          pickingCost,
          refundAmount,
          grossProfitPerOrder: divideMoney(grossProfit, orderCount),
        };
      },
    },
  };
};

const upsertCustomerFromMaps = async (
  usersById: Map<string, Customer>,
  usersByPhone: Map<string, Customer>,
  phone: PhoneNumber,
): Promise<Customer> => {
  const existing = usersByPhone.get(phone.e164);
  if (existing) {
    return existing;
  }

  const customer: Customer = {
    id: brand(randomUUID()),
    phone,
    createdAt: new Date().toISOString(),
  };
  usersById.set(customer.id, customer);
  usersByPhone.set(phone.e164, customer);
  return customer;
};

const optionalFullName = (customer: Customer, fullName: string | undefined) =>
  fullName ? { ...customer, fullName } : customer;

const optionalPaymentUrls = (
  payment: Payment,
  redirectUrl: string | undefined,
  deeplinkUrl: string | undefined,
): Payment => ({
  ...payment,
  ...(redirectUrl ? { redirectUrl } : {}),
  ...(deeplinkUrl ? { deeplinkUrl } : {}),
});

const requireOrder = (orders: Map<string, Order>, orderId: OrderId): Order => {
  const order = orders.get(orderId);
  if (!order) {
    throw new Error("Order not found.");
  }
  return order;
};

const requirePayment = (
  paymentsById: Map<string, Payment>,
  paymentId: string,
): Payment => {
  const payment = paymentsById.get(paymentId);
  if (!payment) {
    throw new Error("Payment not found.");
  }
  return payment;
};

const sumMoney = (values: readonly Money[]): Money => ({
  amountMinor: values.reduce((sum, value) => sum + value.amountMinor, 0),
  currency: "KZT",
});

const divideMoney = (value: Money, divisor: number): Money => ({
  amountMinor: divisor === 0 ? 0 : Math.round(value.amountMinor / divisor),
  currency: value.currency,
});

const seedCatalog = (
  categories: Map<string, Category>,
  products: Map<string, Product>,
  prices: Map<string, PriceState>,
  priceHistory: Map<string, PriceState[]>,
  availability: Map<string, ProductAvailability>,
): void => {
  const produceId = brand<string, "CategoryId">(
    "11111111-1111-4111-8111-111111111111",
  );
  const dairyId = brand<string, "CategoryId">(
    "22222222-2222-4222-8222-222222222222",
  );
  const bakeryId = brand<string, "CategoryId">(
    "33333333-3333-4333-8333-333333333333",
  );
  const seededCategories: readonly Category[] = [
    {
      id: produceId,
      name: "Produce",
      slug: "produce",
      sortOrder: 10,
      isActive: true,
    },
    {
      id: dairyId,
      name: "Dairy",
      slug: "dairy",
      sortOrder: 20,
      isActive: true,
    },
    {
      id: bakeryId,
      name: "Bakery",
      slug: "bakery",
      sortOrder: 30,
      isActive: true,
    },
  ];
  const seededProducts: readonly Product[] = [
    product(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      produceId,
      "Almaty tomatoes",
      "kg",
    ),
    product(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      produceId,
      "Golden apples",
      "kg",
    ),
    product(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      dairyId,
      "Farm milk",
      "piece",
    ),
    product(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      bakeryId,
      "Tandir bread",
      "piece",
    ),
  ];
  const seededPrices: readonly PriceState[] = [
    price("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", 85000, 65000),
    price("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", 72000, 52000),
    price("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", 59000, 43000),
    price("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", 25000, 15000),
  ];

  for (const category of seededCategories) {
    categories.set(category.id, category);
  }

  for (const seededProduct of seededProducts) {
    products.set(seededProduct.id, seededProduct);
    availability.set(seededProduct.id, {
      productId: seededProduct.id,
      isAvailable: true,
      updatedAt: new Date().toISOString(),
    });
  }

  for (const seededPrice of seededPrices) {
    setCurrentPrice(prices, priceHistory, seededPrice);
  }
};

const setCurrentPrice = (
  prices: Map<string, PriceState>,
  priceHistory: Map<string, PriceState[]>,
  priceState: PriceState,
): void => {
  prices.set(priceState.productId, priceState);
  priceHistory.set(priceState.productId, [
    ...(priceHistory.get(priceState.productId) ?? []),
    priceState,
  ]);
};

const product = (
  id: string,
  categoryId: CategoryId,
  name: string,
  unit: ProductUnit,
): Product => ({
  id: brand(id),
  categoryId,
  name,
  unit,
  isActive: true,
});

const price = (
  productId: string,
  customerPriceMinor: number,
  internalCostMinor: number,
): PriceState => ({
  productId: brand(productId),
  customerPrice: { amountMinor: customerPriceMinor, currency: "KZT" },
  internalCost: { amountMinor: internalCostMinor, currency: "KZT" },
  effectiveFrom: new Date().toISOString(),
});
