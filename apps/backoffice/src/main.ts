import type {
  AuthSession,
  Category,
  DeliveryTask,
  MvpMetrics,
  Order,
  Payment,
  PaymentStatus,
  PickingTask,
  Product,
  ProductAvailability,
  ProductPrice,
  ProductUnit,
  Refund,
  StaffProfile,
  UserRole,
} from "@altyn-market/domain";
import { adminRoutes, type AdminModule } from "./modules.js";

type BackendState = "checking" | "online" | "offline";

interface CatalogProduct {
  readonly product: Product;
  readonly price: ProductPrice;
  readonly availability: ProductAvailability;
}

interface AuditLogEntry {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
}

interface AdminData {
  readonly orders: readonly Order[];
  readonly categories: readonly Category[];
  readonly products: readonly CatalogProduct[];
  readonly staff: readonly StaffProfile[];
  readonly payments: readonly Payment[];
  readonly refunds: readonly Refund[];
  readonly pickingTasks: readonly PickingTask[];
  readonly deliveryTasks: readonly DeliveryTask[];
  readonly metrics?: MvpMetrics;
  readonly auditLog: readonly AuditLogEntry[];
  readonly priceHistoryByProduct: Record<string, readonly ProductPrice[]>;
}

const root = document.querySelector<HTMLDivElement>("#root");
const apiBaseUrl =
  import.meta.env.PUBLIC_API_BASE_URL ??
  "https://altyn-market-api-stage-production.up.railway.app";
const sessionStorageKey = "altyn-market-admin-session";

let activeModule: AdminModule = "orders";
let backendState: BackendState = "checking";
let session: AuthSession | undefined = readStoredSession();
let loading = false;
let errorMessage: string | undefined;
let successMessage: string | undefined;
let authStep: "phone" | "code" = "phone";
let pendingPhone = "";
let devOtp: string | undefined;
let editingCategoryId: string | undefined;
let editingProductId: string | undefined;
let selectedPriceProductId: string | undefined;

let data: AdminData = emptyData();

const style = document.createElement("style");
style.textContent = `
  :root {
    color: #19211d;
    background: #f4f6f3;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 252px minmax(0, 1fr);
  }

  .sidebar {
    background: #ffffff;
    border-right: 1px solid #d8ded7;
    padding: 22px 16px;
  }

  .brand {
    margin-bottom: 24px;
  }

  .eyebrow {
    color: #66736a;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    margin: 0 0 7px;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    font-size: 23px;
    line-height: 1.14;
    margin-bottom: 0;
  }

  h2 {
    font-size: 24px;
    line-height: 1.15;
    margin-bottom: 0;
  }

  h3 {
    font-size: 16px;
    margin-bottom: 0;
  }

  .nav {
    display: grid;
    gap: 6px;
  }

  .nav button {
    width: 100%;
    min-height: 42px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #415049;
    padding: 9px 11px;
    text-align: left;
  }

  .nav button:hover,
  .nav button.active {
    border-color: #a9c3b6;
    background: #e9f2ed;
    color: #123726;
  }

  .main {
    min-width: 0;
    padding: 26px;
  }

  .topbar,
  .panel-head,
  .row-actions {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .topbar {
    margin-bottom: 18px;
  }

  .topbar-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .status {
    border: 1px solid #8bb3a3;
    border-radius: 999px;
    color: #1d5a42;
    min-height: 36px;
    padding: 7px 11px;
    white-space: nowrap;
  }

  .status.offline {
    border-color: #d49a91;
    color: #9b3b33;
  }

  .status.checking {
    border-color: #b2bac6;
    color: #4d5b70;
  }

  .primary,
  .secondary,
  .danger,
  .link-button {
    border-radius: 8px;
    min-height: 38px;
    padding: 8px 11px;
  }

  .primary {
    background: #245b43;
    border: 1px solid #245b43;
    color: #ffffff;
  }

  .secondary {
    background: #ffffff;
    border: 1px solid #cfd8d2;
    color: #22302a;
  }

  .danger {
    background: #fff7f6;
    border: 1px solid #dfaaa3;
    color: #97382f;
  }

  .link-button {
    background: transparent;
    border: 0;
    color: #255c86;
    font-weight: 800;
    min-height: 0;
    padding: 0;
  }

  .notice,
  .error {
    border-radius: 8px;
    margin-bottom: 14px;
    padding: 11px 13px;
  }

  .notice {
    background: #eef7f2;
    border: 1px solid #bbd8c8;
    color: #1c5b3e;
  }

  .error {
    background: #fff1ef;
    border: 1px solid #d99b92;
    color: #91372d;
  }

  .cards {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-bottom: 15px;
  }

  .metric,
  .panel {
    background: #ffffff;
    border: 1px solid #d8ded7;
    border-radius: 8px;
  }

  .metric {
    min-height: 90px;
    padding: 15px;
  }

  .metric span {
    color: #647168;
    display: block;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .metric strong {
    font-size: 24px;
  }

  .panel {
    margin-bottom: 14px;
    overflow: hidden;
  }

  .panel-head {
    border-bottom: 1px solid #e3e8e4;
    padding: 13px 15px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    min-width: 760px;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid #edf0ed;
    padding: 11px 13px;
    text-align: left;
    vertical-align: top;
  }

  th {
    color: #66736a;
    font-size: 13px;
    font-weight: 800;
  }

  tr:last-child td {
    border-bottom: 0;
  }

  .toolbar,
  .inline-form,
  .role-list {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .toolbar {
    margin-bottom: 14px;
  }

  .inline-form {
    align-items: flex-end;
  }

  .grid {
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  }

  .form {
    display: grid;
    gap: 11px;
    padding: 15px;
  }

  .field {
    display: grid;
    gap: 5px;
  }

  .field label,
  .check-field {
    color: #607068;
    font-size: 13px;
    font-weight: 800;
  }

  .check-field {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  input,
  select,
  textarea {
    background: #ffffff;
    border: 1px solid #ccd7d1;
    border-radius: 8px;
    color: #19211d;
    min-height: 38px;
    padding: 8px 10px;
    width: 100%;
  }

  textarea {
    min-height: 74px;
    resize: vertical;
  }

  input[type="checkbox"] {
    min-height: auto;
    width: auto;
  }

  .inline-form input,
  .inline-form select {
    width: auto;
  }

  .badge {
    border-radius: 999px;
    display: inline-block;
    font-size: 12px;
    font-weight: 800;
    padding: 5px 8px;
    white-space: nowrap;
  }

  .badge.ok {
    background: #e4f3ea;
    color: #1f6546;
  }

  .badge.warn {
    background: #fff3d7;
    color: #7d520d;
  }

  .badge.bad {
    background: #ffe7e3;
    color: #94352b;
  }

  .badge.neutral {
    background: #e9edf4;
    color: #3e4f68;
  }

  .thumb {
    aspect-ratio: 1;
    background: #eef2ef;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    object-fit: cover;
    width: 44px;
  }

  .muted {
    color: #68766e;
  }

  .auth-shell {
    align-items: center;
    display: grid;
    min-height: 100vh;
    padding: 24px;
  }

  .auth-card {
    background: #ffffff;
    border: 1px solid #d8ded7;
    border-radius: 8px;
    margin: 0 auto;
    max-width: 430px;
    overflow: hidden;
    width: 100%;
  }

  .auth-card .form {
    padding: 18px;
  }

  @media (max-width: 940px) {
    .shell,
    .grid {
      grid-template-columns: 1fr;
    }

    .sidebar {
      border-bottom: 1px solid #d8ded7;
      border-right: 0;
    }

    .nav {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }

    .topbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .topbar-actions {
      justify-content: flex-start;
    }
  }
`;
document.head.append(style);

