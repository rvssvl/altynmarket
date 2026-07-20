import {
  AltynMarketRpcs,
  brand,
  PaymentNotFound,
  RefundNotAllowed,
  type CreateProductInput,
  type DeliveryAddressInput,
  type UpdateCategoryInput,
  type UpdatePickingItemInput,
  type UpdateProductAvailabilityInput,
  type UpdateProductInput,
  type UpdateProductPriceInput,
  RpcAuthentication,
  RpcBackendFailure,
  RpcSession,
  RpcUnauthorized,
} from "@altyn-market/domain";
import { Effect, Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import { AuthFailure } from "./auth-service.js";
import { ApiFailure } from "./backend-failures.js";
import {
  AdministrationApplication,
  AuthenticationApplication,
  CatalogApplication,
  CustomerShoppingApplication,
  makeApplicationLayer,
  StaffOperationsApplication,
  type ApplicationLayerOptions,
  type BackendDependencies,
} from "./application-services.js";

const toBackendFailure = (cause: unknown): RpcBackendFailure => {
  if (cause instanceof AuthFailure) {
    return new RpcBackendFailure({
      code: `AUTH_${cause.status}`,
      message: cause.message,
    });
  }

  if (cause instanceof ApiFailure) {
    return new RpcBackendFailure({
      code: `API_${cause.status}`,
      message: cause.message,
    });
  }

  return new RpcBackendFailure({
    code: "INTERNAL",
    message: "The service could not complete the request.",
  });
};

const toPaymentCommandFailure = (
  cause: unknown,
): RpcBackendFailure | PaymentNotFound | RefundNotAllowed =>
  cause instanceof PaymentNotFound || cause instanceof RefundNotAllowed
    ? cause
    : toBackendFailure(cause);

const toPaymentLookupFailure = (
  cause: unknown,
): RpcBackendFailure | PaymentNotFound =>
  cause instanceof PaymentNotFound ? cause : toBackendFailure(cause);

const toUnauthorized = (cause: unknown): RpcUnauthorized =>
  new RpcUnauthorized({
    message:
      cause instanceof AuthFailure
        ? cause.message
        : "A valid session is required.",
  });

const readBearerToken = (
  authorization: string | undefined,
): string | undefined => {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
};

const toDeliveryAddressInput = (input: {
  readonly label?: string | undefined;
  readonly city: string;
  readonly street: string;
  readonly apartment?: string | undefined;
  readonly entrance?: string | undefined;
  readonly floor?: string | undefined;
  readonly comment?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
}): DeliveryAddressInput => ({
  city: input.city,
  street: input.street,
  ...(input.label === undefined ? {} : { label: input.label }),
  ...(input.apartment === undefined ? {} : { apartment: input.apartment }),
  ...(input.entrance === undefined ? {} : { entrance: input.entrance }),
  ...(input.floor === undefined ? {} : { floor: input.floor }),
  ...(input.comment === undefined ? {} : { comment: input.comment }),
  ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
  ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
});

const toUpdatePickingItemInput = (input: {
  readonly orderId: string;
  readonly itemId: string;
  readonly status: "picked" | "cancelled";
  readonly pickedQuantity?: number | undefined;
  readonly reason?: "unavailable" | "bad_quality" | undefined;
}): UpdatePickingItemInput => ({
  orderId: brand<string, "OrderId">(input.orderId),
  itemId: brand<string, "OrderItemId">(input.itemId),
  status: input.status,
  ...(input.pickedQuantity === undefined
    ? {}
    : { pickedQuantity: input.pickedQuantity }),
  ...(input.reason === undefined ? {} : { reason: input.reason }),
});

const toUpdateCategoryInput = (input: {
  readonly name?: string | undefined;
  readonly slug?: string | undefined;
  readonly sortOrder?: number | undefined;
  readonly isActive?: boolean | undefined;
}): UpdateCategoryInput => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.slug === undefined ? {} : { slug: input.slug }),
  ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
});

const toCreateProductInput = (input: {
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly unit: CreateProductInput["unit"];
  readonly imageUrl?: string | undefined;
  readonly isActive: boolean;
  readonly customerPrice: CreateProductInput["customerPrice"];
  readonly internalCost?: CreateProductInput["customerPrice"] | undefined;
  readonly isAvailable: boolean;
  readonly availabilityNote?: string | undefined;
}): CreateProductInput => ({
  categoryId: brand<string, "CategoryId">(input.categoryId),
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
});

