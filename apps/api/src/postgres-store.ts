import type { DatabaseClient, DatabaseExecutor } from "@altyn-market/database";
import {
  brand,
  type Address,
  type Category,
  type Customer,
  type DeliveryTask,
  type DeliveryTaskStatus,
  type Money,
  type Order,
  type OrderId,
  type OrderItem,
  type OrderItemStatus,
  type OrderStatus,
  type Payment,
  type PaymentStatus,
  type PhoneNumber,
  type PickingTask,
  type PickingTaskStatus,
  type Product,
  type ProductAvailability,
  type ProductId,
  type ProductPrice,
  type ProductUnit,
  type CartSnapshot,
  type Refund,
  type StaffProfile,
  type UserId,
} from "@altyn-market/domain";
import { randomUUID } from "node:crypto";
import type {
  AuditLogRecord,
  OtpChallengeRecord,
  ProductForSale,
  PushSubscriptionRecord,
  Store,
  StoredRefreshTokenRecord,
  StoredSessionRecord,
} from "./store.js";

export const createPostgresStore = (database: DatabaseClient): Store => ({
  auth: {
    createOtpChallenge: async (input) => {
      await database.query(
        `
          insert into otp_challenges (
            id,
            phone_e164,
            code_hash,
            attempts,
            expires_at
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          input.id,
          input.phone.e164,
          input.codeHash,
          input.attempts,
          input.expiresAt,
        ],
      );
    },
    findActiveOtpChallenge: async (phone, now) => {
      const rows = await database.query<OtpChallengeRow>(
        `
          select id, phone_e164, code_hash, attempts, expires_at
          from otp_challenges
          where phone_e164 = $1
            and consumed_at is null
            and expires_at > $2
          order by created_at desc
          limit 1
        `,
        [phone.e164, now.toISOString()],
      );
      const row = rows[0];
      return row ? mapOtpChallenge(row) : undefined;
    },
    updateOtpAttempts: async (challengeId, attempts) => {
      await database.query(
        "update otp_challenges set attempts = $2 where id = $1",
        [challengeId, attempts],
      );
    },
    consumeOtpChallenge: async (challengeId) => {
      await database.query(
        "update otp_challenges set consumed_at = now() where id = $1",
        [challengeId],
      );
    },
    upsertCustomer: (phone, fullName) =>
      upsertCustomer(database, phone, fullName),
    createDeviceSession: async (input) => {
      await database.query(
        `
          insert into device_sessions (
            id,
            user_id,
            device_name,
            user_agent,
            ip_address
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          input.id,
          input.userId,
          input.deviceName ?? null,
          input.userAgent ?? null,
          input.ipAddress ?? null,
        ],
      );
    },
    createSession: async (input) => {
      await database.transaction(async (client) => {
        await client.query(
          `
            insert into auth_sessions (
              id,
              user_id,
              device_session_id,
              access_token_hash,
              expires_at
            )
            values ($1, $2, $3, $4, $5)
          `,
          [
            input.sessionId,
            input.userId,
            input.deviceSessionId,
            input.accessTokenHash,
            input.accessExpiresAt,
          ],
        );
        await client.query(
          `
            insert into refresh_tokens (
              id,
              session_id,
              token_hash,
              expires_at
            )
            values ($1, $2, $3, $4)
          `,
          [
            input.refreshTokenId,
            input.sessionId,
            input.refreshTokenHash,
            input.refreshExpiresAt,
          ],
        );
      });
    },
    findSessionByAccessTokenHash: async (tokenHash, now) => {
      const rows = await database.query<AuthSessionRow>(
        `
          select
            s.id as session_id,
            s.user_id,
            s.device_session_id,
            s.expires_at,
            u.phone_e164,
            u.full_name,
            u.created_at as user_created_at,
            sp.id as staff_id,
            sp.display_name,
            sp.roles,
            sp.is_active
          from auth_sessions s
          join users u on u.id = s.user_id
          left join staff_profiles sp on sp.user_id = u.id and sp.is_active = true
          where s.access_token_hash = $1
            and s.revoked_at is null
            and s.expires_at > $2
          limit 1
        `,
        [tokenHash, now.toISOString()],
      );
      const row = rows[0];
      return row ? mapStoredSession(row) : undefined;
    },
    findRefreshTokenByHash: async (tokenHash, now) => {
      const rows = await database.query<RefreshTokenRow>(
        `
          select
            rt.id as refresh_token_id,
            rt.session_id,
            s.user_id,
            s.device_session_id,
            rt.expires_at,
            u.phone_e164,
            u.full_name,
            u.created_at as user_created_at,
            sp.id as staff_id,
            sp.display_name,
            sp.roles,
            sp.is_active
          from refresh_tokens rt
          join auth_sessions s on s.id = rt.session_id
          join users u on u.id = s.user_id
          left join staff_profiles sp on sp.user_id = u.id and sp.is_active = true
          where rt.token_hash = $1
            and rt.revoked_at is null
            and rt.used_at is null
            and rt.expires_at > $2
            and s.revoked_at is null
          limit 1
        `,
        [tokenHash, now.toISOString()],
      );
      const row = rows[0];
      return row ? mapStoredRefreshToken(row) : undefined;
    },
    markRefreshTokenUsed: async (refreshTokenId, replacementTokenId) => {
      await database.query(
        `
          update refresh_tokens
          set used_at = now(), replaced_by_token_id = $2
          where id = $1
        `,
        [refreshTokenId, replacementTokenId],
      );
    },
    revokeSession: async (sessionId) => {
      await database.query(
        "update auth_sessions set revoked_at = now() where id = $1",
        [sessionId],
      );
    },
    touchSession: async (sessionId) => {
      await database.query(
        `
          update auth_sessions
          set last_seen_at = now()
          where id = $1
        `,
        [sessionId],
      );
    },
  },
  staff: {
    list: async () => {
      const rows = await database.query<StaffRow>(
        `
          select id, user_id, display_name, roles, is_active
          from staff_profiles
          order by display_name asc
        `,
      );
      return rows.map(mapStaff);
    },
    getByUserId: async (userId) => {
      const rows = await database.query<StaffRow>(
        `
          select id, user_id, display_name, roles, is_active
          from staff_profiles
          where user_id = $1
          limit 1
        `,
        [userId],
      );
      const row = rows[0];
      return row ? mapStaff(row) : undefined;
    },
    getById: async (staffId) => {
      const rows = await database.query<StaffRow>(
        `
          select id, user_id, display_name, roles, is_active
          from staff_profiles
          where id = $1
          limit 1
        `,
        [staffId],
      );
      const row = rows[0];
      return row ? mapStaff(row) : undefined;
    },
    upsertStaffProfile: async (input) => {
      const user = await upsertCustomer(database, input.phone);
      const existing = await database.query<StaffRow>(
        `
          select id, user_id, display_name, roles, is_active
          from staff_profiles
          where user_id = $1
          limit 1
        `,
        [user.id],
      );

      if (existing[0]) {
        const rows = await database.query<StaffRow>(
          `
            update staff_profiles
            set display_name = $2, roles = $3, is_active = true
            where user_id = $1
            returning id, user_id, display_name, roles, is_active
          `,
          [user.id, input.displayName, input.roles],
        );
        return mapRequired(rows[0], mapStaff, "Staff profile not updated.");
      }

      const rows = await database.query<StaffRow>(
        `
          insert into staff_profiles (id, user_id, display_name, roles, is_active)
          values ($1, $2, $3, $4, true)
          returning id, user_id, display_name, roles, is_active
        `,
        [randomUUID(), user.id, input.displayName, input.roles],
      );
      return mapRequired(rows[0], mapStaff, "Staff profile not created.");
    },
    deactivateStaffProfile: async (staffId) => {
      await database.query(
        "update staff_profiles set is_active = false where id = $1",
        [staffId],
      );
    },
  },
  catalog: {
    listCategories: async () => {
      const rows = await database.query<CategoryRow>(
        `
          select id, name, slug, sort_order, is_active
          from categories
          where is_active = true
          order by sort_order asc, name asc
        `,
      );
      return rows.map(mapCategory);
    },
    listProducts: async () => {
      const rows = await database.query<ProductRow>(
        `
          select id, category_id, name, description, unit, image_url, is_active
          from products
          where is_active = true
          order by name asc
        `,
      );
      return rows.map(mapProduct);
    },
    listAllCategories: async () => {
      const rows = await database.query<CategoryRow>(
        `
          select id, name, slug, sort_order, is_active
          from categories
          order by sort_order asc, name asc
        `,
      );
      return rows.map(mapCategory);
    },
    listProductsForOperations: async () => {
      const rows = await database.query<ProductForSaleRow>(
        `
          select
            p.id,
            p.category_id,
            p.name,
            p.description,
            p.unit,
            p.image_url,
            p.is_active,
            pp.customer_price_minor,
            pp.internal_cost_minor,
            pp.currency,
            pp.effective_from,
            coalesce(pa.is_available, true) as is_available,
            pa.note as availability_note,
            coalesce(pa.updated_at, p.created_at) as availability_updated_at
          from products p
          join lateral (
            select *
            from product_prices
            where product_id = p.id
            order by effective_from desc
            limit 1
          ) pp on true
          left join product_availability pa on pa.product_id = p.id
          order by p.name asc
        `,
      );
      return rows.map(mapProductForSale);
    },
    getProductForSale: (productId) =>
      getProductForSaleById(database, productId),
    createCategory: async (input) => {
      const rows = await database.query<CategoryRow>(
        `
          insert into categories (id, name, slug, sort_order, is_active)
          values ($1, $2, $3, $4, $5)
          returning id, name, slug, sort_order, is_active
        `,
        [randomUUID(), input.name, input.slug, input.sortOrder, input.isActive],
      );
      return mapRequired(rows[0], mapCategory, "Category not created.");
    },
    updateCategory: async (categoryId, input) => {
      const rows = await database.query<CategoryRow>(
        `
          update categories
          set name = coalesce($2, name),
              slug = coalesce($3, slug),
              sort_order = coalesce($4, sort_order),
              is_active = coalesce($5, is_active)
          where id = $1
          returning id, name, slug, sort_order, is_active
        `,
        [
          categoryId,
          input.name ?? null,
          input.slug ?? null,
          input.sortOrder ?? null,
          input.isActive ?? null,
        ],
      );
      return mapRequired(rows[0], mapCategory, "Category not found.");
    },
    deleteCategory: (categoryId) =>
      database.transaction(async (client) => {
        const categoryRows = await client.query<CategoryRow>(
          `
            select id, name, slug, sort_order, is_active
            from categories
            where id = $1
            for update
          `,
          [categoryId],
        );
        const categoryRow = categoryRows[0];

        if (!categoryRow) {
          return { kind: "not_found" } as const;
        }

        const productReferenceRows = await client.query<ExistsRow>(
          `
            select exists(
              select 1
              from products
              where category_id = $1
            ) as exists
          `,
          [categoryId],
        );
        if (productReferenceRows[0]?.exists) {
          return { kind: "has_products" } as const;
        }

        await client.query("delete from categories where id = $1", [
          categoryId,
        ]);
        return { kind: "deleted", category: mapCategory(categoryRow) } as const;
      }),
    createProduct: async (input) =>
      database.transaction(async (client) => {
        const productId = randomUUID();
        await client.query(
          `
            insert into products (
              id,
              category_id,
              name,
              description,
              unit,
              image_url,
              is_active
            )
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            productId,
            input.categoryId,
            input.name,
            input.description ?? null,
            input.unit,
            input.imageUrl ?? null,
            input.isActive,
          ],
        );
        await client.query(
          `
            insert into product_availability (
              product_id,
              is_available,
              note,
              updated_at
            )
            values ($1, $2, $3, now())
          `,
          [productId, input.isAvailable, input.availabilityNote ?? null],
        );
        await client.query(
          `
            insert into product_prices (
              id,
              product_id,
              customer_price_minor,
              internal_cost_minor,
              currency,
              effective_from
            )
            values ($1, $2, $3, $4, $5, now())
          `,
          [
            randomUUID(),
            productId,
            input.customerPrice.amountMinor,
            input.internalCost?.amountMinor ?? null,
            input.customerPrice.currency,
          ],
        );
        const productForSale = await getProductForSaleById(
          client,
          brand<string, "ProductId">(productId),
        );
        if (!productForSale) {
          throw new Error("Product not created.");
        }
        return productForSale;
      }),
    updateProduct: async (productId, input) => {
      await database.query(
        `
          update products
          set category_id = coalesce($2, category_id),
              name = coalesce($3, name),
              description = coalesce($4, description),
              unit = coalesce($5, unit),
              image_url = coalesce($6, image_url),
              is_active = coalesce($7, is_active)
          where id = $1
        `,
        [
          productId,
          input.categoryId ?? null,
          input.name ?? null,
          input.description ?? null,
          input.unit ?? null,
          input.imageUrl ?? null,
          input.isActive ?? null,
        ],
      );
      const productForSale = await getProductForSaleById(database, productId);
      if (!productForSale) {
        throw new Error("Product not found.");
      }
      return productForSale;
    },
    deleteProduct: (productId) =>
      database.transaction(async (client) => {
        const productRows = await client.query<ProductRow>(
          `
            select id, category_id, name, description, unit, image_url, is_active
            from products
            where id = $1
            for update
          `,
          [productId],
        );
        const productRow = productRows[0];

        if (!productRow) {
          return { kind: "not_found" } as const;
        }

        const orderReferenceRows = await client.query<ExistsRow>(
          `
            select exists(
              select 1
              from order_items
              where product_id = $1
            ) as exists
          `,
          [productId],
        );
        if (orderReferenceRows[0]?.exists) {
          return { kind: "has_order_history" } as const;
        }

        await client.query("delete from cart_items where product_id = $1", [
          productId,
        ]);
        await client.query(
          "delete from product_availability where product_id = $1",
          [productId],
        );
        await client.query("delete from product_prices where product_id = $1", [
          productId,
        ]);
        await client.query("delete from products where id = $1", [productId]);

        return { kind: "deleted", product: mapProduct(productRow) } as const;
      }),
    updateProductAvailability: async (productId, input) => {
      const rows = await database.query<ProductAvailabilityRow>(
        `
          insert into product_availability (
            product_id,
            is_available,
            note,
            updated_at
          )
          values ($1, $2, $3, now())
          on conflict (product_id)
          do update set
            is_available = excluded.is_available,
            note = excluded.note,
            updated_at = now()
          returning product_id, is_available, note, updated_at
        `,
        [productId, input.isAvailable, input.note ?? null],
      );
      return mapRequired(
        rows[0],
        mapProductAvailability,
        "Availability not updated.",
      );
    },
    setProductPrice: async (productId, input) => {
      const rows = await database.query<ProductPriceRow>(
        `
          insert into product_prices (
            id,
            product_id,
            customer_price_minor,
            internal_cost_minor,
            currency,
            effective_from
          )
          values ($1, $2, $3, $4, $5, $6)
          returning
            product_id,
            customer_price_minor,
            internal_cost_minor,
            currency,
            effective_from
        `,
        [
          randomUUID(),
          productId,
          input.customerPrice.amountMinor,
          input.internalCost?.amountMinor ?? null,
          input.customerPrice.currency,
          input.effectiveFrom ?? new Date().toISOString(),
        ],
      );
      return mapRequired(rows[0], mapProductPrice, "Price not created.");
    },
    listProductPriceHistory: async (productId) => {
      const rows = await database.query<ProductPriceRow>(
        `
          select
            product_id,
            customer_price_minor,
            internal_cost_minor,
            currency,
            effective_from
          from product_prices
          where product_id = $1
          order by effective_from desc
        `,
        [productId],
      );
      return rows.map(mapProductPrice);
    },
  },
  cart: {
    get: async (userId) => {
      const cart = await getOrCreateCart(database, userId);
      return getCartSnapshot(database, cart.id, userId);
    },
    addItem: async (userId, productId, quantity) => {
      const cart = await getOrCreateCart(database, userId);
      await database.query(
        `
          insert into cart_items (cart_id, product_id, quantity)
          values ($1, $2, $3)
          on conflict (cart_id, product_id)
          do update set quantity = $3, updated_at = now()
        `,
        [cart.id, productId, quantity],
      );
      return getCartSnapshot(database, cart.id, userId);
    },
    removeItem: async (userId, productId) => {
      const cart = await getOrCreateCart(database, userId);
      await database.query(
        "delete from cart_items where cart_id = $1 and product_id = $2",
        [cart.id, productId],
      );
      return getCartSnapshot(database, cart.id, userId);
    },
    clear: async (userId) => {
      await database.query(
        `
          update carts
          set status = 'checked_out', updated_at = now()
          where user_id = $1 and status = 'active'
        `,
        [userId],
      );
    },
  },
  orders: {
    createCheckoutOrder: async (input) =>
      database.transaction(async (client) => {
        await insertAddress(client, input.address);
        await client.query(
          `
            insert into orders (
              id,
              customer_id,
              address_id,
              status,
              goods_total_minor,
              delivery_fee_minor,
              final_total_minor,
              currency
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            input.orderId,
            input.customerId,
            input.address.id,
            input.status,
            input.goodsTotal.amountMinor,
            input.deliveryFee.amountMinor,
            input.finalTotal.amountMinor,
            input.finalTotal.currency,
          ],
        );

        for (const item of input.items) {
          await client.query(
            `
              insert into order_items (
                id,
                order_id,
                product_id,
                product_name_snapshot,
                unit_snapshot,
                requested_quantity,
                unit_price_minor,
                currency,
                status
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
            `,
            [
              item.id,
              input.orderId,
              item.productId,
              item.productNameSnapshot,
              item.unitSnapshot,
              item.requestedQuantity,
              item.unitPriceSnapshot.amountMinor,
              item.unitPriceSnapshot.currency,
            ],
          );
        }

        await client.query(
          `
            insert into order_status_history (
              id,
              order_id,
              to_status,
              changed_by,
              note
            )
            values ($1, $2, $3, $4, $5)
          `,
          [
            randomUUID(),
            input.orderId,
            input.status,
            input.customerId,
            "Checkout created order",
          ],
        );

        await client.query(
          `
            insert into payments (
              id,
              order_id,
              provider,
              status,
              authorized_amount_minor,
              currency,
              provider_payment_id,
              provider_redirect_url,
              provider_deeplink_url
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            input.paymentId,
            input.orderId,
            input.payment.provider,
            input.payment.status,
            input.payment.authorizedAmount.amountMinor,
            input.payment.authorizedAmount.currency,
            input.payment.providerPaymentId ?? null,
            input.payment.redirectUrl ?? null,
            input.payment.deeplinkUrl ?? null,
          ],
        );

        const order = await getOrder(client, input.orderId);
        const payment = await getPaymentByOrderId(client, input.orderId);

        if (!order || !payment) {
          throw new Error("Checkout order creation failed.");
        }

        return { order, payment };
      }),
    get: (orderId) => getOrder(database, orderId),
    listByCustomer: async (userId) => {
      const rows = await database.query<{ readonly id: string }>(
        `
          select id
          from orders
          where customer_id = $1
          order by created_at desc
        `,
        [userId],
      );
      return hydrateOrders(database, rows);
    },
    list: async (status) => {
      const rows = await database.query<{ readonly id: string }>(
        `
          select id
          from orders
          where ($1::text is null or status = $1)
          order by created_at desc
        `,
        [status ?? null],
      );
      return hydrateOrders(database, rows);
    },
    setStatus: async (orderId, status, actorUserId, note) =>
      database.transaction(async (client) => {
        const existing = await getOrder(client, orderId);
        if (!existing) {
          throw new Error("Order not found.");
        }

        await client.query(
          `
            update orders
            set status = $2, updated_at = now()
            where id = $1
          `,
          [orderId, status],
        );
        await client.query(
          `
            insert into order_status_history (
              id,
              order_id,
              from_status,
              to_status,
              changed_by,
              note
            )
            values ($1, $2, $3, $4, $5, $6)
          `,
          [
            randomUUID(),
            orderId,
            existing.status,
            status,
            actorUserId,
            note ?? null,
          ],
        );

        const updated = await getOrder(client, orderId);
        if (!updated) {
          throw new Error("Order not found after status update.");
        }
        return updated;
      }),
    updateItemStatus: async (input) => {
      await database.query(
        `
          update order_items
          set status = $3,
              picked_quantity = $4,
              cancellation_reason = $5
          where order_id = $1 and id = $2
        `,
        [
          input.orderId,
          input.itemId,
          input.status,
          input.pickedQuantity ?? null,
          input.cancellationReason ?? null,
        ],
      );
      const order = await getOrder(database, input.orderId);
      if (!order) {
        throw new Error("Order not found.");
      }
      return order;
    },
    updateTotals: async (orderId, goodsTotal, finalTotal) => {
      await database.query(
        `
          update orders
          set goods_total_minor = $2,
              final_total_minor = $3,
              updated_at = now()
          where id = $1
        `,
        [orderId, goodsTotal.amountMinor, finalTotal.amountMinor],
      );
      const order = await getOrder(database, orderId);
      if (!order) {
        throw new Error("Order not found.");
      }
      return order;
    },
  },
  payments: {
    list: async () => {
      const rows = await database.query<PaymentRow>(
        `
          select
            id,
            order_id,
            provider,
            status,
            authorized_amount_minor,
            captured_amount_minor,
            currency,
            provider_payment_id,
            provider_redirect_url,
            provider_deeplink_url
          from payments
          order by updated_at desc, created_at desc
        `,
      );
      return rows.map(mapPayment);
    },
    getById: async (paymentId) => {
      const rows = await database.query<PaymentRow>(
        `
          select
            id,
            order_id,
            provider,
            status,
            authorized_amount_minor,
            captured_amount_minor,
            currency,
            provider_payment_id,
            provider_redirect_url,
            provider_deeplink_url
          from payments
          where id = $1
          limit 1
        `,
        [paymentId],
      );
      const row = rows[0];
      return row ? mapPayment(row) : undefined;
    },
    getByOrderId: (orderId) => getPaymentByOrderId(database, orderId),
    listRefunds: async () => {
      const rows = await database.query<RefundRow>(
        `
          select id, payment_id, amount_minor, currency, reason, status
          from refunds
          order by created_at desc
        `,
      );
      return rows.map(mapRefund);
    },
    updateAfterCapture: async (paymentId, status, capturedAmount) => {
      const rows = await database.query<PaymentRow>(
        `
          update payments
          set status = $2,
              captured_amount_minor = $3,
              updated_at = now()
          where id = $1
          returning
            id,
            order_id,
            provider,
            status,
            authorized_amount_minor,
            captured_amount_minor,
            currency,
            provider_payment_id,
            provider_redirect_url,
            provider_deeplink_url
        `,
        [paymentId, status, capturedAmount.amountMinor],
      );
      return mapRequired(rows[0], mapPayment, "Payment not found.");
    },
    updateStatus: async (paymentId, status) => {
      const rows = await database.query<PaymentRow>(
        `
          update payments
          set status = $2, updated_at = now()
          where id = $1
          returning
            id,
            order_id,
            provider,
            status,
            authorized_amount_minor,
            captured_amount_minor,
            currency,
            provider_payment_id,
            provider_redirect_url,
            provider_deeplink_url
        `,
        [paymentId, status],
      );
      return mapRequired(rows[0], mapPayment, "Payment not found.");
    },
    createRefund: async (input) => {
      const rows = await database.query<RefundRow>(
        `
          insert into refunds (id, payment_id, amount_minor, currency, reason, status)
          values ($1, $2, $3, $4, $5, $6)
          returning id, payment_id, amount_minor, currency, reason, status
        `,
        [
          input.id,
          input.paymentId,
          input.amount.amountMinor,
          input.amount.currency,
          input.reason,
          input.status,
        ],
      );
      return mapRequired(rows[0], mapRefund, "Refund not created.");
    },
  },
  picking: {
    listAssignedTasks: async (pickerId) => {
      const rows = await database.query<PickingTaskRow>(
        `
          select id, order_id, picker_id, status, assigned_at, completed_at
          from picking_tasks
          where ($1::uuid is null or picker_id = $1)
          order by assigned_at desc
        `,
        [pickerId ?? null],
      );
      return rows.map(mapPickingTask);
    },
    createTask: async (orderId, pickerId) => {
      const rows = await database.query<PickingTaskRow>(
        `
          insert into picking_tasks (id, order_id, picker_id, status)
          values ($1, $2, $3, 'assigned')
          returning id, order_id, picker_id, status, assigned_at, completed_at
        `,
        [randomUUID(), orderId, pickerId],
      );
      return mapRequired(rows[0], mapPickingTask, "Picking task not created.");
    },
    updateStatus: async (taskId, status) => {
      const rows = await database.query<PickingTaskRow>(
        `
          update picking_tasks
          set status = $2,
              completed_at = case when $2 = 'completed' then now() else completed_at end
          where id = $1
          returning id, order_id, picker_id, status, assigned_at, completed_at
        `,
        [taskId, status],
      );
      return mapRequired(rows[0], mapPickingTask, "Picking task not found.");
    },
    getByOrderId: async (orderId) => {
      const rows = await database.query<PickingTaskRow>(
        `
          select id, order_id, picker_id, status, assigned_at, completed_at
          from picking_tasks
          where order_id = $1
          order by assigned_at desc
          limit 1
        `,
        [orderId],
      );
      const row = rows[0];
      return row ? mapPickingTask(row) : undefined;
    },
  },
  delivery: {
    listAssignedTasks: async (courierId) => {
      const rows = await database.query<DeliveryTaskRow>(
        `
          select id, order_id, courier_id, status, assigned_at, delivered_at
          from delivery_tasks
          where ($1::uuid is null or courier_id = $1)
          order by assigned_at desc
        `,
        [courierId ?? null],
      );
      return rows.map(mapDeliveryTask);
    },
    createTask: async (orderId, courierId) => {
      const rows = await database.query<DeliveryTaskRow>(
        `
          insert into delivery_tasks (id, order_id, courier_id, status)
          values ($1, $2, $3, 'assigned')
          returning id, order_id, courier_id, status, assigned_at, delivered_at
        `,
        [randomUUID(), orderId, courierId],
      );
      return mapRequired(
        rows[0],
        mapDeliveryTask,
        "Delivery task not created.",
      );
    },
    updateStatus: async (orderId, status) => {
      const rows = await database.query<DeliveryTaskRow>(
        `
          update delivery_tasks
          set status = $2,
              delivered_at = case when $2 = 'delivered' then now() else delivered_at end
          where order_id = $1
          returning id, order_id, courier_id, status, assigned_at, delivered_at
        `,
        [orderId, status],
      );
      return mapRequired(rows[0], mapDeliveryTask, "Delivery task not found.");
    },
  },
  audit: {
    record: async (input) => {
      await database.query(
        `
          insert into admin_audit_log (
            id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          randomUUID(),
          input.actorUserId,
          input.action,
          input.entityType,
          input.entityId,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },
    list: async (limit = 100) => {
      const rows = await database.query<AuditLogRow>(
        `
          select
            id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
          from admin_audit_log
          order by created_at desc
          limit $1
        `,
        [limit],
      );
      return rows.map(mapAuditLog);
    },
  },
  pushSubscriptions: {
    upsert: async (input) => {
      const rows = await database.query<PushSubscriptionRow>(
        `
          insert into push_subscriptions (
            user_id,
            token,
            platform,
            enabled
          )
          values ($1, $2, $3, true)
          on conflict (token)
          do update set
            user_id = excluded.user_id,
            platform = excluded.platform,
            enabled = true,
            updated_at = now()
          returning
            user_id,
            token,
            platform,
            enabled,
            created_at,
            updated_at
        `,
        [input.userId, input.token, input.platform],
      );
      return mapRequired(
        rows[0],
        mapPushSubscription,
        "Push subscription not saved.",
      );
    },
  },
  metrics: {
    getMvpMetrics: async () => {
      const [ordersRow] = await database.query<MetricsOrderRow>(
        `
          select
            count(*)::integer as order_count,
            coalesce(sum(final_total_minor), 0)::integer as final_total_minor,
            coalesce(sum(delivery_fee_minor), 0)::integer as delivery_fee_minor
          from orders
        `,
      );
      const [refundRow] = await database.query<{
        readonly amount_minor: number;
      }>(
        `
          select coalesce(sum(amount_minor), 0)::integer as amount_minor
          from refunds
          where status in ('pending', 'completed')
        `,
      );
      const [pickingRow] = await database.query<{
        readonly completed_count: number;
      }>(
        `
          select count(*)::integer as completed_count
          from picking_tasks
          where status = 'completed'
        `,
      );
      const orderCount = Number(ordersRow?.order_count ?? 0);
      const finalTotalMinor = Number(ordersRow?.final_total_minor ?? 0);
      const refundAmount: Money = {
        amountMinor: Number(refundRow?.amount_minor ?? 0),
        currency: "KZT",
      };
      const pickingCost: Money = {
        amountMinor: Number(pickingRow?.completed_count ?? 0) * 30000,
        currency: "KZT",
      };
      const grossProfit =
        finalTotalMinor - refundAmount.amountMinor - pickingCost.amountMinor;

      return {
        orderCount,
        averageCheck: {
          amountMinor:
            orderCount === 0 ? 0 : Math.round(finalTotalMinor / orderCount),
          currency: "KZT",
        },
        deliveryFeeRevenue: {
          amountMinor: Number(ordersRow?.delivery_fee_minor ?? 0),
          currency: "KZT",
        },
        pickingCost,
        refundAmount,
        grossProfitPerOrder: {
          amountMinor:
            orderCount === 0 ? 0 : Math.round(grossProfit / orderCount),
          currency: "KZT",
        },
      };
    },
  },
});

const upsertCustomer = async (
  database: DatabaseClient,
  phone: PhoneNumber,
  fullName?: string,
): Promise<Customer> => {
  const rows = await database.query<UserRow>(
    `
      insert into users (id, phone_e164, full_name)
      values ($1, $2, $3)
      on conflict (phone_e164)
      do update set full_name = coalesce(excluded.full_name, users.full_name)
      returning id, phone_e164, full_name, created_at
    `,
    [randomUUID(), phone.e164, fullName ?? null],
  );
  return mapRequired(rows[0], mapCustomer, "Customer not created.");
};

const getOrCreateCart = async (
  database: DatabaseClient,
  userId: UserId,
): Promise<{ readonly id: string }> => {
  const rows = await database.query<{ readonly id: string }>(
    `
      insert into carts (id, user_id, status)
      values ($1, $2, 'active')
      on conflict (user_id) where status = 'active'
      do update set updated_at = now()
      returning id
    `,
    [randomUUID(), userId],
  );
  return mapRequired(rows[0], (row) => row, "Cart not created.");
};

const getCartSnapshot = async (
  database: DatabaseClient,
  cartId: string,
  userId: UserId,
): Promise<CartSnapshot> => {
  const rows = await database.query<CartItemRow>(
    `
      select
        ci.quantity,
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.unit,
        p.image_url,
        p.is_active,
        pp.customer_price_minor,
        pp.internal_cost_minor,
        pp.currency,
        pp.effective_from,
        coalesce(pa.is_available, true) as is_available,
        pa.note as availability_note,
        coalesce(pa.updated_at, p.created_at) as availability_updated_at
      from cart_items ci
      join products p on p.id = ci.product_id
      join lateral (
        select *
        from product_prices
        where product_id = p.id
        order by effective_from desc
        limit 1
      ) pp on true
      left join product_availability pa on pa.product_id = p.id
      where ci.cart_id = $1
      order by ci.created_at asc
    `,
    [cartId],
  );

  return {
    id: brand<string, "CartId">(cartId),
    userId,
    items: rows.map((row) => ({
      ...mapProductForSale(row),
      quantity: Number(row.quantity),
    })),
  };
};

const getProductForSaleById = async (
  database: DatabaseExecutor,
  productId: ProductId,
): Promise<ProductForSale | undefined> => {
  const rows = await database.query<ProductForSaleRow>(
    `
      select
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.unit,
        p.image_url,
        p.is_active,
        pp.customer_price_minor,
        pp.internal_cost_minor,
        pp.currency,
        pp.effective_from,
        coalesce(pa.is_available, true) as is_available,
        pa.note as availability_note,
        coalesce(pa.updated_at, p.created_at) as availability_updated_at
      from products p
      join lateral (
        select *
        from product_prices
        where product_id = p.id
        order by effective_from desc
        limit 1
      ) pp on true
      left join product_availability pa on pa.product_id = p.id
      where p.id = $1
      limit 1
    `,
    [productId],
  );
  const row = rows[0];
  return row ? mapProductForSale(row) : undefined;
};

const insertAddress = async (
  client: DatabaseExecutor,
  address: Address,
): Promise<void> => {
  await client.query(
    `
      insert into addresses (
        id,
        user_id,
        label,
        city,
        street,
        apartment,
        entrance,
        floor,
        comment,
        latitude,
        longitude
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      address.id,
      address.userId,
      address.label,
      address.city,
      address.street,
      address.apartment ?? null,
      address.entrance ?? null,
      address.floor ?? null,
      address.comment ?? null,
      address.latitude ?? null,
      address.longitude ?? null,
    ],
  );
};

const getOrder = async (
  database: DatabaseExecutor,
  orderId: OrderId,
): Promise<Order | undefined> => {
  const orderRows = await database.query<OrderRow>(
    `
      select
        o.id,
        o.customer_id,
        o.address_id,
        o.status,
        o.goods_total_minor,
        o.delivery_fee_minor,
        o.final_total_minor,
        o.currency,
        o.created_at,
        o.updated_at,
        p.id as payment_id
      from orders o
      left join payments p on p.order_id = o.id
      where o.id = $1
      limit 1
    `,
    [orderId],
  );
  const orderRow = orderRows[0];

  if (!orderRow) {
    return undefined;
  }

  const itemRows = await database.query<OrderItemRow>(
    `
      select
        id,
        product_id,
        product_name_snapshot,
        unit_snapshot,
        requested_quantity,
        picked_quantity,
        unit_price_minor,
        currency,
        status,
        cancellation_reason
      from order_items
      where order_id = $1
      order by product_name_snapshot asc
    `,
    [orderId],
  );

  return mapOrder(orderRow, itemRows.map(mapOrderItem));
};

const getPaymentByOrderId = async (
  database: DatabaseExecutor,
  orderId: OrderId,
): Promise<Payment | undefined> => {
  const rows = await database.query<PaymentRow>(
    `
      select
        id,
        order_id,
        provider,
        status,
        authorized_amount_minor,
        captured_amount_minor,
        currency,
        provider_payment_id,
        provider_redirect_url,
        provider_deeplink_url
      from payments
      where order_id = $1
      limit 1
    `,
    [orderId],
  );
  const row = rows[0];
  return row ? mapPayment(row) : undefined;
};

const hydrateOrders = async (
  database: DatabaseExecutor,
  rows: readonly { readonly id: string }[],
): Promise<readonly Order[]> => {
  const orders: Order[] = [];

  for (const row of rows) {
    const order = await getOrder(database, brand(row.id));
    if (order) {
      orders.push(order);
    }
  }

  return orders;
};

const mapRequired = <TRow, TResult>(
  row: TRow | undefined,
  mapper: (row: TRow) => TResult,
  message: string,
): TResult => {
  if (!row) {
    throw new Error(message);
  }
  return mapper(row);
};

const mapOtpChallenge = (row: OtpChallengeRow): OtpChallengeRecord => ({
  id: String(row.id),
  phone: { e164: String(row.phone_e164) },
  codeHash: String(row.code_hash),
  attempts: Number(row.attempts),
  expiresAt: toIso(row.expires_at),
});

const mapCustomer = (row: UserRow): Customer => ({
  id: brand(String(row.id)),
  phone: { e164: String(row.phone_e164) },
  ...(row.full_name ? { fullName: String(row.full_name) } : {}),
  createdAt: toIso(row.created_at),
});

const mapStoredSession = (row: AuthSessionRow): StoredSessionRecord => {
  const customer = mapCustomer({
    id: row.user_id,
    phone_e164: row.phone_e164,
    full_name: row.full_name,
    created_at: row.user_created_at,
  });
  const staff = mapMaybeStaff(row);

  return {
    id: String(row.session_id),
    userId: brand(String(row.user_id)),
    deviceSessionId: String(row.device_session_id),
    expiresAt: toIso(row.expires_at),
    customer,
    ...(staff ? { staff } : {}),
  };
};

const mapStoredRefreshToken = (
  row: RefreshTokenRow,
): StoredRefreshTokenRecord => {
  const customer = mapCustomer({
    id: row.user_id,
    phone_e164: row.phone_e164,
    full_name: row.full_name,
    created_at: row.user_created_at,
  });
  const staff = mapMaybeStaff(row);

  return {
    id: String(row.refresh_token_id),
    sessionId: String(row.session_id),
    userId: brand(String(row.user_id)),
    deviceSessionId: String(row.device_session_id),
    expiresAt: toIso(row.expires_at),
    customer,
    ...(staff ? { staff } : {}),
  };
};

const mapMaybeStaff = (
  row: Pick<StaffRow, "staff_id" | "display_name" | "roles" | "is_active"> &
    Partial<Pick<StaffRow, "user_id">> & { readonly user_id?: unknown },
): StaffProfile | undefined => {
  if (!row.staff_id || row.is_active !== true) {
    return undefined;
  }

  return {
    id: brand(String(row.staff_id)),
    userId: brand(String(row.user_id)),
    displayName: String(row.display_name),
    roles: Array.isArray(row.roles)
      ? (row.roles.map(String) as StaffProfile["roles"])
      : [],
    isActive: true,
  };
};

const mapStaff = (row: StaffRow): StaffProfile => ({
  id: brand(String(row.id ?? row.staff_id)),
  userId: brand(String(row.user_id)),
  displayName: String(row.display_name),
  roles: Array.isArray(row.roles)
    ? (row.roles.map(String) as StaffProfile["roles"])
    : [],
  isActive: row.is_active === true,
});

const mapCategory = (row: CategoryRow): Category => ({
  id: brand(String(row.id)),
  name: String(row.name),
  slug: String(row.slug),
  sortOrder: Number(row.sort_order),
  isActive: row.is_active === true,
});

const mapProduct = (row: ProductRow): Product => ({
  id: brand(String(row.id)),
  categoryId: brand(String(row.category_id)),
  name: String(row.name),
  ...(row.description ? { description: String(row.description) } : {}),
  unit: String(row.unit) as ProductUnit,
  ...(row.image_url ? { imageUrl: String(row.image_url) } : {}),
  isActive: row.is_active === true,
});

const mapProductForSale = (row: ProductForSaleRow): ProductForSale => ({
  product: mapProduct(row),
  price: {
    productId: brand(String(row.id)),
    customerPrice: {
      amountMinor: Number(row.customer_price_minor),
      currency: "KZT",
    },
    ...(row.internal_cost_minor === null ||
    row.internal_cost_minor === undefined
      ? {}
      : {
          internalCost: {
            amountMinor: Number(row.internal_cost_minor),
            currency: "KZT" as const,
          },
        }),
    effectiveFrom: toIso(row.effective_from),
  },
  availability: {
    productId: brand(String(row.id)),
    isAvailable: row.is_available === true,
    ...(row.availability_note ? { note: String(row.availability_note) } : {}),
    updatedAt: toIso(row.availability_updated_at),
  },
});

const mapProductPrice = (row: ProductPriceRow): ProductPrice => ({
  productId: brand(String(row.product_id)),
  customerPrice: {
    amountMinor: Number(row.customer_price_minor),
    currency: "KZT",
  },
  ...(row.internal_cost_minor === null || row.internal_cost_minor === undefined
    ? {}
    : {
        internalCost: {
          amountMinor: Number(row.internal_cost_minor),
          currency: "KZT" as const,
        },
      }),
  effectiveFrom: toIso(row.effective_from),
});

const mapProductAvailability = (
  row: ProductAvailabilityRow,
): ProductAvailability => ({
  productId: brand(String(row.product_id)),
  isAvailable: row.is_available === true,
  ...(row.note ? { note: String(row.note) } : {}),
  updatedAt: toIso(row.updated_at),
});

const mapOrder = (row: OrderRow, items: readonly OrderItem[]): Order => ({
  id: brand(String(row.id)),
  customerId: brand(String(row.customer_id)),
  addressId: brand(String(row.address_id)),
  status: String(row.status) as OrderStatus,
  items,
  goodsTotal: {
    amountMinor: Number(row.goods_total_minor),
    currency: "KZT",
  },
  deliveryFee: {
    amountMinor: Number(row.delivery_fee_minor),
    currency: "KZT",
  },
  finalTotal: {
    amountMinor: Number(row.final_total_minor),
    currency: "KZT",
  },
  ...(row.payment_id ? { paymentId: brand(String(row.payment_id)) } : {}),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const mapOrderItem = (row: OrderItemRow): OrderItem => ({
  id: brand(String(row.id)),
  productId: brand(String(row.product_id)),
  productNameSnapshot: String(row.product_name_snapshot),
  unitSnapshot: String(row.unit_snapshot),
  requestedQuantity: Number(row.requested_quantity),
  ...(row.picked_quantity === null || row.picked_quantity === undefined
    ? {}
    : { pickedQuantity: Number(row.picked_quantity) }),
  unitPriceSnapshot: {
    amountMinor: Number(row.unit_price_minor),
    currency: "KZT",
  },
  status: String(row.status) as OrderItemStatus,
  ...(row.cancellation_reason
    ? {
        cancellationReason: String(row.cancellation_reason) as NonNullable<
          OrderItem["cancellationReason"]
        >,
      }
    : {}),
});

const mapPayment = (row: PaymentRow): Payment => ({
  id: brand(String(row.id)),
  orderId: brand(String(row.order_id)),
  provider: String(row.provider),
  status: String(row.status) as PaymentStatus,
  authorizedAmount: {
    amountMinor: Number(row.authorized_amount_minor),
    currency: "KZT",
  },
  ...(row.captured_amount_minor === null ||
  row.captured_amount_minor === undefined
    ? {}
    : {
        capturedAmount: {
          amountMinor: Number(row.captured_amount_minor),
          currency: "KZT" as const,
        },
      }),
  ...(row.provider_payment_id
    ? { providerPaymentId: String(row.provider_payment_id) }
    : {}),
  ...(row.provider_redirect_url
    ? { redirectUrl: String(row.provider_redirect_url) }
    : {}),
  ...(row.provider_deeplink_url
    ? { deeplinkUrl: String(row.provider_deeplink_url) }
    : {}),
});

const mapRefund = (row: RefundRow): Refund => ({
  id: brand(String(row.id)),
  paymentId: brand(String(row.payment_id)),
  amount: {
    amountMinor: Number(row.amount_minor),
    currency: "KZT",
  },
  reason: String(row.reason),
  status: String(row.status) as Refund["status"],
});

const mapAuditLog = (row: AuditLogRow): AuditLogRecord => ({
  id: String(row.id),
  actorUserId: brand(String(row.actor_user_id)),
  action: String(row.action),
  entityType: String(row.entity_type),
  entityId: String(row.entity_id),
  metadata:
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {},
  createdAt: toIso(row.created_at),
});

const mapPushSubscription = (
  row: PushSubscriptionRow,
): PushSubscriptionRecord => ({
  userId: brand(String(row.user_id)),
  token: String(row.token),
  platform: String(row.platform) as PushSubscriptionRecord["platform"],
  enabled: row.enabled === true,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const mapPickingTask = (row: PickingTaskRow): PickingTask => ({
  id: brand(String(row.id)),
  orderId: brand(String(row.order_id)),
  pickerId: brand(String(row.picker_id)),
  status: String(row.status) as PickingTaskStatus,
  assignedAt: toIso(row.assigned_at),
  ...(row.completed_at ? { completedAt: toIso(row.completed_at) } : {}),
});

const mapDeliveryTask = (row: DeliveryTaskRow): DeliveryTask => ({
  id: brand(String(row.id)),
  orderId: brand(String(row.order_id)),
  courierId: brand(String(row.courier_id)),
  status: String(row.status) as DeliveryTaskStatus,
  assignedAt: toIso(row.assigned_at),
  ...(row.delivered_at ? { deliveredAt: toIso(row.delivered_at) } : {}),
});

const toIso = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();

interface OtpChallengeRow extends Record<string, unknown> {
  readonly id: string;
  readonly phone_e164: string;
  readonly code_hash: string;
  readonly attempts: number;
  readonly expires_at: string | Date;
}

interface UserRow extends Record<string, unknown> {
  readonly id: string;
  readonly phone_e164: string;
  readonly full_name: string | null;
  readonly created_at: string | Date;
}

interface StaffRow extends Record<string, unknown> {
  readonly id?: string;
  readonly staff_id?: string | null;
  readonly user_id: string;
  readonly display_name: string | null;
  readonly roles: readonly string[] | null;
  readonly is_active: boolean | null;
}

interface AuthSessionRow extends StaffRow {
  readonly session_id: string;
  readonly device_session_id: string;
  readonly expires_at: string | Date;
  readonly phone_e164: string;
  readonly full_name: string | null;
  readonly user_created_at: string | Date;
}

interface RefreshTokenRow extends AuthSessionRow {
  readonly refresh_token_id: string;
}

interface CategoryRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sort_order: number;
  readonly is_active: boolean;
}

interface ProductRow extends Record<string, unknown> {
  readonly id: string;
  readonly category_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly unit: string;
  readonly image_url: string | null;
  readonly is_active: boolean;
}

interface ProductForSaleRow extends ProductRow {
  readonly customer_price_minor: number;
  readonly internal_cost_minor: number | null;
  readonly currency: string;
  readonly effective_from: string | Date;
  readonly is_available: boolean;
  readonly availability_note: string | null;
  readonly availability_updated_at: string | Date;
}

interface ProductPriceRow extends Record<string, unknown> {
  readonly product_id: string;
  readonly customer_price_minor: number;
  readonly internal_cost_minor: number | null;
  readonly currency: string;
  readonly effective_from: string | Date;
}

interface ProductAvailabilityRow extends Record<string, unknown> {
  readonly product_id: string;
  readonly is_available: boolean;
  readonly note: string | null;
  readonly updated_at: string | Date;
}

interface ExistsRow extends Record<string, unknown> {
  readonly exists: boolean;
}

interface CartItemRow extends ProductForSaleRow {
  readonly quantity: string | number;
}

interface OrderRow extends Record<string, unknown> {
  readonly id: string;
  readonly customer_id: string;
  readonly address_id: string;
  readonly status: string;
  readonly goods_total_minor: number;
  readonly delivery_fee_minor: number;
  readonly final_total_minor: number;
  readonly currency: string;
  readonly payment_id: string | null;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

interface OrderItemRow extends Record<string, unknown> {
  readonly id: string;
  readonly product_id: string;
  readonly product_name_snapshot: string;
  readonly unit_snapshot: string;
  readonly requested_quantity: string | number;
  readonly picked_quantity: string | number | null;
  readonly unit_price_minor: number;
  readonly currency: string;
  readonly status: string;
  readonly cancellation_reason: string | null;
}

interface PaymentRow extends Record<string, unknown> {
  readonly id: string;
  readonly order_id: string;
  readonly provider: string;
  readonly status: string;
  readonly authorized_amount_minor: number;
  readonly captured_amount_minor: number | null;
  readonly currency: string;
  readonly provider_payment_id: string | null;
  readonly provider_redirect_url: string | null;
  readonly provider_deeplink_url: string | null;
}

interface RefundRow extends Record<string, unknown> {
  readonly id: string;
  readonly payment_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly reason: string;
  readonly status: string;
}

interface AuditLogRow extends Record<string, unknown> {
  readonly id: string;
  readonly actor_user_id: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly metadata: unknown;
  readonly created_at: string | Date;
}

interface PushSubscriptionRow extends Record<string, unknown> {
  readonly user_id: string;
  readonly token: string;
  readonly platform: string;
  readonly enabled: boolean;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

interface PickingTaskRow extends Record<string, unknown> {
  readonly id: string;
  readonly order_id: string;
  readonly picker_id: string;
  readonly status: string;
  readonly assigned_at: string | Date;
  readonly completed_at: string | Date | null;
}

interface DeliveryTaskRow extends Record<string, unknown> {
  readonly id: string;
  readonly order_id: string;
  readonly courier_id: string;
  readonly status: string;
  readonly assigned_at: string | Date;
  readonly delivered_at: string | Date | null;
}

interface MetricsOrderRow extends Record<string, unknown> {
  readonly order_count: number;
  readonly final_total_minor: number;
  readonly delivery_fee_minor: number;
}