if (root) {
  root.addEventListener("click", (event) => void handleClick(event));
  root.addEventListener("submit", (event) => void handleSubmit(event));
  render();
  void boot();
}

async function boot(): Promise<void> {
  await refreshBackendState(false);
  if (session) {
    await validateSession();
  }
  await refreshData();
}

function render(): void {
  if (!root) {
    return;
  }

  if (!session || !hasAdminAccess()) {
    root.innerHTML = renderAuth();
    return;
  }

  ensureAccessibleModule();
  const route = adminRoutes.find(
    (candidate) => candidate.module === activeModule,
  );
  root.innerHTML = `
    <main class="shell">
      <aside class="sidebar">
        <div class="brand">
          <p class="eyebrow">Backoffice</p>
          <h1>Altyn Market Admin</h1>
        </div>
        <nav class="nav" aria-label="Admin modules">
          ${adminRoutes
            .filter((candidate) => canAccess(candidate.requiredRole))
            .map(
              (candidate) => `
                <button type="button" data-action="module" data-module="${candidate.module}" class="${candidate.module === activeModule ? "active" : ""}">
                  ${escapeHtml(candidate.label)}
                </button>
              `,
            )
            .join("")}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">${escapeHtml(route?.path ?? "")}</p>
            <h2>${escapeHtml(route?.label ?? "Admin")}</h2>
          </div>
          <div class="topbar-actions">
            <button class="status ${backendState}" type="button" data-action="refresh-backend">${statusText()}</button>
            <button class="secondary" type="button" data-action="refresh-data">${loading ? "Loading..." : "Refresh"}</button>
            <button class="secondary" type="button" data-action="logout">Sign out</button>
          </div>
        </header>
        ${successMessage ? `<div class="notice">${escapeHtml(successMessage)}</div>` : ""}
        ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
        ${renderModule(activeModule)}
      </section>
    </main>
  `;
}

function renderAuth(): string {
  const noAccess = session && !hasAdminAccess();
  return `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Backoffice</p>
            <h1>Altyn Market Admin</h1>
          </div>
          <button class="status ${backendState}" type="button" data-action="refresh-backend">${statusText()}</button>
        </div>
        <div class="form">
          ${successMessage ? `<div class="notice">${escapeHtml(successMessage)}</div>` : ""}
          ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
          ${
            noAccess
              ? `
                <div class="error">This account does not have admin access.</div>
                <button class="secondary" type="button" data-action="logout">Sign out</button>
              `
              : authStep === "phone"
                ? `
                  <form class="form" data-action="request-otp">
                    <div class="field">
                      <label for="phone">Phone</label>
                      <input id="phone" name="phone" autocomplete="tel" placeholder="+77012345678" required />
                    </div>
                    <button class="primary" type="submit">Request code</button>
                  </form>
                `
                : `
                  <form class="form" data-action="verify-otp">
                    <div class="field">
                      <label for="code">Code for ${escapeHtml(pendingPhone)}</label>
                      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
                    </div>
                    ${devOtp ? `<div class="notice">Stage code: ${escapeHtml(devOtp)}</div>` : ""}
                    <button class="primary" type="submit">Sign in</button>
                    <button class="secondary" type="button" data-action="change-phone">Change phone</button>
                  </form>
                `
          }
        </div>
      </section>
    </main>
  `;
}

function renderModule(module: AdminModule): string {
  switch (module) {
    case "orders":
      return renderOrders();
    case "catalog":
      return renderCatalog();
    case "pricing":
      return renderPricing();
    case "staff":
      return renderStaff();
    case "payments":
      return renderPayments();
    case "delivery":
      return renderDelivery();
    case "metrics":
      return renderMetrics();
    case "audit-log":
      return renderAuditLog();
  }
}