const toUpdateProductInput = (input: {
  readonly categoryId?: string | undefined;
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly unit?: UpdateProductInput["unit"] | undefined;
  readonly imageUrl?: string | undefined;
  readonly isActive?: boolean | undefined;
}): UpdateProductInput => ({
  ...(input.categoryId === undefined
    ? {}
    : { categoryId: brand<string, "CategoryId">(input.categoryId) }),
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.description === undefined
    ? {}
    : { description: input.description }),
  ...(input.unit === undefined ? {} : { unit: input.unit }),
  ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
  ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
});

const toUpdateProductAvailabilityInput = (input: {
  readonly isAvailable: boolean;
  readonly note?: string | undefined;
}): UpdateProductAvailabilityInput => ({
  isAvailable: input.isAvailable,
  ...(input.note === undefined ? {} : { note: input.note }),
});

const toUpdateProductPriceInput = (input: {
  readonly customerPrice: UpdateProductPriceInput["customerPrice"];
  readonly internalCost?: UpdateProductPriceInput["customerPrice"] | undefined;
  readonly effectiveFrom?: string | undefined;
}): UpdateProductPriceInput => ({
  customerPrice: input.customerPrice,
  ...(input.internalCost === undefined
    ? {}
    : { internalCost: input.internalCost }),
  ...(input.effectiveFrom === undefined
    ? {}
    : { effectiveFrom: input.effectiveFrom }),
});

