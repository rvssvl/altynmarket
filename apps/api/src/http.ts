import type {
  AuthSession,
  DeliveryTaskStatus,
  OrderStatus,
  PaymentStatus,
  ProductUnit,
  UserRole,
} from "@altyn-market/domain";
import { brand } from "@altyn-market/domain";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { AuthFailure } from "./auth-service.js";
import { ApiFailure, type BackendServices } from "./backend-services.js";
import type { RealtimeBus } from "./realtime.js";

export interface HttpApiServer {
  readonly api: BackendServices;
  readonly start: (port: number) => Promise<void>;
}

export const createHttpApiServer = (
  api: BackendServices,
  realtime: RealtimeBus,
): HttpApiServer => ({
  api,
  start: async (port) => {
    const server = createServer((request, response) => {
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`,
      );

      response.setHeader(
        "Access-Control-Allow-Origin",
        resolveCorsOrigin(request.headers.origin, process.env.WEB_ORIGIN),
      );
      response.setHeader("Vary", "Origin");
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization",
      );

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "altyn-market-api",
          environment: process.env.NODE_ENV ?? "development",
        });
        return;
      }

      if (url.pathname === "/api/stage-info") {
        sendJson(response, 200, {
          name: "Altyn Market API",
          status: "stage",
          modules: [
            "auth",
            "catalog",
            "cart",
            "orders",
            "picking",
            "delivery",
            "payments",
            "notifications",
            "admin",
            "metrics",
            "realtime",
          ],
        });
        return;
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/realtime" || url.pathname === "/api/realtime")
      ) {
        void handleRealtime(api, realtime, request, response, url);
        return;
      }

      void handleApiRequest(api, request, response, url);
      return;
    });

    await new Promise<void>((resolve) => {
      server.listen(port, "0.0.0.0", resolve);
    });

    console.log(`Altyn Market API listening on :${port}`);
  },
});

const resolveCorsOrigin = (
  requestOrigin: string | undefined,
  configuredOrigins: string | undefined,
): string => {
  if (!configuredOrigins) {
    return "*";
  }

  const origins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.includes("*")) {
    return "*";
  }

  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return origins[0] ?? "null";
};

const handleRealtime = async (
  api: BackendServices,
  realtime: RealtimeBus,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  try {
    await requireSession(api, request, url);
  } catch (error) {
    if (error instanceof AuthFailure) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    throw error;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(": connected\n\n");

  const unsubscribe = realtime.subscribe((event) => {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  request.on("close", unsubscribe);
};

const handleApiRequest = async (
  api: BackendServices,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  try {
    if (request.method === "POST" && url.pathname === "/api/auth/request-otp") {
      const body = await readJsonBody<{ readonly phone?: string }>(request);
      const phone = parsePhone(body.phone);
      const result = await api.auth.requestOtp(phone);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/verify-otp") {
      const body = await readJsonBody<{
        readonly phone?: string;
        readonly code?: string;
        readonly deviceName?: string;
      }>(request);
      const session = await api.auth.verifyOtp(
        parsePhone(body.phone),
        parseOtpCode(body.code),
        body.deviceName,
      );
      sendJson(response, 200, session);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/refresh") {
      const body = await readJsonBody<{ readonly refreshToken?: string }>(
        request,
      );
      const session = await api.auth.refreshSession(
        parseNonEmptyString(body.refreshToken, "refreshToken"),
      );
      sendJson(response, 200, session);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, session);
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/catalog/categories"
    ) {
      sendJson(response, 200, {
        categories: await api.catalog.listCategories(),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/products") {
      sendJson(response, 200, { products: await api.catalog.listProducts() });
      return;
    }

    const priceMatch = url.pathname.match(
      /^\/api\/catalog\/products\/(?<productId>[^/]+)\/price$/,
    );
    if (request.method === "GET" && priceMatch?.groups?.productId) {
      const price = await api.catalog.getProductPrice(
        brand(decodeURIComponent(priceMatch.groups.productId)),
      );
      sendJson(response, 200, price);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/cart") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, await api.cart.get(session));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/cart/items") {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly productId?: string;
        readonly quantity?: number;
      }>(request);
      const cart = await api.cart.addItem(
        session,
        brand(parseNonEmptyString(body.productId, "productId")),
        parsePositiveNumber(body.quantity, "quantity"),
      );
      sendJson(response, 200, cart);
      return;
    }

    const removeCartItemMatch = url.pathname.match(
      /^\/api\/cart\/items\/(?<productId>[^/]+)$/,
    );
    if (
      (request.method === "DELETE" || request.method === "POST") &&
      removeCartItemMatch?.groups?.productId
    ) {
      const session = await requireSession(api, request, url);
      const cart = await api.cart.removeItem(
        session,
        brand(decodeURIComponent(removeCartItemMatch.groups.productId)),
      );
      sendJson(response, 200, cart);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/checkout") {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{ readonly address?: unknown }>(request);
      const result = await api.checkout.create(
        session,
        parseAddressInput(body.address),
      );
      sendJson(response, 201, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/orders") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, { orders: await api.orders.listMine(session) });
      return;
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/(?<orderId>[^/]+)$/);
    if (request.method === "GET" && orderMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const order = await api.orders.get(
        session,
        brand(decodeURIComponent(orderMatch.groups.orderId)),
      );
      sendJson(response, 200, order);
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/notifications/push-token"
    ) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly token?: string;
        readonly platform?: string;
      }>(request);
      const subscription = await api.notifications.registerPushToken(session, {
        token: parsePushToken(body.token),
        platform: parsePushPlatform(body.platform),
      });
      sendJson(response, 201, {
        token: subscription.token,
        platform: subscription.platform,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/picking/tasks") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        tasks: await api.picking.listAssignedTasks(session),
      });
      return;
    }

    const startPickingMatch = url.pathname.match(
      /^\/api\/picking\/orders\/(?<orderId>[^/]+)\/start$/,
    );
    if (request.method === "POST" && startPickingMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const order = await api.picking.startPicking(
        session,
        brand(decodeURIComponent(startPickingMatch.groups.orderId)),
      );
      sendJson(response, 200, order);
      return;
    }

    const pickingItemMatch = url.pathname.match(
      /^\/api\/picking\/orders\/(?<orderId>[^/]+)\/items\/(?<itemId>[^/]+)$/,
    );
    if (
      request.method === "POST" &&
      pickingItemMatch?.groups?.orderId &&
      pickingItemMatch.groups.itemId
    ) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly status?: string;
        readonly pickedQuantity?: number;
        readonly reason?: string;
      }>(request);
      const order = await api.picking.updateItem(session, {
        orderId: brand(decodeURIComponent(pickingItemMatch.groups.orderId)),
        itemId: brand(decodeURIComponent(pickingItemMatch.groups.itemId)),
        status: parsePickingItemStatus(body.status),
        ...(body.pickedQuantity === undefined
          ? {}
          : {
              pickedQuantity: parsePositiveNumber(
                body.pickedQuantity,
                "pickedQuantity",
              ),
            }),
        ...(body.reason ? { reason: parseCancelReason(body.reason) } : {}),
      });
      sendJson(response, 200, order);
      return;
    }

    const completePickingMatch = url.pathname.match(
      /^\/api\/picking\/orders\/(?<orderId>[^/]+)\/complete$/,
    );
    if (request.method === "POST" && completePickingMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const order = await api.picking.completePicking(
        session,
        brand(decodeURIComponent(completePickingMatch.groups.orderId)),
      );
      sendJson(response, 200, order);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/delivery/tasks") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        tasks: await api.delivery.listAssignedTasks(session),
      });
      return;
    }

    const deliveryStatusMatch = url.pathname.match(
      /^\/api\/delivery\/orders\/(?<orderId>[^/]+)\/status$/,
    );
    if (request.method === "POST" && deliveryStatusMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{ readonly status?: string }>(request);
      const task = await api.delivery.updateStatus(
        session,
        brand(decodeURIComponent(deliveryStatusMatch.groups.orderId)),
        parseDeliveryStatus(body.status),
      );
      sendJson(response, 200, task);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/orders") {
      const session = await requireSession(api, request, url);
      const status = parseOptionalOrderStatus(url.searchParams.get("status"));
      sendJson(response, 200, {
        orders: await api.admin.listOrders(session, status),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/catalog") {
      const session = await requireSession(api, request, url);
      const [categories, products] = await Promise.all([
        api.admin.listCategories(session),
        api.admin.listCatalogProducts(session),
      ]);
      sendJson(response, 200, { categories, products });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/catalog/categories"
    ) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly name?: string;
        readonly slug?: string;
        readonly sortOrder?: number;
        readonly isActive?: boolean;
      }>(request);
      const category = await api.admin.createCategory(session, {
        name: parseNonEmptyString(body.name, "name"),
        slug: parseSlug(body.slug),
        sortOrder: parseInteger(body.sortOrder, "sortOrder"),
        isActive: parseBooleanDefault(body.isActive, true, "isActive"),
      });
      sendJson(response, 201, category);
      return;
    }

    const categoryMatch = url.pathname.match(
      /^\/api\/admin\/catalog\/categories\/(?<categoryId>[^/]+)$/,
    );
    if (
      (request.method === "PATCH" || request.method === "DELETE") &&
      categoryMatch?.groups?.categoryId
    ) {
      const session = await requireSession(api, request, url);
      const body =
        request.method === "DELETE"
          ? {}
          : await readJsonBody<{
              readonly name?: string;
              readonly slug?: string;
              readonly sortOrder?: number;
              readonly isActive?: boolean;
            }>(request);
      const category = await api.admin.updateCategory(
        session,
        brand(decodeURIComponent(categoryMatch.groups.categoryId)),
        request.method === "DELETE"
          ? { isActive: false }
          : {
              ...(body.name === undefined
                ? {}
                : { name: parseNonEmptyString(body.name, "name") }),
              ...(body.slug === undefined
                ? {}
                : { slug: parseSlug(body.slug) }),
              ...(body.sortOrder === undefined
                ? {}
                : { sortOrder: parseInteger(body.sortOrder, "sortOrder") }),
              ...(body.isActive === undefined
                ? {}
                : {
                    isActive: parseRequiredBoolean(body.isActive, "isActive"),
                  }),
            },
      );
      sendJson(response, 200, category);
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/catalog/products"
    ) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly categoryId?: string;
        readonly name?: string;
        readonly description?: string;
        readonly unit?: string;
        readonly imageUrl?: string;
        readonly isActive?: boolean;
        readonly customerPriceMinor?: number;
        readonly internalCostMinor?: number;
        readonly isAvailable?: boolean;
        readonly availabilityNote?: string;
      }>(request);
      const product = await api.admin.createProduct(session, {
        categoryId: brand(parseNonEmptyString(body.categoryId, "categoryId")),
        name: parseNonEmptyString(body.name, "name"),
        ...(body.description
          ? {
              description: parseNonEmptyString(body.description, "description"),
            }
          : {}),
        unit: parseProductUnit(body.unit),
        ...(body.imageUrl
          ? { imageUrl: parseNonEmptyString(body.imageUrl, "imageUrl") }
          : {}),
        isActive: parseBooleanDefault(body.isActive, true, "isActive"),
        customerPrice: parseMoneyMinor(
          body.customerPriceMinor,
          "customerPriceMinor",
        ),
        ...(body.internalCostMinor === undefined
          ? {}
          : {
              internalCost: parseMoneyMinor(
                body.internalCostMinor,
                "internalCostMinor",
              ),
            }),
        isAvailable: parseBooleanDefault(body.isAvailable, true, "isAvailable"),
        ...(body.availabilityNote
          ? {
              availabilityNote: parseNonEmptyString(
                body.availabilityNote,
                "availabilityNote",
              ),
            }
          : {}),
      });
      sendJson(response, 201, product);
      return;
    }

    const productAvailabilityMatch = url.pathname.match(
      /^\/api\/admin\/catalog\/products\/(?<productId>[^/]+)\/availability$/,
    );
    if (
      request.method === "PATCH" &&
      productAvailabilityMatch?.groups?.productId
    ) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly isAvailable?: boolean;
        readonly note?: string;
      }>(request);
      const availability = await api.admin.updateProductAvailability(
        session,
        brand(decodeURIComponent(productAvailabilityMatch.groups.productId)),
        {
          isAvailable: parseRequiredBoolean(body.isAvailable, "isAvailable"),
          ...(body.note
            ? { note: parseNonEmptyString(body.note, "note") }
            : {}),
        },
      );
      sendJson(response, 200, availability);
      return;
    }

    const productMatch = url.pathname.match(
      /^\/api\/admin\/catalog\/products\/(?<productId>[^/]+)$/,
    );
    if (
      (request.method === "PATCH" || request.method === "DELETE") &&
      productMatch?.groups?.productId
    ) {
      const session = await requireSession(api, request, url);
      const body =
        request.method === "DELETE"
          ? {}
          : await readJsonBody<{
              readonly categoryId?: string;
              readonly name?: string;
              readonly description?: string;
              readonly unit?: string;
              readonly imageUrl?: string;
              readonly isActive?: boolean;
            }>(request);
      const product = await api.admin.updateProduct(
        session,
        brand(decodeURIComponent(productMatch.groups.productId)),
        request.method === "DELETE"
          ? { isActive: false }
          : {
              ...(body.categoryId === undefined
                ? {}
                : {
                    categoryId: brand(
                      parseNonEmptyString(body.categoryId, "categoryId"),
                    ),
                  }),
              ...(body.name === undefined
                ? {}
                : { name: parseNonEmptyString(body.name, "name") }),
              ...(body.description === undefined
                ? {}
                : {
                    description: parseNonEmptyString(
                      body.description,
                      "description",
                    ),
                  }),
              ...(body.unit === undefined
                ? {}
                : { unit: parseProductUnit(body.unit) }),
              ...(body.imageUrl === undefined
                ? {}
                : {
                    imageUrl: parseNonEmptyString(body.imageUrl, "imageUrl"),
                  }),
              ...(body.isActive === undefined
                ? {}
                : {
                    isActive: parseRequiredBoolean(body.isActive, "isActive"),
                  }),
            },
      );
      sendJson(response, 200, product);
      return;
    }

    const priceHistoryMatch = url.pathname.match(
      /^\/api\/admin\/pricing\/products\/(?<productId>[^/]+)\/history$/,
    );
    if (request.method === "GET" && priceHistoryMatch?.groups?.productId) {
      const session = await requireSession(api, request, url);
      const history = await api.admin.listProductPriceHistory(
        session,
        brand(decodeURIComponent(priceHistoryMatch.groups.productId)),
      );
      sendJson(response, 200, { history });
      return;
    }

    const priceUpdateMatch = url.pathname.match(
      /^\/api\/admin\/pricing\/products\/(?<productId>[^/]+)$/,
    );
    if (request.method === "POST" && priceUpdateMatch?.groups?.productId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly customerPriceMinor?: number;
        readonly internalCostMinor?: number;
        readonly effectiveFrom?: string;
      }>(request);
      const price = await api.admin.updateProductPrice(
        session,
        brand(decodeURIComponent(priceUpdateMatch.groups.productId)),
        {
          customerPrice: parseMoneyMinor(
            body.customerPriceMinor,
            "customerPriceMinor",
          ),
          ...(body.internalCostMinor === undefined
            ? {}
            : {
                internalCost: parseMoneyMinor(
                  body.internalCostMinor,
                  "internalCostMinor",
                ),
              }),
          ...(body.effectiveFrom
            ? {
                effectiveFrom: parseNonEmptyString(
                  body.effectiveFrom,
                  "effectiveFrom",
                ),
              }
            : {}),
        },
      );
      sendJson(response, 201, price);
      return;
    }

    const assignPickerMatch = url.pathname.match(
      /^\/api\/admin\/orders\/(?<orderId>[^/]+)\/assign-picker$/,
    );
    if (request.method === "POST" && assignPickerMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{ readonly pickerId?: string }>(request);
      const task = await api.admin.assignPicker(
        session,
        brand(decodeURIComponent(assignPickerMatch.groups.orderId)),
        brand(parseNonEmptyString(body.pickerId, "pickerId")),
      );
      sendJson(response, 200, task);
      return;
    }

    const assignCourierMatch = url.pathname.match(
      /^\/api\/admin\/orders\/(?<orderId>[^/]+)\/assign-courier$/,
    );
    if (request.method === "POST" && assignCourierMatch?.groups?.orderId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{ readonly courierId?: string }>(request);
      const task = await api.admin.assignCourier(
        session,
        brand(decodeURIComponent(assignCourierMatch.groups.orderId)),
        brand(parseNonEmptyString(body.courierId, "courierId")),
      );
      sendJson(response, 200, task);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/metrics") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, await api.admin.getMetrics(session));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/staff") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        staff: await api.admin.listStaffProfiles(session),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/staff") {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly phone?: string;
        readonly displayName?: string;
        readonly roles?: readonly string[];
      }>(request);
      const staff = await api.admin.createStaffProfile(session, {
        phone: parsePhone(body.phone),
        displayName: parseNonEmptyString(body.displayName, "displayName"),
        roles: parseStaffRoles(body.roles),
      });
      sendJson(response, 201, staff);
      return;
    }

    const deactivateStaffMatch = url.pathname.match(
      /^\/api\/admin\/staff\/(?<staffId>[^/]+)\/deactivate$/,
    );
    if (request.method === "POST" && deactivateStaffMatch?.groups?.staffId) {
      const session = await requireSession(api, request, url);
      await api.admin.deactivateStaffProfile(
        session,
        brand(decodeURIComponent(deactivateStaffMatch.groups.staffId)),
      );
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/payments") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        payments: await api.admin.listPayments(session),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/refunds") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        refunds: await api.admin.listRefunds(session),
      });
      return;
    }

    const refundPaymentMatch = url.pathname.match(
      /^\/api\/admin\/payments\/(?<paymentId>[^/]+)\/refunds$/,
    );
    if (request.method === "POST" && refundPaymentMatch?.groups?.paymentId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{
        readonly amountMinor?: number;
        readonly reason?: string;
      }>(request);
      const refund = await api.admin.refundPayment(session, {
        paymentId: brand(
          decodeURIComponent(refundPaymentMatch.groups.paymentId),
        ),
        amount: parseMoneyMinor(body.amountMinor, "amountMinor"),
        reason: parseNonEmptyString(body.reason, "reason"),
      });
      sendJson(response, 201, refund);
      return;
    }

    const paymentStatusMatch = url.pathname.match(
      /^\/api\/admin\/payments\/(?<paymentId>[^/]+)\/status$/,
    );
    if (request.method === "PATCH" && paymentStatusMatch?.groups?.paymentId) {
      const session = await requireSession(api, request, url);
      const body = await readJsonBody<{ readonly status?: string }>(request);
      const payment = await api.admin.updatePaymentStatus(session, {
        paymentId: brand(
          decodeURIComponent(paymentStatusMatch.groups.paymentId),
        ),
        status: parsePaymentStatus(body.status),
      });
      sendJson(response, 200, payment);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/audit-log") {
      const session = await requireSession(api, request, url);
      sendJson(response, 200, {
        entries: await api.admin.listAuditLog(
          session,
          parseLimit(url.searchParams.get("limit")),
        ),
      });
      return;
    }

    await handleCompatibilityMockRoutes(api, request, response, url);
  } catch (error) {
    if (error instanceof BadRequest || error instanceof ApiFailure) {
      sendJson(response, error.status ?? 400, { error: error.message });
      return;
    }

    if (error instanceof AuthFailure) {
      sendJson(response, error.status, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
};

const handleCompatibilityMockRoutes = async (
  api: BackendServices,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  if (request.method === "GET" && url.pathname === "/api/mock/orders") {
    const session = await requireSession(api, request, url);
    const orders = await api.orders.listMine(session);
    sendJson(response, 200, { orders });
    return;
  }

  const startPickingMatch = url.pathname.match(
    /^\/api\/mock\/orders\/(?<orderId>[^/]+)\/start-picking$/,
  );
  if (request.method === "POST" && startPickingMatch?.groups?.orderId) {
    const session = await requireSession(api, request, url);
    const order = await api.picking.startPicking(
      session,
      brand(decodeURIComponent(startPickingMatch.groups.orderId)),
    );
    sendJson(response, 200, order);
    return;
  }

  const completePickingMatch = url.pathname.match(
    /^\/api\/mock\/orders\/(?<orderId>[^/]+)\/complete-picking$/,
  );
  if (request.method === "POST" && completePickingMatch?.groups?.orderId) {
    const session = await requireSession(api, request, url);
    const order = await api.picking.completePicking(
      session,
      brand(decodeURIComponent(completePickingMatch.groups.orderId)),
    );
    sendJson(response, 200, order);
    return;
  }

  const itemStatusMatch = url.pathname.match(
    /^\/api\/mock\/orders\/(?<orderId>[^/]+)\/items\/(?<itemId>[^/]+)\/status$/,
  );
  if (
    request.method === "POST" &&
    itemStatusMatch?.groups?.orderId &&
    itemStatusMatch.groups.itemId
  ) {
    const session = await requireSession(api, request, url);
    const body = await readJsonBody<{ readonly status?: string }>(request);
    const status = body.status === "cancelled" ? "cancelled" : "picked";
    const order = await api.picking.updateItem(session, {
      orderId: brand(decodeURIComponent(itemStatusMatch.groups.orderId)),
      itemId: brand(decodeURIComponent(itemStatusMatch.groups.itemId)),
      status,
      ...(status === "cancelled" ? { reason: "unavailable" } : {}),
    });
    sendJson(response, 200, order);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
};

class BadRequest extends Error {
  readonly status = 400;
}

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> =>
  new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65_536) {
        reject(new BadRequest("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch {
        reject(new BadRequest("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });

const requireSession = async (
  api: BackendServices,
  request: IncomingMessage,
  url: URL,
): Promise<AuthSession> => {
  const token =
    parseOptionalBearerToken(request.headers.authorization) ??
    url.searchParams.get("access_token") ??
    undefined;

  if (!token) {
    throw new AuthFailure("Missing bearer token.");
  }

  return api.auth.getCurrentSession(token);
};

const parsePhone = (value: string | undefined) => {
  const phone = value?.trim().replace(/\s+/g, "");

  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new BadRequest(
      "Phone must be in E.164 format, for example +77012345678.",
    );
  }

  return { e164: phone };
};

const parseOtpCode = (value: string | undefined): string => {
  const code = value?.trim();

  if (!code || !/^\d{6}$/.test(code)) {
    throw new BadRequest("OTP code must be 6 digits.");
  }

  return code;
};

const parseNonEmptyString = (
  value: string | undefined,
  fieldName: string,
): string => {
  const parsed = value?.trim();

  if (!parsed) {
    throw new BadRequest(`${fieldName} is required.`);
  }

  return parsed;
};

const parsePositiveNumber = (
  value: number | undefined,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BadRequest(`${fieldName} must be a positive number.`);
  }

  return value;
};

const parseInteger = (value: number | undefined, fieldName: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BadRequest(`${fieldName} must be an integer.`);
  }

  return value;
};

const parseSlug = (value: string | undefined): string => {
  const slug = value?.trim();

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new BadRequest(
      "slug must use lowercase letters, numbers, and hyphens.",
    );
  }

  return slug;
};

const parseRequiredBoolean = (
  value: boolean | undefined,
  fieldName: string,
): boolean => {
  if (typeof value !== "boolean") {
    throw new BadRequest(`${fieldName} must be a boolean.`);
  }

  return value;
};

const parseBooleanDefault = (
  value: boolean | undefined,
  defaultValue: boolean,
  fieldName: string,
): boolean =>
  value === undefined ? defaultValue : parseRequiredBoolean(value, fieldName);

const parseMoneyMinor = (value: number | undefined, fieldName: string) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequest(`${fieldName} must be a non-negative minor amount.`);
  }

  return { amountMinor: value, currency: "KZT" as const };
};

const parseProductUnit = (value: string | undefined): ProductUnit => {
  if (
    value === "kg" ||
    value === "g" ||
    value === "piece" ||
    value === "bundle" ||
    value === "box"
  ) {
    return value;
  }

  throw new BadRequest("unit must be kg, g, piece, bundle, or box.");
};

const parseAddressInput = (value: unknown) => {
  if (!value || typeof value !== "object") {
    throw new BadRequest("address is required.");
  }

  const address = value as {
    readonly label?: string;
    readonly city?: string;
    readonly street?: string;
    readonly apartment?: string;
    readonly entrance?: string;
    readonly floor?: string;
    readonly comment?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };

  return {
    ...(address.label ? { label: address.label } : {}),
    city: parseNonEmptyString(address.city, "address.city"),
    street: parseNonEmptyString(address.street, "address.street"),
    ...(address.apartment ? { apartment: address.apartment } : {}),
    ...(address.entrance ? { entrance: address.entrance } : {}),
    ...(address.floor ? { floor: address.floor } : {}),
    ...(address.comment ? { comment: address.comment } : {}),
    ...(address.latitude === undefined ? {} : { latitude: address.latitude }),
    ...(address.longitude === undefined
      ? {}
      : { longitude: address.longitude }),
  };
};

const parsePushToken = (value: string | undefined): string => {
  const token = value?.trim();

  if (!token || token.length < 10 || token.length > 4096) {
    throw new BadRequest("token must be a valid push token.");
  }

  return token;
};

const parsePushPlatform = (
  value: string | undefined,
): "ios" | "android" | "web" | "unknown" => {
  if (
    value === "ios" ||
    value === "android" ||
    value === "web" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
};

const parsePickingItemStatus = (
  value: string | undefined,
): "picked" | "cancelled" => {
  if (value === "picked" || value === "cancelled") {
    return value;
  }

  throw new BadRequest("status must be picked or cancelled.");
};

const parseCancelReason = (value: string): "unavailable" | "bad_quality" => {
  if (value === "unavailable" || value === "bad_quality") {
    return value;
  }

  throw new BadRequest("reason must be unavailable or bad_quality.");
};

const parseDeliveryStatus = (value: string | undefined): DeliveryTaskStatus => {
  if (
    value === "assigned" ||
    value === "pickup_started" ||
    value === "picked_up" ||
    value === "delivering" ||
    value === "delivered" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new BadRequest("Invalid delivery status.");
};

const parseOptionalOrderStatus = (
  value: string | null,
): OrderStatus | undefined => {
  if (!value) {
    return undefined;
  }

  if (
    value === "draft" ||
    value === "payment_authorized" ||
    value === "awaiting_picking" ||
    value === "picking" ||
    value === "picked" ||
    value === "payment_captured" ||
    value === "awaiting_courier" ||
    value === "delivering" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "payment_failed" ||
    value === "refund_required" ||
    value === "refunded"
  ) {
    return value;
  }

  throw new BadRequest("Invalid order status.");
};

const parsePaymentStatus = (value: string | undefined): PaymentStatus => {
  if (
    value === "authorization_pending" ||
    value === "authorized" ||
    value === "authorization_cancelled" ||
    value === "capture_pending" ||
    value === "captured" ||
    value === "capture_failed" ||
    value === "refund_pending" ||
    value === "refunded" ||
    value === "failed"
  ) {
    return value;
  }

  throw new BadRequest("Invalid payment status.");
};

const parseStaffRoles = (
  value: readonly string[] | undefined,
): readonly Exclude<UserRole, "customer">[] => {
  if (!value || value.length === 0) {
    throw new BadRequest("roles must include at least one staff role.");
  }

  return value.map((role) => {
    if (
      role === "picker" ||
      role === "courier" ||
      role === "admin" ||
      role === "super_admin"
    ) {
      return role;
    }

    throw new BadRequest(
      "roles must be picker, courier, admin, or super_admin.",
    );
  });
};

const parseOptionalBearerToken = (
  authorization: string | undefined,
): string | undefined =>
  authorization?.match(/^Bearer (?<token>.+)$/i)?.groups?.token;

const parseLimit = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new BadRequest("limit must be an integer between 1 and 500.");
  }

  return parsed;
};

const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};