function renderOrders(): string {
  const pending = data.orders.filter((order) =>
    ["payment_authorized", "awaiting_picking", "picking"].includes(
      order.status,
    ),
  ).length;
  const exceptions = data.orders.filter((order) =>
    ["payment_failed", "refund_required", "cancelled"].includes(order.status),
  ).length;
  return `
    <div class="cards">
      ${metric("Orders", String(data.orders.length))}
      ${metric("Needs picking", String(pending))}
      ${metric("Delivering", String(data.orders.filter((order) => order.status === "delivering").length))}
      ${metric("Exceptions", String(exceptions))}
    </div>
    ${table(
      ["Order", "Status", "Items", "Total", "Picker", "Courier"],
      data.orders.map((order) => [
        `<strong>${shortId(order.id)}</strong><br><span class="muted">${formatDate(order.createdAt)}</span>`,
        statusBadge(order.status),
        escapeHtml(
          order.items
            .map(
              (item) =>
                `${item.productNameSnapshot} x ${item.requestedQuantity}`,
            )
            .join(", "),
        ),
        formatMoney(order.finalTotal),
        assignmentForm(
          "assign-picker",
          order.id,
          "pickerId",
          pickers(),
          pickingOwner(order.id),
          "Assign",
        ),
        assignmentForm(
          "assign-courier",
          order.id,
          "courierId",
          couriers(),
          deliveryOwner(order.id),
          "Assign",
        ),
      ]),
    )}
  `;
}

function renderCatalog(): string {
  return `
    <div class="grid">
      <section>
        <div class="panel">
          <div class="panel-head">
            <h3>Products</h3>
            <button class="secondary" type="button" data-action="new-product">New product</button>
          </div>
          ${table(
            ["", "Product", "Category", "Unit", "Price", "State", ""],
            data.products.map(({ product, price, availability }) => [
              product.imageUrl
                ? `<img class="thumb" src="${escapeAttribute(product.imageUrl)}" alt="${escapeAttribute(product.name)}" />`
                : `<div class="thumb" aria-hidden="true"></div>`,
              `<strong>${escapeHtml(product.name)}</strong>${product.description ? `<br><span class="muted">${escapeHtml(product.description)}</span>` : ""}`,
              escapeHtml(categoryName(product.categoryId)),
              escapeHtml(product.unit),
              `${formatMoney(price.customerPrice)}<br><span class="muted">Cost ${price.internalCost ? formatMoney(price.internalCost) : "-"}</span>`,
              `${product.isActive ? badge("Active", "ok") : badge("Inactive", "bad")} ${availability.isAvailable ? badge("Available", "ok") : badge("Unavailable", "warn")}`,
              `<div class="row-actions">
                <button class="link-button" type="button" data-action="edit-product" data-product-id="${escapeAttribute(product.id)}">Edit</button>
                <button class="link-button" type="button" data-action="toggle-product-active" data-product-id="${escapeAttribute(product.id)}" data-active="${product.isActive ? "0" : "1"}">${product.isActive ? "Deactivate" : "Activate"}</button>
              </div>`,
            ]),
          )}
        </div>
        <div class="panel">
          <div class="panel-head">
            <h3>Categories</h3>
            <button class="secondary" type="button" data-action="new-category">New category</button>
          </div>
          ${table(
            ["Name", "Slug", "Sort", "State", ""],
            data.categories.map((category) => [
              escapeHtml(category.name),
              escapeHtml(category.slug),
              String(category.sortOrder),
              category.isActive
                ? badge("Active", "ok")
                : badge("Inactive", "bad"),
              `<div class="row-actions">
                <button class="link-button" type="button" data-action="edit-category" data-category-id="${escapeAttribute(category.id)}">Edit</button>
                <button class="link-button" type="button" data-action="toggle-category-active" data-category-id="${escapeAttribute(category.id)}" data-active="${category.isActive ? "0" : "1"}">${category.isActive ? "Deactivate" : "Activate"}</button>
              </div>`,
            ]),
          )}
        </div>
      </section>
      <section>
        ${renderProductForm()}
        ${renderCategoryForm()}
      </section>
    </div>
  `;
}