export const createEffectRpcHandler = (
  dependencies: BackendDependencies,
  options: ApplicationLayerOptions = {},
) => {
  const applicationLayer = makeApplicationLayer(dependencies, options);
  const handlers = AltynMarketRpcs.toLayer(
    Effect.succeed(
      AltynMarketRpcs.of({
        Health: () =>
          Effect.succeed({
            ok: true,
            service: "altyn-market-api",
            environment: process.env.NODE_ENV ?? "development",
          }),
        ListCategories: () =>
          Effect.gen(function* () {
            const catalog = yield* CatalogApplication;
            return yield* catalog
              .listCategories()
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListCatalog: () =>
          Effect.gen(function* () {
            const catalog = yield* CatalogApplication;
            return yield* catalog
              .listCatalog()
              .pipe(Effect.mapError(toBackendFailure));
          }),
        RequestOtp: ({ phone }) =>
          Effect.gen(function* () {
            const authentication = yield* AuthenticationApplication;
            return yield* authentication
              .requestOtp(phone)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        VerifyOtp: ({ phone, code, deviceName }) =>
          Effect.gen(function* () {
            const authentication = yield* AuthenticationApplication;
            return yield* authentication
              .verifyOtp(phone, code, deviceName)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        RefreshSession: ({ refreshToken }) =>
          Effect.gen(function* () {
            const authentication = yield* AuthenticationApplication;
            return yield* authentication
              .refreshSession(refreshToken)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        GetCurrentSession: () =>
          Effect.fnUntraced(function* () {
            return yield* RpcSession;
          })(),
        GetCart: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.cart
              .get(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        AddCartItem: ({ productId, quantity }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.cart
              .addItem(session, brand<string, "ProductId">(productId), quantity)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        RemoveCartItem: ({ productId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.cart
              .removeItem(session, brand<string, "ProductId">(productId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        Checkout: ({ address }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.checkout
              .create(session, toDeliveryAddressInput(address))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListMyOrders: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.orders
              .listMine(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        GetOrder: ({ orderId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.orders
              .get(session, brand<string, "OrderId">(orderId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListPickingTasks: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.picking
              .listAssignedTasks(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        StartPicking: ({ orderId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.picking
              .start(session, brand<string, "OrderId">(orderId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdatePickingItem: (input) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.picking
              .updateItem(session, toUpdatePickingItemInput(input))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        CompletePicking: ({ orderId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.picking
              .complete(session, brand<string, "OrderId">(orderId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListDeliveryTasks: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.delivery
              .listAssignedTasks(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdateDeliveryStatus: ({ orderId, status }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const operations = yield* StaffOperationsApplication;
            return yield* operations.delivery
              .updateStatus(session, brand<string, "OrderId">(orderId), status)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListAdminOrders: ({ status }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.orders
              .list(session, status)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        AssignPicker: ({ orderId, pickerId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.dispatch
              .assignPicker(
                session,
                brand<string, "OrderId">(orderId),
                brand<string, "StaffId">(pickerId),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        AssignCourier: ({ orderId, courierId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.dispatch
              .assignCourier(
                session,
                brand<string, "OrderId">(orderId),
                brand<string, "StaffId">(courierId),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        CreateStaffProfile: (input) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.staff
              .create(session, input)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListStaffProfiles: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.staff
              .list(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        DeactivateStaffProfile: ({ staffId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.staff
              .deactivate(session, brand<string, "StaffId">(staffId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListAdminPayments: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.payments
              .list(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListAdminRefunds: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.payments
              .listRefunds(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        RefundPayment: ({ paymentId, amount, reason }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.payments
              .refund(session, {
                paymentId: brand<string, "PaymentId">(paymentId),
                amount,
                reason,
              })
              .pipe(Effect.mapError(toPaymentCommandFailure));
          }),
        UpdatePaymentStatus: ({ paymentId, status }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.payments
              .updateStatus(session, {
                paymentId: brand<string, "PaymentId">(paymentId),
                status,
              })
              .pipe(Effect.mapError(toPaymentLookupFailure));
          }),
        ListAuditLog: ({ limit }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.audit
              .list(session, limit)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        GetMetrics: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.metrics
              .get(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListAdminCategories: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .listCategories(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListAdminProducts: () =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .listProducts(session)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        CreateCategory: (input) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .createCategory(session, input)
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdateCategory: ({ categoryId, ...input }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .updateCategory(
                session,
                brand<string, "CategoryId">(categoryId),
                toUpdateCategoryInput(input),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        DeleteCategory: ({ categoryId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .deleteCategory(session, brand<string, "CategoryId">(categoryId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        CreateProduct: (input) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .createProduct(session, toCreateProductInput(input))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdateProduct: ({ productId, ...input }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .updateProduct(
                session,
                brand<string, "ProductId">(productId),
                toUpdateProductInput(input),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        DeleteProduct: ({ productId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .deleteProduct(session, brand<string, "ProductId">(productId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdateProductAvailability: ({ productId, ...input }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .updateAvailability(
                session,
                brand<string, "ProductId">(productId),
                toUpdateProductAvailabilityInput(input),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UpdateProductPrice: ({ productId, ...input }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .updatePrice(
                session,
                brand<string, "ProductId">(productId),
                toUpdateProductPriceInput(input),
              )
              .pipe(Effect.mapError(toBackendFailure));
          }),
        ListProductPriceHistory: ({ productId }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .listPriceHistory(session, brand<string, "ProductId">(productId))
              .pipe(Effect.mapError(toBackendFailure));
          }),
        RegisterPushToken: ({ token, platform }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const shopping = yield* CustomerShoppingApplication;
            return yield* shopping.notifications
              .registerPushToken(session, { token, platform })
              .pipe(Effect.mapError(toBackendFailure));
          }),
        UploadProductImage: ({ dataBase64 }) =>
          Effect.gen(function* () {
            const session = yield* RpcSession;
            const administration = yield* AdministrationApplication;
            return yield* administration.catalog
              .uploadImage(session, dataBase64)
              .pipe(Effect.mapError(toBackendFailure));
          }),
      }),
    ),
  );

  const authentication = Layer.effect(
    RpcAuthentication,
    Effect.gen(function* () {
      const authentication = yield* AuthenticationApplication;

      return RpcAuthentication.of((effect, options) => {
        const token = readBearerToken(options.headers.authorization);
        if (!token) {
          return Effect.fail(
            new RpcUnauthorized({
              message: "A bearer access token is required.",
            }),
          );
        }

        return authentication.getCurrentSession(token).pipe(
          Effect.mapError(toUnauthorized),
          Effect.flatMap((session) =>
            Effect.provideService(effect, RpcSession, session),
          ),
        );
      });
    }),
  ).pipe(Layer.provide(applicationLayer));

  const handlersWithApplication = handlers.pipe(
    Layer.provide(applicationLayer),
  );
  const rpcRoutes = RpcServer.layerHttp({
    group: AltynMarketRpcs,
    path: "/rpc",
    protocol: "http",
    disableFatalDefects: true,
  }).pipe(
    Layer.provide([
      handlersWithApplication,
      authentication,
      Layer.succeed(RpcSerialization.RpcSerialization, RpcSerialization.json),
    ]),
  );

  return HttpRouter.toWebHandler(
    rpcRoutes.pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
};