function renderProductForm(): string {
  const product = editingProductId
    ? data.products.find(
        (candidate) => candidate.product.id === editingProductId,
      )
    : undefined;
  const isEditing = Boolean(product);
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>${isEditing ? "Edit product" : "Add product"}</h3>
        ${isEditing ? `<button class="secondary" type="button" data-action="new-product">Cancel</button>` : ""}
      </div>
      <form class="form" data-action="${isEditing ? "update-product" : "create-product"}">
        ${product ? `<input type="hidden" name="productId" value="${escapeAttribute(product.product.id)}" />` : ""}
        <div class="field">
          <label>Name</label>
          <input name="name" value="${escapeAttribute(product?.product.name ?? "")}" required />
        </div>
        <div class="field">
          <label>Category</label>
          <select name="categoryId" required>
            ${data.categories
              .map(
                (category) => `
                  <option value="${escapeAttribute(category.id)}" ${category.id === product?.product.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>
                `,
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Unit</label>
          <select name="unit" required>
            ${productUnitOptions(product?.product.unit)}
          </select>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea name="description">${escapeHtml(product?.product.description ?? "")}</textarea>
        </div>
        <div class="field">
          <label>Image URL</label>
          <input name="imageUrl" value="${escapeAttribute(product?.product.imageUrl ?? "")}" />
        </div>
        ${
          isEditing
            ? ""
            : `
              <div class="field">
                <label>Customer price, KZT</label>
                <input name="customerPrice" type="number" min="0" step="1" required />
              </div>
              <div class="field">
                <label>Internal cost, KZT</label>
                <input name="internalCost" type="number" min="0" step="1" />
              </div>
            `
        }
        <label class="check-field"><input name="isActive" type="checkbox" ${(product?.product.isActive ?? true) ? "checked" : ""} /> Active</label>
        <label class="check-field"><input name="isAvailable" type="checkbox" ${(product?.availability.isAvailable ?? true) ? "checked" : ""} /> Available</label>
        <div class="field">
          <label>Availability note</label>
          <input name="availabilityNote" value="${escapeAttribute(product?.availability.note ?? "")}" />
        </div>
        <button class="primary" type="submit">${isEditing ? "Save product" : "Create product"}</button>
      </form>
    </section>
  `;
}

function renderCategoryForm(): string {
  const category = editingCategoryId
    ? data.categories.find((candidate) => candidate.id === editingCategoryId)
    : undefined;
  const isEditing = Boolean(category);
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>${isEditing ? "Edit category" : "Add category"}</h3>
        ${isEditing ? `<button class="secondary" type="button" data-action="new-category">Cancel</button>` : ""}
      </div>
      <form class="form" data-action="${isEditing ? "update-category" : "create-category"}">
        ${category ? `<input type="hidden" name="categoryId" value="${escapeAttribute(category.id)}" />` : ""}
        <div class="field">
          <label>Name</label>
          <input name="name" value="${escapeAttribute(category?.name ?? "")}" required />
        </div>
        <div class="field">
          <label>Slug</label>
          <input name="slug" value="${escapeAttribute(category?.slug ?? "")}" required />
        </div>
        <div class="field">
          <label>Sort order</label>
          <input name="sortOrder" type="number" step="1" value="${escapeAttribute(String(category?.sortOrder ?? 0))}" required />
        </div>
        <label class="check-field"><input name="isActive" type="checkbox" ${(category?.isActive ?? true) ? "checked" : ""} /> Active</label>
        <button class="primary" type="submit">${isEditing ? "Save category" : "Create category"}</button>
      </form>
    </section>
  `;
}

function renderPricing(): string {
  const selectedProduct = selectedPriceProductId
    ? data.products.find(
        (candidate) => candidate.product.id === selectedPriceProductId,
      )
    : undefined;
  const history =
    selectedPriceProductId === undefined
      ? []
      : (data.priceHistoryByProduct[selectedPriceProductId] ?? []);
  return `
    <div class="cards">
      ${metric("Priced products", String(data.products.length))}
      ${metric("Missing cost", String(data.products.filter((item) => !item.price.internalCost).length))}
      ${metric("Changed today", String(data.products.filter((item) => isToday(item.price.effectiveFrom)).length))}
    </div>
    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h3>Current prices</h3></div>
        ${table(
          ["Product", "Customer", "Cost", "Margin", ""],
          data.products.map(({ product, price }) => [
            `<strong>${escapeHtml(product.name)}</strong><br><span class="muted">${escapeHtml(product.unit)}</span>`,
            formatMoney(price.customerPrice),
            price.internalCost ? formatMoney(price.internalCost) : "-",
            formatMargin(price),
            `<form class="inline-form" data-action="save-price" id="price-${escapeAttribute(product.id)}">
              <input type="hidden" name="productId" value="${escapeAttribute(product.id)}" />
              <input name="customerPrice" type="number" min="0" step="1" value="${moneyInput(price.customerPrice)}" aria-label="Customer price" />
              <input name="internalCost" type="number" min="0" step="1" value="${price.internalCost ? moneyInput(price.internalCost) : ""}" aria-label="Internal cost" />
              <button class="primary" type="submit">Save</button>
              <button class="secondary" type="button" data-action="load-price-history" data-product-id="${escapeAttribute(product.id)}">History</button>
            </form>`,
          ]),
        )}
      </section>
      <section class="panel">
        <div class="panel-head"><h3>${selectedProduct ? escapeHtml(selectedProduct.product.name) : "Price history"}</h3></div>
        ${
          history.length === 0
            ? `<div class="form"><p class="muted">Select a product history.</p></div>`
            : table(
                ["Effective", "Customer", "Cost"],
                history.map((price) => [
                  formatDate(price.effectiveFrom),
                  formatMoney(price.customerPrice),
                  price.internalCost ? formatMoney(price.internalCost) : "-",
                ]),
              )
        }
      </section>
    </div>
  `;
}

function renderStaff(): string {
  return `
    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h3>Accounts</h3></div>
        ${table(
          ["Name", "Roles", "State", ""],
          data.staff.map((staff) => [
            `<strong>${escapeHtml(staff.displayName)}</strong><br><span class="muted">${shortId(staff.userId)}</span>`,
            staff.roles.map((role) => badge(role, "neutral")).join(" "),
            staff.isActive ? badge("Active", "ok") : badge("Inactive", "bad"),
            staff.isActive
              ? `<button class="link-button" type="button" data-action="deactivate-staff" data-staff-id="${escapeAttribute(staff.id)}">Deactivate</button>`
              : "",
          ]),
        )}
      </section>
      <section class="panel">
        <div class="panel-head"><h3>Create staff</h3></div>
        <form class="form" data-action="create-staff">
          <div class="field">
            <label>Display name</label>
            <input name="displayName" required />
          </div>
          <div class="field">
            <label>Phone</label>
            <input name="phone" placeholder="+77012345678" required />
          </div>
          <div class="role-list">
            ${["picker", "courier", "admin", "super_admin"]
              .map(
                (role) =>
                  `<label class="check-field"><input name="roles" type="checkbox" value="${role}" /> ${role}</label>`,
              )
              .join("")}
          </div>
          <button class="primary" type="submit">Create account</button>
        </form>
      </section>
    </div>
  `;
}

function renderPayments(): string {
  const failed = data.payments.filter((payment) =>
    ["capture_failed", "failed", "refund_pending"].includes(payment.status),
  ).length;
  return `
    <div class="cards">
      ${metric("Payments", String(data.payments.length))}
      ${metric("Refunds", String(data.refunds.length))}
      ${metric("Exceptions", String(failed))}
    </div>
    <section class="panel">
      <div class="panel-head"><h3>Payments</h3></div>
      ${table(
        ["Payment", "Order", "Status", "Authorized", "Captured", "Actions"],
        data.payments.map((payment) => [
          `<strong>${shortId(payment.id)}</strong><br><span class="muted">${escapeHtml(payment.provider)}</span>`,
          shortId(payment.orderId),
          paymentStatusSelect(payment),
          formatMoney(payment.authorizedAmount),
          payment.capturedAmount ? formatMoney(payment.capturedAmount) : "-",
          refundForm(payment),
        ]),
      )}
    </section>
    <section class="panel">
      <div class="panel-head"><h3>Refunds</h3></div>
      ${table(
        ["Refund", "Payment", "Amount", "Reason", "Status"],
        data.refunds.map((refund) => [
          shortId(refund.id),
          shortId(refund.paymentId),
          formatMoney(refund.amount),
          escapeHtml(refund.reason),
          statusBadge(refund.status),
        ]),
      )}
    </section>
  `;
}

function renderDelivery(): string {
  return `
    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h3>Picking tasks</h3></div>
        ${table(
          ["Task", "Order", "Picker", "Status", "Assigned"],
          data.pickingTasks.map((task) => [
            shortId(task.id),
            shortId(task.orderId),
            staffName(task.pickerId),
            statusBadge(task.status),
            formatDate(task.assignedAt),
          ]),
        )}
      </section>
      <section class="panel">
        <div class="panel-head"><h3>Courier tasks</h3></div>
        ${table(
          ["Task", "Order", "Courier", "Status"],
          data.deliveryTasks.map((task) => [
            shortId(task.id),
            shortId(task.orderId),
            staffName(task.courierId),
            deliveryStatusForm(task),
          ]),
        )}
      </section>
    </div>
  `;
}

function renderMetrics(): string {
  const metrics = data.metrics;
  const byStatus = countBy(data.orders.map((order) => order.status));
  return `
    <div class="cards">
      ${metric("Order count", String(metrics?.orderCount ?? 0))}
      ${metric("Average check", metrics ? formatMoney(metrics.averageCheck) : "0 KZT")}
      ${metric("Delivery revenue", metrics ? formatMoney(metrics.deliveryFeeRevenue) : "0 KZT")}
      ${metric("Refund amount", metrics ? formatMoney(metrics.refundAmount) : "0 KZT")}
      ${metric("Gross profit/order", metrics ? formatMoney(metrics.grossProfitPerOrder) : "0 KZT")}
    </div>
    <section class="panel">
      <div class="panel-head"><h3>Order statuses</h3></div>
      ${table(
        ["Status", "Orders"],
        Object.entries(byStatus).map(([status, count]) => [
          statusBadge(status),
          String(count),
        ]),
      )}
    </section>
  `;
}

function renderAuditLog(): string {
  return `
    <section class="panel">
      <div class="panel-head"><h3>Audit log</h3></div>
      ${table(
        ["When", "Actor", "Action", "Entity", "Metadata"],
        data.auditLog.map((entry) => [
          formatDate(entry.createdAt),
          shortId(entry.actorUserId),
          escapeHtml(entry.action),
          `${escapeHtml(entry.entityType)}<br><span class="muted">${shortId(entry.entityId)}</span>`,
          escapeHtml(JSON.stringify(entry.metadata ?? {})),
        ]),
      )}
    </section>
  `;
}

async function handleClick(event: Event): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;

  if (action === "module") {
    activeModule = button.dataset.module as AdminModule;
    successMessage = undefined;
    errorMessage = undefined;
    render();
    return;
  }

  if (action === "refresh-backend") {
    await refreshBackendState(true);
    return;
  }

  if (action === "refresh-data") {
    await refreshData();
    return;
  }

  if (action === "logout") {
    logout();
    return;
  }

  if (action === "change-phone") {
    authStep = "phone";
    pendingPhone = "";
    devOtp = undefined;
    render();
    return;
  }

  if (action === "new-product") {
    editingProductId = undefined;
    render();
    return;
  }

  if (action === "edit-product") {
    editingProductId = button.dataset.productId;
    render();
    return;
  }

  if (action === "new-category") {
    editingCategoryId = undefined;
    render();
    return;
  }

  if (action === "edit-category") {
    editingCategoryId = button.dataset.categoryId;
    render();
    return;
  }

  if (action === "toggle-product-active" && button.dataset.productId) {
    await runAction("Product updated.", async () => {
      await apiSend(`/api/admin/catalog/products/${button.dataset.productId}`, {
        method: "PATCH",
        body: { isActive: button.dataset.active === "1" },
      });
      await refreshData(false);
    });
    return;
  }

  if (action === "toggle-category-active" && button.dataset.categoryId) {
    await runAction("Category updated.", async () => {
      await apiSend(
        `/api/admin/catalog/categories/${button.dataset.categoryId}`,
        {
          method: "PATCH",
          body: { isActive: button.dataset.active === "1" },
        },
      );
      await refreshData(false);
    });
    return;
  }

  if (action === "load-price-history" && button.dataset.productId) {
    await loadPriceHistory(button.dataset.productId);
    return;
  }

  if (action === "deactivate-staff" && button.dataset.staffId) {
    await runAction("Staff deactivated.", async () => {
      await apiSend(`/api/admin/staff/${button.dataset.staffId}/deactivate`, {
        method: "POST",
      });
      await refreshData(false);
    });
  }
}

async function handleSubmit(event: Event): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  event.preventDefault();
  const action = form.dataset.action;

  if (action === "request-otp") {
    await requestOtp(form);
    return;
  }

  if (action === "verify-otp") {
    await verifyOtp(form);
    return;
  }

  if (action === "create-category" || action === "update-category") {
    await saveCategory(form, action === "update-category");
    return;
  }

  if (action === "create-product" || action === "update-product") {
    await saveProduct(form, action === "update-product");
    return;
  }

  if (action === "save-price") {
    await savePrice(form);
    return;
  }

  if (action === "assign-picker") {
    await assignStaff(form, "assign-picker", "pickerId");
    return;
  }

  if (action === "assign-courier") {
    await assignStaff(form, "assign-courier", "courierId");
    return;
  }

  if (action === "create-staff") {
    await createStaff(form);
    return;
  }

  if (action === "update-payment-status") {
    await updatePaymentStatus(form);
    return;
  }

  if (action === "create-refund") {
    await createRefund(form);
    return;
  }

  if (action === "update-delivery-status") {
    await updateDeliveryStatus(form);
  }
}

async function requestOtp(form: HTMLFormElement): Promise<void> {
  await runAction("Code requested.", async () => {
    pendingPhone = formText(form, "phone");
    const result = await apiSend<{ readonly devCode?: string }>(
      "/api/auth/request-otp",
      {
        method: "POST",
        body: { phone: pendingPhone },
        auth: false,
      },
    );
    devOtp = result.devCode;
    authStep = "code";
  });
}

async function verifyOtp(form: HTMLFormElement): Promise<void> {
  await runAction("Signed in.", async () => {
    const nextSession = await apiSend<AuthSession>("/api/auth/verify-otp", {
      method: "POST",
      body: {
        phone: pendingPhone,
        code: formText(form, "code"),
        deviceName: "Altyn Market Admin",
      },
      auth: false,
    });
    session = nextSession;
    storeSession(nextSession);
    authStep = "phone";
    devOtp = undefined;
    await refreshData(false);
  });
}

async function saveCategory(
  form: HTMLFormElement,
  isEditing: boolean,
): Promise<void> {
  await runAction(
    isEditing ? "Category saved." : "Category created.",
    async () => {
      const body = {
        name: formText(form, "name"),
        slug: formText(form, "slug"),
        sortOrder: formNumber(form, "sortOrder"),
        isActive: formCheckbox(form, "isActive"),
      };
      if (isEditing) {
        await apiSend(
          `/api/admin/catalog/categories/${formText(form, "categoryId")}`,
          {
            method: "PATCH",
            body,
          },
        );
      } else {
        await apiSend("/api/admin/catalog/categories", {
          method: "POST",
          body,
        });
      }
      editingCategoryId = undefined;
      await refreshData(false);
    },
  );
}

async function saveProduct(
  form: HTMLFormElement,
  isEditing: boolean,
): Promise<void> {
  await runAction(
    isEditing ? "Product saved." : "Product created.",
    async () => {
      const availability = {
        isAvailable: formCheckbox(form, "isAvailable"),
        note: formOptionalText(form, "availabilityNote"),
      };
      const productBody = {
        name: formText(form, "name"),
        categoryId: formText(form, "categoryId"),
        unit: formText(form, "unit"),
        description: formOptionalText(form, "description"),
        imageUrl: formOptionalText(form, "imageUrl"),
        isActive: formCheckbox(form, "isActive"),
        ...(!isEditing
          ? {
              customerPriceMinor: formMoneyMinor(form, "customerPrice"),
              internalCostMinor: formOptionalMoneyMinor(form, "internalCost"),
              isAvailable: availability.isAvailable,
              availabilityNote: availability.note,
            }
          : {}),
      };

      if (isEditing) {
        const productId = formText(form, "productId");
        await apiSend(`/api/admin/catalog/products/${productId}`, {
          method: "PATCH",
          body: productBody,
        });
        await apiSend(`/api/admin/catalog/products/${productId}/availability`, {
          method: "PATCH",
          body: availability,
        });
      } else {
        await apiSend("/api/admin/catalog/products", {
          method: "POST",
          body: productBody,
        });
      }
      editingProductId = undefined;
      await refreshData(false);
    },
  );
}

async function savePrice(form: HTMLFormElement): Promise<void> {
  await runAction("Price saved.", async () => {
    const productId = formText(form, "productId");
    await apiSend(`/api/admin/pricing/products/${productId}`, {
      method: "POST",
      body: {
        customerPriceMinor: formMoneyMinor(form, "customerPrice"),
        internalCostMinor: formOptionalMoneyMinor(form, "internalCost"),
      },
    });
    await refreshData(false);
    await loadPriceHistory(productId, false);
  });
}

async function assignStaff(
  form: HTMLFormElement,
  action: "assign-picker" | "assign-courier",
  fieldName: "pickerId" | "courierId",
): Promise<void> {
  await runAction("Assignment saved.", async () => {
    const orderId = formText(form, "orderId");
    await apiSend(`/api/admin/orders/${orderId}/${action}`, {
      method: "POST",
      body: { [fieldName]: formText(form, fieldName) },
    });
    await refreshData(false);
  });
}

async function createStaff(form: HTMLFormElement): Promise<void> {
  await runAction("Staff account created.", async () => {
    await apiSend("/api/admin/staff", {
      method: "POST",
      body: {
        displayName: formText(form, "displayName"),
        phone: formText(form, "phone"),
        roles: formRoles(form),
      },
    });
    await refreshData(false);
  });
}

async function updatePaymentStatus(form: HTMLFormElement): Promise<void> {
  await runAction("Payment status updated.", async () => {
    const paymentId = formText(form, "paymentId");
    await apiSend(`/api/admin/payments/${paymentId}/status`, {
      method: "PATCH",
      body: { status: formText(form, "status") },
    });
    await refreshData(false);
  });
}

async function createRefund(form: HTMLFormElement): Promise<void> {
  await runAction("Refund created.", async () => {
    const paymentId = formText(form, "paymentId");
    await apiSend(`/api/admin/payments/${paymentId}/refunds`, {
      method: "POST",
      body: {
        amountMinor: formMoneyMinor(form, "amount"),
        reason: formText(form, "reason"),
      },
    });
    await refreshData(false);
  });
}

async function updateDeliveryStatus(form: HTMLFormElement): Promise<void> {
  await runAction("Delivery status updated.", async () => {
    const orderId = formText(form, "orderId");
    await apiSend(`/api/delivery/orders/${orderId}/status`, {
      method: "POST",
      body: { status: formText(form, "status") },
    });
    await refreshData(false);
  });
}

async function refreshData(showLoading = true): Promise<void> {
  if (!session || !hasAdminAccess()) {
    render();
    return;
  }

  if (showLoading) {
    loading = true;
    render();
  }

  try {
    const [
      ordersResult,
      catalogResult,
      metricsResult,
      staffResult,
      paymentsResult,
      refundsResult,
      pickingResult,
      deliveryResult,
      auditResult,
    ] = await Promise.all([
      apiGet<{ readonly orders: readonly Order[] }>("/api/admin/orders"),
      apiGet<{
        readonly categories: readonly Category[];
        readonly products: readonly CatalogProduct[];
      }>("/api/admin/catalog"),
      apiGet<MvpMetrics>("/api/admin/metrics"),
      apiGet<{ readonly staff: readonly StaffProfile[] }>("/api/admin/staff"),
      apiGet<{ readonly payments: readonly Payment[] }>("/api/admin/payments"),
      apiGet<{ readonly refunds: readonly Refund[] }>("/api/admin/refunds"),
      apiGet<{ readonly tasks: readonly PickingTask[] }>("/api/picking/tasks"),
      apiGet<{ readonly tasks: readonly DeliveryTask[] }>(
        "/api/delivery/tasks",
      ),
      canAccess("super_admin")
        ? apiGet<{ readonly entries: readonly AuditLogEntry[] }>(
            "/api/admin/audit-log",
          )
        : Promise.resolve({ entries: [] }),
    ]);

    data = {
      ...data,
      orders: ordersResult.orders,
      categories: catalogResult.categories,
      products: catalogResult.products,
      metrics: metricsResult,
      staff: staffResult.staff,
      payments: paymentsResult.payments,
      refunds: refundsResult.refunds,
      pickingTasks: pickingResult.tasks,
      deliveryTasks: deliveryResult.tasks,
      auditLog: auditResult.entries,
    };
    selectedPriceProductId ??= data.products[0]?.product.id;
    errorMessage = undefined;
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Failed to load data.";
  } finally {
    loading = false;
    render();
  }
}

async function refreshBackendState(showMessage: boolean): Promise<void> {
  backendState = "checking";
  render();

  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    backendState = response.ok ? "online" : "offline";
    if (showMessage) {
      successMessage = response.ok ? "Backend online." : undefined;
      errorMessage = response.ok ? undefined : "Backend health check failed.";
    }
  } catch {
    backendState = "offline";
    if (showMessage) {
      errorMessage = "Backend is offline.";
    }
  }

  render();
}

async function validateSession(): Promise<void> {
  if (!session) {
    return;
  }

  try {
    const current = await apiGet<AuthSession>("/api/auth/me");
    session = {
      ...current,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
    storeSession(session);
  } catch {
    logout();
  }
}

async function loadPriceHistory(
  productId: string,
  showLoading = true,
): Promise<void> {
  await runAction(
    "History loaded.",
    async () => {
      selectedPriceProductId = productId;
      const result = await apiGet<{
        readonly history: readonly ProductPrice[];
      }>(`/api/admin/pricing/products/${productId}/history`);
      data = {
        ...data,
        priceHistoryByProduct: {
          ...data.priceHistoryByProduct,
          [productId]: result.history,
        },
      };
    },
    showLoading,
  );
}

async function runAction(
  message: string,
  action: () => Promise<void>,
  showLoading = true,
): Promise<void> {
  if (showLoading) {
    loading = true;
    render();
  }
  try {
    await action();
    successMessage = message;
    errorMessage = undefined;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Action failed.";
    successMessage = undefined;
  } finally {
    loading = false;
    render();
  }
}

async function apiGet<T>(path: string): Promise<T> {
  return apiSend<T>(path, { method: "GET" });
}

async function apiSend<T = unknown>(
  path: string,
  options: {
    readonly method: string;
    readonly body?: unknown;
    readonly auth?: boolean;
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth !== false && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  return payload as T;
}

function readErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Request failed.";
}

function emptyData(): AdminData {
  return {
    orders: [],
    categories: [],
    products: [],
    staff: [],
    payments: [],
    refunds: [],
    pickingTasks: [],
    deliveryTasks: [],
    auditLog: [],
    priceHistoryByProduct: {},
  };
}

function readStoredSession(): AuthSession | undefined {
  const raw = window.localStorage.getItem(sessionStorageKey);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(sessionStorageKey);
    return undefined;
  }
}

function storeSession(nextSession: AuthSession): void {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
}

function logout(): void {
  session = undefined;
  data = emptyData();
  authStep = "phone";
  pendingPhone = "";
  devOtp = undefined;
  window.localStorage.removeItem(sessionStorageKey);
  render();
}

function hasAdminAccess(): boolean {
  return canAccess("admin");
}

function canAccess(requiredRole: "admin" | "super_admin"): boolean {
  const roles = session?.roles ?? [];
  if (roles.includes("super_admin")) {
    return true;
  }
  return requiredRole === "admin" && roles.includes("admin");
}

function ensureAccessibleModule(): void {
  const currentRoute = adminRoutes.find(
    (route) => route.module === activeModule,
  );
  if (currentRoute && canAccess(currentRoute.requiredRole)) {
    return;
  }
  activeModule =
    adminRoutes.find((route) => canAccess(route.requiredRole))?.module ??
    "orders";
}

function statusText(): string {
  if (backendState === "checking") {
    return "Checking backend";
  }
  return backendState === "online" ? "Backend online" : "Backend offline";
}

function metric(labelText: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  if (rows.length === 0) {
    return `<div class="form"><p class="muted">No records.</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function assignmentForm(
  action: "assign-picker" | "assign-courier",
  orderId: string,
  fieldName: "pickerId" | "courierId",
  staffOptions: readonly StaffProfile[],
  currentName: string,
  buttonLabel: string,
): string {
  if (staffOptions.length === 0) {
    return `<span class="muted">${escapeHtml(currentName)}</span>`;
  }

  return `
    <form class="inline-form" data-action="${action}">
      <input type="hidden" name="orderId" value="${escapeAttribute(orderId)}" />
      <select name="${fieldName}" aria-label="${fieldName}">
        ${staffOptions
          .map(
            (staff) =>
              `<option value="${escapeAttribute(staff.id)}">${escapeHtml(staff.displayName)}</option>`,
          )
          .join("")}
      </select>
      <button class="secondary" type="submit">${escapeHtml(buttonLabel)}</button>
      <span class="muted">${escapeHtml(currentName)}</span>
    </form>
  `;
}

function paymentStatusSelect(payment: Payment): string {
  const statuses: readonly PaymentStatus[] = [
    "authorization_pending",
    "authorized",
    "authorization_cancelled",
    "capture_pending",
    "captured",
    "capture_failed",
    "refund_pending",
    "refunded",
    "failed",
  ];
  return `
    <form class="inline-form" data-action="update-payment-status">
      <input type="hidden" name="paymentId" value="${escapeAttribute(payment.id)}" />
      <select name="status">
        ${statuses
          .map(
            (status) =>
              `<option value="${status}" ${status === payment.status ? "selected" : ""}>${status}</option>`,
          )
          .join("")}
      </select>
      <button class="secondary" type="submit">Update</button>
    </form>
  `;
}

function refundForm(payment: Payment): string {
  return `
    <form class="inline-form" data-action="create-refund">
      <input type="hidden" name="paymentId" value="${escapeAttribute(payment.id)}" />
      <input name="amount" type="number" min="1" step="1" placeholder="KZT" aria-label="Refund amount" />
      <input name="reason" placeholder="Reason" aria-label="Refund reason" />
      <button class="danger" type="submit">Refund</button>
    </form>
  `;
}

function deliveryStatusForm(task: DeliveryTask): string {
  const statuses: readonly DeliveryTask["status"][] = [
    "assigned",
    "pickup_started",
    "picked_up",
    "delivering",
    "delivered",
    "cancelled",
  ];
  return `
    <form class="inline-form" data-action="update-delivery-status">
      <input type="hidden" name="orderId" value="${escapeAttribute(task.orderId)}" />
      <select name="status">
        ${statuses
          .map(
            (status) =>
              `<option value="${status}" ${status === task.status ? "selected" : ""}>${status}</option>`,
          )
          .join("")}
      </select>
      <button class="secondary" type="submit">Update</button>
    </form>
  `;
}

function productUnitOptions(selected?: ProductUnit): string {
  const units: readonly ProductUnit[] = ["kg", "g", "piece", "bundle", "box"];
  return units
    .map(
      (unit) =>
        `<option value="${unit}" ${unit === selected ? "selected" : ""}>${unit}</option>`,
    )
    .join("");
}

function pickers(): readonly StaffProfile[] {
  return data.staff.filter(
    (staff) => staff.isActive && staff.roles.includes("picker"),
  );
}

function couriers(): readonly StaffProfile[] {
  return data.staff.filter(
    (staff) => staff.isActive && staff.roles.includes("courier"),
  );
}

function pickingOwner(orderId: string): string {
  const task = data.pickingTasks.find(
    (candidate) => candidate.orderId === orderId,
  );
  return task ? staffName(task.pickerId) : "Unassigned";
}

function deliveryOwner(orderId: string): string {
  const task = data.deliveryTasks.find(
    (candidate) => candidate.orderId === orderId,
  );
  return task ? staffName(task.courierId) : "Unassigned";
}

function staffName(staffId: string): string {
  return (
    data.staff.find((staff) => staff.id === staffId)?.displayName ??
    shortId(staffId)
  );
}

function categoryName(categoryId: string): string {
  return (
    data.categories.find((category) => category.id === categoryId)?.name ??
    shortId(categoryId)
  );
}

function badge(
  labelText: string,
  tone: "ok" | "warn" | "bad" | "neutral",
): string {
  return `<span class="badge ${tone}">${escapeHtml(labelText)}</span>`;
}

function statusBadge(status: string): string {
  if (
    status.includes("failed") ||
    status === "cancelled" ||
    status === "refund_required"
  ) {
    return badge(status, "bad");
  }
  if (
    status.includes("pending") ||
    status.includes("awaiting") ||
    status.includes("authorized")
  ) {
    return badge(status, "warn");
  }
  if (
    status.includes("captured") ||
    status === "delivered" ||
    status === "completed" ||
    status === "refunded"
  ) {
    return badge(status, "ok");
  }
  return badge(status, "neutral");
}

function formatMoney(value: { readonly amountMinor: number }): string {
  return `${new Intl.NumberFormat("en-US").format(value.amountMinor / 100)} KZT`;
}

function moneyInput(value: { readonly amountMinor: number }): string {
  return String(Math.round(value.amountMinor / 100));
}

function formatMargin(price: ProductPrice): string {
  if (!price.internalCost || price.customerPrice.amountMinor === 0) {
    return "-";
  }
  const margin =
    ((price.customerPrice.amountMinor - price.internalCost.amountMinor) /
      price.customerPrice.amountMinor) *
    100;
  return `${Math.round(margin)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(value: string): string {
  return escapeHtml(value.length > 8 ? value.slice(0, 8) : value);
}

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}

function formText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function formOptionalText(
  form: HTMLFormElement,
  name: string,
): string | undefined {
  const value = new FormData(form).get(name);
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function formNumber(form: HTMLFormElement, name: string): number {
  const value = Number(formText(form, name));
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

function formMoneyMinor(form: HTMLFormElement, name: string): number {
  return Math.round(formNumber(form, name) * 100);
}

function formOptionalMoneyMinor(
  form: HTMLFormElement,
  name: string,
): number | undefined {
  const value = formOptionalText(form, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }
  return Math.round(parsed * 100);
}

function formCheckbox(form: HTMLFormElement, name: string): boolean {
  return (
    form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ??
    false
  );
}

function formRoles(
  form: HTMLFormElement,
): readonly Exclude<UserRole, "customer">[] {
  const roles = new FormData(form)
    .getAll("roles")
    .filter(
      (role): role is Exclude<UserRole, "customer"> =>
        role === "picker" ||
        role === "courier" ||
        role === "admin" ||
        role === "super_admin",
    );
  if (roles.length === 0) {
    throw new Error("At least one role is required.");
  }
  return roles;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value);
}
