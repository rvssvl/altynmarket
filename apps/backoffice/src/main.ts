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
const localeStorageKey = "altyn-market-admin-locale";

type AppLocale = "ru" | "kk" | "en";

interface CatalogDeleteTarget {
  readonly kind: "product" | "category";
  readonly id: string;
  readonly name: string;
}

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
let catalogModal: "product" | "category" | undefined;
let catalogDeleteTarget: CatalogDeleteTarget | undefined;
let locale: AppLocale = readStoredLocale();
let navOpen = false;

let data: AdminData = emptyData();

const style = document.createElement("style");
style.textContent = `
  :root {
    color: #16382c;
    background: #f8f5ec;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-synthesis: none;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 320px;
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

  button,
  input,
  select,
  textarea {
    -webkit-tap-highlight-color: transparent;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 272px minmax(0, 1fr);
  }

  .sidebar {
    align-self: stretch;
    background: #fffdf6;
    border-right: 1px solid #ded6bf;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 28px 18px 20px;
    position: sticky;
    top: 0;
  }

  .brand {
    border-bottom: 1px solid #e8e1cf;
    margin: 0 4px 24px;
    padding-bottom: 22px;
  }

  .brand-line {
    align-items: center;
    display: flex;
    gap: 9px;
    margin-bottom: 10px;
  }

  .brand-mark {
    align-items: center;
    background: #e4a536;
    border-radius: 50% 50% 46% 46%;
    color: #174e3c;
    display: inline-flex;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 22px;
    font-style: italic;
    font-weight: 700;
    height: 28px;
    justify-content: center;
    transform: rotate(-8deg);
    width: 28px;
  }

  .brand-name {
    color: #174e3c;
    font-size: 13px;
    font-weight: 850;
    letter-spacing: -.04em;
    text-transform: lowercase;
  }

  .eyebrow {
    color: #a77a27;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .09em;
    margin: 0 0 8px;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    color: #154e3b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -.055em;
    line-height: 1.04;
    margin-bottom: 0;
  }

  h2 {
    color: #154e3b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(29px, 3vw, 42px);
    font-weight: 500;
    letter-spacing: -.055em;
    line-height: 1;
    margin-bottom: 0;
  }

  h3 {
    color: #1c4637;
    font-size: 16px;
    letter-spacing: -.025em;
    margin-bottom: 0;
  }

  .nav {
    display: grid;
    gap: 5px;
  }

  .nav button {
    width: 100%;
    align-items: center;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: #496056;
    display: flex;
    font-size: 14px;
    font-weight: 700;
    min-height: 45px;
    padding: 10px 12px;
    text-align: left;
    transition: background .18s ease, color .18s ease, transform .18s ease;
  }

  .nav button:hover,
  .nav button.active {
    background: #e3ebd5;
    color: #154e3b;
  }

  .nav button:hover { transform: translateX(2px); }

  .nav button::before {
    background: #d68558;
    border-radius: 50%;
    content: "";
    height: 6px;
    margin-right: 10px;
    opacity: 0;
    width: 6px;
  }

  .nav button.active::before { opacity: 1; }

  .main {
    min-width: 0;
    padding: 32px clamp(20px, 3.2vw, 52px) 54px;
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
    gap: 20px;
    margin: 0 auto 26px;
    max-width: 1450px;
  }

  .topbar-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .menu-toggle { display: none; }

  .locale-toggle {
    background: #e7e1d3;
    border-radius: 999px;
    display: flex;
    gap: 2px;
    padding: 3px;
  }

  .locale-toggle button {
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: #597067;
    font-size: 11px;
    font-weight: 850;
    min-height: 30px;
    padding: 5px 9px;
  }

  .locale-toggle button.active {
    background: #174e3c;
    color: #fffdf4;
  }

  .status {
    background: #f8fbf5;
    border: 1px solid #9fc2a9;
    border-radius: 999px;
    color: #226043;
    font-size: 13px;
    font-weight: 750;
    min-height: 38px;
    padding: 8px 12px;
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
    border-radius: 10px;
    font-weight: 750;
    min-height: 40px;
    padding: 8px 13px;
    transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
  }

  .primary {
    background: #174e3c;
    border: 1px solid #174e3c;
    color: #fffdf4;
    box-shadow: 0 6px 14px #174e3c20;
  }

  .primary:hover { background: #0f3d2e; transform: translateY(-1px); }

  .secondary {
    background: #fffdf8;
    border: 1px solid #d8d6c5;
    color: #315c4c;
  }

  .secondary:hover { background: #f0eddf; }

  .danger {
    background: #fff0e8;
    border: 1px solid #e5ac91;
    color: #a84c37;
  }

  .link-button {
    background: transparent;
    border: 0;
    color: #b65a3e;
    font-weight: 800;
    min-height: 0;
    padding: 0;
  }

  .link-button.danger-link { color: #a84c37; }

  .notice,
  .error {
    border-radius: 12px;
    margin: 0 auto 16px;
    max-width: 1450px;
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
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
    margin: 0 auto 18px;
    max-width: 1450px;
  }

  .metric,
  .panel {
    background: #fffdf8;
    border: 1px solid #e0ddcb;
    border-radius: 16px;
    box-shadow: 0 10px 26px #294d3510;
  }

  .metric {
    min-height: 116px;
    overflow: hidden;
    padding: 17px;
    position: relative;
  }

  .metric::after {
    background: #e4a536;
    border-radius: 50%;
    content: "";
    height: 50px;
    opacity: .18;
    position: absolute;
    right: -15px;
    top: -20px;
    width: 50px;
  }

  .metric span {
    color: #69796d;
    display: block;
    font-size: 13px;
    font-weight: 650;
    margin-bottom: 8px;
  }

  .metric strong {
    color: #174e3c;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 31px;
    font-weight: 500;
    letter-spacing: -.04em;
  }

  .panel {
    margin-bottom: 18px;
    overflow: hidden;
  }

  .module-content { margin: 0 auto; max-width: 1450px; }

  .panel-head {
    border-bottom: 1px solid #ebe6d8;
    min-height: 64px;
    padding: 14px 18px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    min-width: 700px;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid #f0ede3;
    padding: 14px 18px;
    text-align: left;
    vertical-align: top;
  }

  th {
    color: #768176;
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
    gap: 18px;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, .75fr);
    margin: 0 auto;
    max-width: 1450px;
  }

  .catalog-layout {
    display: grid;
    gap: 18px;
  }

  .catalog-panel {
    width: 100%;
  }

  .catalog-panel table {
    min-width: 920px;
    table-layout: fixed;
  }

  .catalog-panel th:nth-child(1),
  .catalog-panel td:nth-child(1) { width: 74px; }
  .catalog-panel th:nth-child(2),
  .catalog-panel td:nth-child(2) { width: 27%; }
  .catalog-panel th:nth-child(3),
  .catalog-panel td:nth-child(3) { width: 14%; }
  .catalog-panel th:nth-child(4),
  .catalog-panel td:nth-child(4) { width: 10%; }
  .catalog-panel th:nth-child(5),
  .catalog-panel td:nth-child(5) { width: 17%; }
  .catalog-panel th:nth-child(6),
  .catalog-panel td:nth-child(6) { width: 15%; }
  .catalog-panel th:nth-child(7),
  .catalog-panel td:nth-child(7) { width: 17%; }

  .catalog-panel .row-actions {
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
  }

  .modal-overlay {
    align-items: center;
    background: #16382c73;
    backdrop-filter: blur(5px);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 20px;
    position: fixed;
    z-index: 50;
  }

  .modal {
    background: #fffdf8;
    border: 1px solid #e0ddcb;
    border-radius: 18px;
    box-shadow: 0 28px 90px #0f281e58;
    max-height: calc(100vh - 40px);
    max-width: 760px;
    overflow: auto;
    width: 100%;
  }

  .modal-head {
    align-items: flex-start;
    border-bottom: 1px solid #ebe6d8;
    display: flex;
    gap: 16px;
    justify-content: space-between;
    padding: 18px 20px;
  }

  .modal-head h3 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -.045em;
    margin: 0;
  }

  .confirmation-content {
    display: grid;
    gap: 14px;
    padding: 20px;
  }

  .confirmation-content p {
    color: #52675d;
    line-height: 1.55;
    margin: 0;
  }

  .confirmation-content strong { color: #16382c; }

  .confirmation-content .error { margin: 0; }

  .catalog-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .catalog-form .full,
  .catalog-form .form-actions {
    grid-column: 1 / -1;
  }

  .check-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }

  .form-actions {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .audit-details {
    display: grid;
    gap: 5px;
  }

  .audit-detail {
    color: #4d6559;
    font-size: 12px;
    line-height: 1.45;
  }

  .audit-detail-label {
    color: #79857b;
    display: inline-block;
    font-weight: 800;
    margin-right: 6px;
  }

  .form {
    display: grid;
    gap: 13px;
    padding: 18px;
  }

  .field {
    display: grid;
    gap: 5px;
  }

  .field label,
  .check-field {
    color: #617166;
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
    background: #fffefa;
    border: 1px solid #d8d8c9;
    border-radius: 10px;
    color: #16382c;
    min-height: 42px;
    padding: 9px 11px;
    transition: border .18s ease, box-shadow .18s ease;
    width: 100%;
  }

  input:focus,
  select:focus,
  textarea:focus { border-color: #779d69; box-shadow: 0 0 0 3px #dce6cc; outline: 0; }

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
    padding: 5px 9px;
    white-space: nowrap;
  }

  .badge.ok {
    background: #e1edcf;
    color: #3c713f;
  }

  .badge.warn {
    background: #fff0cf;
    color: #8d5a0a;
  }

  .badge.bad {
    background: #fce1d5;
    color: #a24937;
  }

  .badge.neutral {
    background: #e8e5d4;
    color: #586656;
  }

  .thumb {
    aspect-ratio: 1;
    background: #eef0df;
    border: 1px solid #d9dfc9;
    border-radius: 10px;
    object-fit: cover;
    width: 44px;
  }

  .muted {
    color: #718076;
  }

  .dashboard-intro {
    align-items: end;
    background: #174e3c;
    border-radius: 18px;
    color: #fffdf4;
    display: flex;
    gap: 24px;
    justify-content: space-between;
    margin: 0 auto 18px;
    max-width: 1450px;
    overflow: hidden;
    padding: 24px;
    position: relative;
  }

  .dashboard-intro::after {
    background: #e4a536;
    border-radius: 50%;
    content: "";
    height: 240px;
    opacity: .32;
    position: absolute;
    right: -70px;
    top: -145px;
    width: 240px;
  }

  .dashboard-intro h3 { color: #fffdf4; font-family: Georgia, "Times New Roman", serif; font-size: 28px; font-weight: 500; letter-spacing: -.04em; margin: 0 0 8px; }
  .dashboard-intro p { color: #c9d9c8; line-height: 1.55; margin: 0; max-width: 650px; position: relative; z-index: 1; }
  .dashboard-date { color: #f4d48f; font-size: 12px; font-weight: 800; letter-spacing: .08em; position: relative; text-transform: uppercase; white-space: nowrap; z-index: 1; }

  .dashboard-grid { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); margin: 0 auto; max-width: 1450px; }
  .chart { padding: 18px; }
  .chart-title { align-items: baseline; display: flex; justify-content: space-between; margin-bottom: 18px; }
  .chart-title h3 { margin: 0; }
  .chart-title span { color: #718076; font-size: 12px; }
  .bar-chart { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(7, minmax(0, 1fr)); min-height: 176px; padding-top: 14px; }
  .bar-column { align-items: center; display: flex; flex-direction: column; height: 166px; justify-content: end; min-width: 0; }
  .bar-value { color: #597067; font-size: 11px; font-weight: 750; margin-bottom: 7px; }
  .bar { background: linear-gradient(180deg, #e4a536 0%, #d77750 100%); border-radius: 9px 9px 3px 3px; min-height: 4px; transition: height .2s ease; width: min(100%, 44px); }
  .bar-label { color: #758278; font-size: 10px; margin-top: 8px; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
  .status-list { display: grid; gap: 12px; }
  .status-row { display: grid; gap: 7px; grid-template-columns: minmax(0, 1fr) auto; }
  .status-row strong { color: #315c4c; font-size: 13px; font-weight: 750; }
  .status-track { background: #eeeadd; border-radius: 999px; grid-column: 1 / -1; height: 8px; overflow: hidden; }
  .status-fill { background: #78a35f; border-radius: inherit; height: 100%; min-width: 0; }
  .empty-chart { color: #718076; font-size: 13px; padding: 38px 0 24px; text-align: center; }

  .auth-shell {
    align-items: center;
    background: radial-gradient(circle at 75% 14%, #e8c86f90 0 8%, transparent 8.2%), #f5efdf;
    display: grid;
    min-height: 100vh;
    padding: 24px;
  }

  .auth-card {
    background: #fffdf8;
    border: 1px solid #e0ddcb;
    border-radius: 18px;
    box-shadow: 0 18px 60px #304b3020;
    margin: 0 auto;
    max-width: 430px;
    overflow: hidden;
    width: 100%;
  }

  .auth-card .form {
    padding: 20px;
  }

  @media (max-width: 1050px) {
    .shell { grid-template-columns: 236px minmax(0, 1fr); }
    .sidebar { padding-left: 14px; padding-right: 14px; }
    .main { padding-left: 24px; padding-right: 24px; }
    .grid, .dashboard-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 760px) {
    .shell { display: block; }

    .sidebar {
      box-shadow: 15px 0 45px #19392b24;
      display: none;
      left: 0;
      max-width: 286px;
      padding-top: 22px;
      position: fixed;
      top: 0;
      width: 82vw;
      z-index: 20;
    }

    .sidebar.open { display: flex; }

    .sidebar.open::after { background: #16382c52; content: ""; height: 100vh; left: 100%; position: absolute; top: 0; width: 100vw; z-index: -1; }

    .main { padding: 20px 16px 34px; }

    .topbar {
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 20px;
    }

    .topbar-actions {
      justify-content: flex-start;
      width: 100%;
    }

    .menu-toggle { align-items: center; background: #174e3c; border: 0; border-radius: 10px; color: #fffdf4; display: inline-flex; font-size: 18px; height: 40px; justify-content: center; margin-bottom: 11px; padding: 0; width: 40px; }
    h2 { font-size: 32px; }
    .status { padding-left: 10px; padding-right: 10px; }
    .dashboard-intro { align-items: flex-start; flex-direction: column; padding: 20px; }
    .dashboard-intro h3 { font-size: 25px; }
    .cards { gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .metric { min-height: 104px; padding: 14px; }
    .metric strong { font-size: 27px; }
    .panel-head { min-height: 58px; padding: 13px 15px; }
    .form, .chart { padding: 15px; }
    .modal-overlay { align-items: flex-end; padding: 0; }
    .modal { border-bottom-left-radius: 0; border-bottom-right-radius: 0; max-height: min(88vh, 760px); }
    .modal-head { padding: 16px; }
    .catalog-form { grid-template-columns: 1fr; }
    .catalog-form .full, .catalog-form .form-actions { grid-column: auto; }
    .table-wrap { overflow: visible; }
    table, tbody, tr, td { display: block; min-width: 0; width: 100%; }
    thead { display: none; }
    tr { border-bottom: 1px solid #ebe6d8; display: grid; gap: 8px; padding: 15px; }
    tr:last-child { border-bottom: 0; }
    td { align-items: start; border: 0; display: grid; gap: 12px; grid-template-columns: 92px minmax(0, 1fr); padding: 0; }
    td::before { color: #7b877d; content: attr(data-label); font-size: 11px; font-weight: 800; line-height: 1.45; text-transform: uppercase; }
    td[data-label=""] { display: block; }
    td[data-label=""]::before { display: none; }
    .row-actions { justify-content: flex-start; }
    .inline-form { align-items: stretch; }
    .inline-form input, .inline-form select { flex: 1 1 120px; min-width: 0; width: 100%; }
    .catalog-panel table { min-width: 0; table-layout: auto; }
  }

  @media (max-width: 430px) {
    .topbar-actions { gap: 6px; }
    .topbar-actions > .secondary, .topbar-actions > .status { font-size: 12px; }
    .cards { grid-template-columns: 1fr 1fr; }
    .metric span { font-size: 12px; }
    .dashboard-date { white-space: normal; }
    td { grid-template-columns: 78px minmax(0, 1fr); }
  }
`;
document.head.append(style);

const translations: Record<AppLocale, Readonly<Record<string, string>>> = {
  en: {},
  ru: {
    Backoffice: "Бэкофис",
    Language: "Язык",
    "Admin navigation": "Навигация бэкофиса",
    Menu: "Меню",
    Admin: "Админка",
    Refresh: "Обновить",
    "Loading...": "Загрузка...",
    "Sign out": "Выйти",
    "Checking backend": "Проверяем сервер",
    "Backend online": "Сервер доступен",
    "Backend offline": "Сервер недоступен",
    "This account does not have admin access.":
      "У этой учётной записи нет доступа к бэкофису.",
    Phone: "Телефон",
    "Request code": "Получить код",
    "Code for": "Код для",
    "Stage code:": "Тестовый код:",
    "Sign in": "Войти",
    "Change phone": "Изменить номер",
    Orders: "Заказы",
    Catalog: "Каталог",
    Pricing: "Цены",
    Staff: "Команда",
    Payments: "Платежи",
    Delivery: "Доставка",
    Metrics: "Метрики",
    "Audit Log": "Журнал действий",
    "Operations overview": "Операционный центр",
    "Live view of orders, picking and delivery.":
      "Актуальная картина заказов, сборки и доставки.",
    Today: "Сегодня",
    "Orders today": "Заказов сегодня",
    "Needs picking": "Нужно собрать",
    Delivering: "В доставке",
    Exceptions: "Проблемы",
    "Orders for 7 days": "Заказы за 7 дней",
    "Daily order flow": "Динамика заказов по дням",
    "Order statuses": "Статусы заказов",
    "Current distribution": "Текущее распределение",
    "No orders in this period yet.": "За этот период заказов пока нет.",
    "No active order statuses yet.": "Активных статусов пока нет.",
    payment_authorized: "Оплата подтверждена",
    payment_captured: "Оплата списана",
    awaiting_picking: "Ожидает сборки",
    awaiting_courier: "Ожидает курьера",
    picking: "Собирается",
    picked: "Собран",
    pending: "Ожидает",
    ready_for_delivery: "Готов к доставке",
    delivering: "В доставке",
    delivered: "Доставлен",
    payment_failed: "Ошибка оплаты",
    refund_required: "Нужен возврат",
    cancelled: "Отменён",
    authorization_pending: "Авторизация ожидается",
    authorized: "Авторизован",
    authorization_cancelled: "Авторизация отменена",
    capture_pending: "Списание ожидается",
    captured: "Списан",
    capture_failed: "Ошибка списания",
    refund_pending: "Возврат ожидается",
    refunded: "Возвращён",
    failed: "Ошибка",
    assigned: "Назначен",
    pickup_started: "Забор начат",
    picked_up: "Забран",
    completed: "Завершён",
    piece: "шт.",
    bundle: "пучок",
    box: "коробка",
    "No records.": "Нет данных.",
    Products: "Товары",
    "New product": "Новый товар",
    Product: "Товар",
    Category: "Категория",
    Unit: "Единица",
    Price: "Цена",
    State: "Статус",
    Cost: "Себестоимость",
    Active: "Активен",
    Inactive: "Неактивен",
    Available: "В наличии",
    Unavailable: "Нет в наличии",
    Edit: "Изменить",
    Deactivate: "Отключить",
    Activate: "Включить",
    Delete: "Удалить",
    "Delete product": "Удалить товар",
    "Delete category": "Удалить категорию",
    "Delete this product permanently?": "Удалить товар безвозвратно?",
    "Delete this category permanently?": "Удалить категорию безвозвратно?",
    "This action cannot be undone.": "Это действие нельзя отменить.",
    "Product deleted.": "Товар удалён.",
    "Category deleted.": "Категория удалена.",
    "A product with order history cannot be deleted. Deactivate it instead.":
      "Товар из истории заказов нельзя удалить. Отключите его вместо этого.",
    "A category with products cannot be deleted. Move or delete its products first.":
      "Категорию с товарами нельзя удалить. Сначала перенесите или удалите товары.",
    Categories: "Категории",
    "New category": "Новая категория",
    "Add product": "Добавить товар",
    "Edit product": "Изменить товар",
    Cancel: "Отменить",
    Close: "Закрыть",
    Name: "Название",
    Description: "Описание",
    "Image URL": "Ссылка на изображение",
    "Customer price, KZT": "Цена для клиента, KZT",
    "Internal cost, KZT": "Себестоимость, KZT",
    "Availability note": "Комментарий о наличии",
    "Save product": "Сохранить товар",
    "Create product": "Создать товар",
    "Add category": "Добавить категорию",
    "Edit category": "Изменить категорию",
    Slug: "Слаг",
    "Sort order": "Порядок сортировки",
    "Save category": "Сохранить категорию",
    "Create category": "Создать категорию",
    "Priced products": "Товаров с ценой",
    "Missing cost": "Без себестоимости",
    "Changed today": "Изменено сегодня",
    "Current prices": "Текущие цены",
    Customer: "Клиент",
    Margin: "Маржа",
    Save: "Сохранить",
    History: "История",
    "Price history": "История цен",
    "Select a product history.": "Выберите товар, чтобы увидеть историю цен.",
    Accounts: "Учётные записи",
    Roles: "Роли",
    "Create staff": "Добавить сотрудника",
    "Display name": "Имя сотрудника",
    "Create account": "Создать учётную запись",
    Refunds: "Возвраты",
    Payment: "Платёж",
    Status: "Статус",
    Authorized: "Авторизовано",
    Captured: "Списано",
    Actions: "Действия",
    Refund: "Возврат",
    Amount: "Сумма",
    Reason: "Причина",
    "Picking tasks": "Задачи сборки",
    "Courier tasks": "Задачи курьера",
    Task: "Задача",
    Order: "Заказ",
    Picker: "Сборщик",
    Courier: "Курьер",
    Assigned: "Назначено",
    "Order count": "Всего заказов",
    "Average check": "Средний чек",
    "Delivery revenue": "Выручка доставки",
    "Refund amount": "Сумма возвратов",
    "Gross profit/order": "Валовая прибыль / заказ",
    "Audit log": "Журнал действий",
    When: "Когда",
    Actor: "Кто",
    Action: "Действие",
    Entity: "Объект",
    Metadata: "Детали",
    Assign: "Назначить",
    Update: "Обновить",
    "Refund reason": "Причина возврата",
    "Issue refund": "Вернуть",
    Unassigned: "Не назначен",
  },
  kk: {
    Backoffice: "Басқару панелі",
    Language: "Тіл",
    "Admin navigation": "Басқару навигациясы",
    Menu: "Мәзір",
    Admin: "Басқару",
    Refresh: "Жаңарту",
    "Loading...": "Жүктелуде...",
    "Sign out": "Шығу",
    "Checking backend": "Сервер тексерілуде",
    "Backend online": "Сервер қолжетімді",
    "Backend offline": "Сервер қолжетімсіз",
    "This account does not have admin access.":
      "Бұл аккаунтта басқару панеліне кіру құқығы жоқ.",
    Phone: "Телефон",
    "Request code": "Код алу",
    "Code for": "Код",
    "Stage code:": "Тест коды:",
    "Sign in": "Кіру",
    "Change phone": "Нөмірді өзгерту",
    Orders: "Тапсырыстар",
    Catalog: "Каталог",
    Pricing: "Бағалар",
    Staff: "Команда",
    Payments: "Төлемдер",
    Delivery: "Жеткізу",
    Metrics: "Көрсеткіштер",
    "Audit Log": "Әрекеттер журналы",
    "Operations overview": "Операциялық орталық",
    "Live view of orders, picking and delivery.":
      "Тапсырыстар, жинақтау және жеткізу бойынша өзекті көрініс.",
    Today: "Бүгін",
    "Orders today": "Бүгінгі тапсырыстар",
    "Needs picking": "Жинақтау керек",
    Delivering: "Жеткізілуде",
    Exceptions: "Мәселелер",
    "Orders for 7 days": "7 күндегі тапсырыстар",
    "Daily order flow": "Күнделікті тапсырыс динамикасы",
    "Order statuses": "Тапсырыс мәртебелері",
    "Current distribution": "Ағымдағы үлестірім",
    "No orders in this period yet.": "Бұл кезеңде әлі тапсырыс жоқ.",
    "No active order statuses yet.": "Белсенді мәртебелер әлі жоқ.",
    payment_authorized: "Төлем расталды",
    payment_captured: "Төлем алынды",
    awaiting_picking: "Жинақтауды күтуде",
    awaiting_courier: "Курьерді күтуде",
    picking: "Жинақталуда",
    picked: "Жиналды",
    pending: "Күтуде",
    ready_for_delivery: "Жеткізуге дайын",
    delivering: "Жеткізілуде",
    delivered: "Жеткізілді",
    payment_failed: "Төлем қатесі",
    refund_required: "Қайтарым қажет",
    cancelled: "Бас тартылды",
    authorization_pending: "Авторизация күтілуде",
    authorized: "Авторизацияланды",
    authorization_cancelled: "Авторизация жойылды",
    capture_pending: "Шегеру күтілуде",
    captured: "Шегерілді",
    capture_failed: "Шегеру қатесі",
    refund_pending: "Қайтарым күтілуде",
    refunded: "Қайтарылды",
    failed: "Қате",
    assigned: "Тағайындалды",
    pickup_started: "Алып кету басталды",
    picked_up: "Алып кетілді",
    completed: "Аяқталды",
    piece: "дана",
    bundle: "бума",
    box: "қорап",
    "No records.": "Дерек жоқ.",
    Products: "Тауарлар",
    "New product": "Жаңа тауар",
    Product: "Тауар",
    Category: "Санат",
    Unit: "Өлшем",
    Price: "Баға",
    State: "Күйі",
    Cost: "Өзіндік құн",
    Active: "Белсенді",
    Inactive: "Белсенді емес",
    Available: "Бар",
    Unavailable: "Жоқ",
    Edit: "Өзгерту",
    Deactivate: "Өшіру",
    Activate: "Қосу",
    Delete: "Жою",
    "Delete product": "Тауарды жою",
    "Delete category": "Санатты жою",
    "Delete this product permanently?": "Тауарды біржола жою керек пе?",
    "Delete this category permanently?": "Санатты біржола жою керек пе?",
    "This action cannot be undone.": "Бұл әрекетті қайтару мүмкін емес.",
    "Product deleted.": "Тауар жойылды.",
    "Category deleted.": "Санат жойылды.",
    "A product with order history cannot be deleted. Deactivate it instead.":
      "Тапсырыс тарихы бар тауарды жоюға болмайды. Оның орнына өшіріңіз.",
    "A category with products cannot be deleted. Move or delete its products first.":
      "Тауарлары бар санатты жоюға болмайды. Алдымен тауарларды ауыстырыңыз немесе жойыңыз.",
    Categories: "Санаттар",
    "New category": "Жаңа санат",
    "Add product": "Тауар қосу",
    "Edit product": "Тауарды өзгерту",
    Cancel: "Бас тарту",
    Close: "Жабу",
    Name: "Атауы",
    Description: "Сипаттама",
    "Image URL": "Сурет сілтемесі",
    "Customer price, KZT": "Клиент бағасы, KZT",
    "Internal cost, KZT": "Өзіндік құны, KZT",
    "Availability note": "Қолжетімділік ескертпесі",
    "Save product": "Тауарды сақтау",
    "Create product": "Тауар құру",
    "Add category": "Санат қосу",
    "Edit category": "Санатты өзгерту",
    Slug: "Слаг",
    "Sort order": "Сұрыптау реті",
    "Save category": "Санатты сақтау",
    "Create category": "Санат құру",
    "Priced products": "Бағасы бар тауарлар",
    "Missing cost": "Өзіндік құны жоқ",
    "Changed today": "Бүгін өзгертілген",
    "Current prices": "Қазіргі бағалар",
    Customer: "Клиент",
    Margin: "Маржа",
    Save: "Сақтау",
    History: "Тарих",
    "Price history": "Баға тарихы",
    "Select a product history.": "Баға тарихын көру үшін тауарды таңдаңыз.",
    Accounts: "Аккаунттар",
    Roles: "Рөлдер",
    "Create staff": "Қызметкер қосу",
    "Display name": "Қызметкер аты",
    "Create account": "Аккаунт құру",
    Refunds: "Қайтарымдар",
    Payment: "Төлем",
    Status: "Мәртебе",
    Authorized: "Авторизацияланған",
    Captured: "Алынған",
    Actions: "Әрекеттер",
    Refund: "Қайтару",
    Amount: "Сома",
    Reason: "Себеп",
    "Picking tasks": "Жинақтау міндеттері",
    "Courier tasks": "Курьер міндеттері",
    Task: "Міндет",
    Order: "Тапсырыс",
    Picker: "Жинаушы",
    Courier: "Курьер",
    Assigned: "Тағайындалды",
    "Order count": "Барлық тапсырыс",
    "Average check": "Орташа чек",
    "Delivery revenue": "Жеткізу түсімі",
    "Refund amount": "Қайтарым сомасы",
    "Gross profit/order": "Жалпы пайда / тапсырыс",
    "Audit log": "Әрекеттер журналы",
    When: "Қашан",
    Actor: "Кім",
    Action: "Әрекет",
    Entity: "Нысан",
    Metadata: "Деректер",
    Assign: "Тағайындау",
    Update: "Жаңарту",
    "Refund reason": "Қайтару себебі",
    "Issue refund": "Қайтару",
    Unassigned: "Тағайындалмаған",
  },
};

const auditActionLabels: Record<AppLocale, Readonly<Record<string, string>>> = {
  en: {
    "admin.category_create": "Category created",
    "admin.category_update": "Category updated",
    "admin.category_delete": "Category deleted",
    "admin.product_create": "Product created",
    "admin.product_update": "Product updated",
    "admin.product_delete": "Product deleted",
    "admin.product_availability_update": "Availability updated",
    "admin.product_price_update": "Product price updated",
    "admin.assign_picker": "Picker assigned",
    "admin.assign_courier": "Courier assigned",
    "admin.staff_create": "Staff account created",
    "admin.staff_deactivate": "Staff account deactivated",
    "admin.payment_refund": "Refund created",
    "admin.payment_status_update": "Payment status updated",
    "picking.start": "Picking started",
    "picking.item_picked": "Item picked",
    "picking.complete": "Picking completed",
    "picking.item_cancelled": "Item cancelled",
    "delivery.status_update": "Delivery status updated",
    "customer.push_token_registered": "Push notifications enabled",
  },
  ru: {
    "admin.category_create": "Создана категория",
    "admin.category_update": "Изменена категория",
    "admin.category_delete": "Удалена категория",
    "admin.product_create": "Создан товар",
    "admin.product_update": "Изменён товар",
    "admin.product_delete": "Удалён товар",
    "admin.product_availability_update": "Обновлено наличие",
    "admin.product_price_update": "Обновлена цена товара",
    "admin.assign_picker": "Назначен сборщик",
    "admin.assign_courier": "Назначен курьер",
    "admin.staff_create": "Создана учётная запись сотрудника",
    "admin.staff_deactivate": "Отключена учётная запись сотрудника",
    "admin.payment_refund": "Создан возврат",
    "admin.payment_status_update": "Обновлён статус платежа",
    "picking.start": "Начата сборка",
    "picking.item_picked": "Товар собран",
    "picking.complete": "Сборка завершена",
    "picking.item_cancelled": "Товар отменён",
    "delivery.status_update": "Обновлён статус доставки",
    "customer.push_token_registered": "Подключены push-уведомления",
  },
  kk: {
    "admin.category_create": "Санат құрылды",
    "admin.category_update": "Санат өзгертілді",
    "admin.category_delete": "Санат жойылды",
    "admin.product_create": "Тауар құрылды",
    "admin.product_update": "Тауар өзгертілді",
    "admin.product_delete": "Тауар жойылды",
    "admin.product_availability_update": "Қолжетімділік жаңартылды",
    "admin.product_price_update": "Тауар бағасы жаңартылды",
    "admin.assign_picker": "Жинаушы тағайындалды",
    "admin.assign_courier": "Курьер тағайындалды",
    "admin.staff_create": "Қызметкер аккаунты құрылды",
    "admin.staff_deactivate": "Қызметкер аккаунты өшірілді",
    "admin.payment_refund": "Қайтарым құрылды",
    "admin.payment_status_update": "Төлем мәртебесі жаңартылды",
    "picking.start": "Жинақтау басталды",
    "picking.item_picked": "Тауар жиналды",
    "picking.complete": "Жинақтау аяқталды",
    "picking.item_cancelled": "Тауар жойылды",
    "delivery.status_update": "Жеткізу мәртебесі жаңартылды",
    "customer.push_token_registered": "Push хабарландырулары қосылды",
  },
};

const auditEntityLabels: Record<AppLocale, Readonly<Record<string, string>>> = {
  en: {
    category: "Category",
    product: "Product",
    order: "Order",
    order_item: "Order item",
    payment: "Payment",
    staff_profile: "Staff profile",
    push_subscription: "Push subscription",
  },
  ru: {
    category: "Категория",
    product: "Товар",
    order: "Заказ",
    order_item: "Позиция заказа",
    payment: "Платёж",
    staff_profile: "Сотрудник",
    push_subscription: "Push-подписка",
  },
  kk: {
    category: "Санат",
    product: "Тауар",
    order: "Тапсырыс",
    order_item: "Тапсырыс тауары",
    payment: "Төлем",
    staff_profile: "Қызметкер",
    push_subscription: "Push-жазылым",
  },
};

const auditFieldLabels: Record<AppLocale, Readonly<Record<string, string>>> = {
  en: {
    name: "Name",
    slug: "Slug",
    customerPriceMinor: "Customer price",
    internalCostMinor: "Internal cost",
    isActive: "Active",
    isAvailable: "Available",
    availabilityNote: "Availability note",
    pickerId: "Picker",
    courierId: "Courier",
    roles: "Roles",
    refundId: "Refund",
    amountMinor: "Amount",
    reason: "Reason",
    status: "Status",
    orderId: "Order",
    pickedQuantity: "Picked quantity",
    finalTotalMinor: "Final total",
    paymentStatus: "Payment status",
    platform: "Platform",
  },
  ru: {
    name: "Название",
    slug: "Слаг",
    customerPriceMinor: "Цена для клиента",
    internalCostMinor: "Себестоимость",
    isActive: "Активность",
    isAvailable: "Наличие",
    availabilityNote: "Комментарий о наличии",
    pickerId: "Сборщик",
    courierId: "Курьер",
    roles: "Роли",
    refundId: "Возврат",
    amountMinor: "Сумма",
    reason: "Причина",
    status: "Статус",
    orderId: "Заказ",
    pickedQuantity: "Собрано",
    finalTotalMinor: "Итоговая сумма",
    paymentStatus: "Статус платежа",
    platform: "Платформа",
  },
  kk: {
    name: "Атауы",
    slug: "Слаг",
    customerPriceMinor: "Клиент бағасы",
    internalCostMinor: "Өзіндік құны",
    isActive: "Белсенділік",
    isAvailable: "Қолжетімділік",
    availabilityNote: "Қолжетімділік ескертпесі",
    pickerId: "Жинаушы",
    courierId: "Курьер",
    roles: "Рөлдер",
    refundId: "Қайтарым",
    amountMinor: "Сома",
    reason: "Себеп",
    status: "Мәртебе",
    orderId: "Тапсырыс",
    pickedQuantity: "Жиналғаны",
    finalTotalMinor: "Қорытынды сома",
    paymentStatus: "Төлем мәртебесі",
    platform: "Платформа",
  },
};

function t(value: string): string {
  return translations[locale][value] ?? value;
}

function moduleLabel(module: AdminModule): string {
  return t(
    adminRoutes.find((route) => route.module === module)?.label ?? "Admin",
  );
}

function localeName(nextLocale: AppLocale): string {
  return nextLocale === "ru" ? "РУ" : nextLocale === "kk" ? "ҚАЗ" : "EN";
}

function renderLocaleToggle(): string {
  return `<div class="locale-toggle" role="group" aria-label="${escapeAttribute(t("Language"))}">
    ${(["ru", "kk", "en"] as const)
      .map(
        (nextLocale) =>
          `<button class="${locale === nextLocale ? "active" : ""}" type="button" data-action="set-locale" data-locale="${nextLocale}" aria-pressed="${locale === nextLocale}">${localeName(nextLocale)}</button>`,
      )
      .join("")}
  </div>`;
}

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
      <aside class="sidebar ${navOpen ? "open" : ""}">
        <div class="brand">
          <div class="brand-line"><span class="brand-mark">a</span><span class="brand-name">altyn<br />market</span></div>
          <p class="eyebrow">${t("Backoffice")}</p>
          <h1>Altyn Market Admin</h1>
        </div>
        <nav class="nav" aria-label="${escapeAttribute(t("Admin navigation"))}">
          ${adminRoutes
            .filter((candidate) => canAccess(candidate.requiredRole))
            .map(
              (candidate) => `
                <button type="button" data-action="module" data-module="${candidate.module}" class="${candidate.module === activeModule ? "active" : ""}">
                  ${escapeHtml(moduleLabel(candidate.module))}
                </button>
              `,
            )
            .join("")}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <div>
            <button class="menu-toggle" type="button" data-action="toggle-nav" aria-label="${escapeAttribute(t("Menu"))}" aria-expanded="${navOpen}">☰</button>
            <p class="eyebrow">${escapeHtml(route?.path ?? "")}</p>
            <h2>${escapeHtml(route ? moduleLabel(route.module) : t("Admin"))}</h2>
          </div>
          <div class="topbar-actions">
            ${renderLocaleToggle()}
            <button class="status ${backendState}" type="button" data-action="refresh-backend">${statusText()}</button>
            <button class="secondary" type="button" data-action="refresh-data">${loading ? t("Loading...") : t("Refresh")}</button>
            <button class="secondary" type="button" data-action="logout">${t("Sign out")}</button>
          </div>
        </header>
        ${successMessage ? `<div class="notice">${escapeHtml(successMessage)}</div>` : ""}
        ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
        <div class="module-content">${renderModule(activeModule)}</div>
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
            <p class="eyebrow">${t("Backoffice")}</p>
            <h1>Altyn Market Admin</h1>
          </div>
          <div class="topbar-actions">${renderLocaleToggle()}<button class="status ${backendState}" type="button" data-action="refresh-backend">${statusText()}</button></div>
        </div>
        <div class="form">
          ${successMessage ? `<div class="notice">${escapeHtml(successMessage)}</div>` : ""}
          ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
          ${
            noAccess
              ? `
                <div class="error">${t("This account does not have admin access.")}</div>
                <button class="secondary" type="button" data-action="logout">${t("Sign out")}</button>
              `
              : authStep === "phone"
                ? `
                  <form class="form" data-action="request-otp">
                    <div class="field">
                      <label for="phone">${t("Phone")}</label>
                      <input id="phone" name="phone" autocomplete="tel" placeholder="+77012345678" required />
                    </div>
                    <button class="primary" type="submit">${t("Request code")}</button>
                  </form>
                `
                : `
                  <form class="form" data-action="verify-otp">
                    <div class="field">
                      <label for="code">${t("Code for")} ${escapeHtml(pendingPhone)}</label>
                      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
                    </div>
                    ${devOtp ? `<div class="notice">${t("Stage code:")} ${escapeHtml(devOtp)}</div>` : ""}
                    <button class="primary" type="submit">${t("Sign in")}</button>
                    <button class="secondary" type="button" data-action="change-phone">${t("Change phone")}</button>
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
    <section class="dashboard-intro">
      <div>
        <h3>${t("Operations overview")}</h3>
        <p>${t("Live view of orders, picking and delivery.")}</p>
      </div>
      <span class="dashboard-date">${t("Today")} · ${formatShortDate(new Date().toISOString())}</span>
    </section>
    <div class="cards">
      ${metric(t("Orders today"), String(data.orders.filter((order) => isToday(order.createdAt)).length))}
      ${metric(t("Needs picking"), String(pending))}
      ${metric(t("Delivering"), String(data.orders.filter((order) => order.status === "delivering").length))}
      ${metric(t("Exceptions"), String(exceptions))}
    </div>
    <div class="dashboard-grid">
      ${renderOrderVolumeChart()}
      ${renderOrderStatusChart()}
    </div>
    ${table(
      ["Order", "Status", "Items", "Total", "Picker", "Courier"].map(t),
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
          t("Assign"),
        ),
        assignmentForm(
          "assign-courier",
          order.id,
          "courierId",
          couriers(),
          deliveryOwner(order.id),
          t("Assign"),
        ),
      ]),
    )}
  `;
}

function renderOrderVolumeChart(): string {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    const count = data.orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return (
        createdAt.getFullYear() === date.getFullYear() &&
        createdAt.getMonth() === date.getMonth() &&
        createdAt.getDate() === date.getDate()
      );
    }).length;
    return { date, count };
  });
  const max = Math.max(...days.map((day) => day.count), 1);
  const hasOrders = days.some((day) => day.count > 0);
  return `
    <section class="panel chart">
      <div class="chart-title"><h3>${t("Orders for 7 days")}</h3><span>${t("Daily order flow")}</span></div>
      ${
        hasOrders
          ? `<div class="bar-chart">${days
              .map(
                ({ date, count }) =>
                  `<div class="bar-column"><span class="bar-value">${count}</span><span class="bar" style="height: ${Math.max(8, Math.round((count / max) * 118))}px"></span><span class="bar-label">${formatShortDate(date.toISOString())}</span></div>`,
              )
              .join("")}</div>`
          : `<p class="empty-chart">${t("No orders in this period yet.")}</p>`
      }
    </section>
  `;
}

function renderOrderStatusChart(): string {
  const statuses = Object.entries(
    countBy(data.orders.map((order) => order.status)),
  );
  const total = Math.max(data.orders.length, 1);
  return `
    <section class="panel chart">
      <div class="chart-title"><h3>${t("Order statuses")}</h3><span>${t("Current distribution")}</span></div>
      ${
        statuses.length > 0
          ? `<div class="status-list">${statuses
              .map(
                ([status, count]) =>
                  `<div class="status-row"><strong>${statusBadge(status)}</strong><span class="muted">${count}</span><div class="status-track"><div class="status-fill" style="width: ${Math.round((count / total) * 100)}%"></div></div></div>`,
              )
              .join("")}</div>`
          : `<p class="empty-chart">${t("No active order statuses yet.")}</p>`
      }
    </section>
  `;
}

function renderCatalog(): string {
  return `
    <div class="catalog-layout">
      <section class="panel catalog-panel">
        <div class="panel-head">
          <h3>${t("Products")}</h3>
          <button class="secondary" type="button" data-action="new-product">${t("New product")}</button>
        </div>
        ${table(
          ["", "Product", "Category", "Unit", "Price", "State", ""].map(t),
          data.products.map(({ product, price, availability }) => [
            product.imageUrl
              ? `<img class="thumb" src="${escapeAttribute(product.imageUrl)}" alt="${escapeAttribute(product.name)}" />`
              : `<div class="thumb" aria-hidden="true"></div>`,
            `<strong>${escapeHtml(product.name)}</strong>${product.description ? `<br><span class="muted">${escapeHtml(product.description)}</span>` : ""}`,
            escapeHtml(categoryName(product.categoryId)),
            escapeHtml(t(product.unit)),
            `${formatMoney(price.customerPrice)}<br><span class="muted">${t("Cost")} ${price.internalCost ? formatMoney(price.internalCost) : "-"}</span>`,
            `${product.isActive ? badge(t("Active"), "ok") : badge(t("Inactive"), "bad")} ${availability.isAvailable ? badge(t("Available"), "ok") : badge(t("Unavailable"), "warn")}`,
            `<div class="row-actions">
              <button class="link-button" type="button" data-action="edit-product" data-product-id="${escapeAttribute(product.id)}">${t("Edit")}</button>
              <button class="link-button" type="button" data-action="toggle-product-active" data-product-id="${escapeAttribute(product.id)}" data-active="${product.isActive ? "0" : "1"}">${product.isActive ? t("Deactivate") : t("Activate")}</button>
              <button class="link-button danger-link" type="button" data-action="request-delete-product" data-product-id="${escapeAttribute(product.id)}" data-product-name="${escapeAttribute(product.name)}">${t("Delete")}</button>
            </div>`,
          ]),
        )}
      </section>
      <section class="panel catalog-panel">
        <div class="panel-head">
          <h3>${t("Categories")}</h3>
          <button class="secondary" type="button" data-action="new-category">${t("New category")}</button>
        </div>
        ${table(
          ["Name", "Slug", "Sort order", "State", ""].map(t),
          data.categories.map((category) => [
            escapeHtml(category.name),
            escapeHtml(category.slug),
            String(category.sortOrder),
            category.isActive
              ? badge(t("Active"), "ok")
              : badge(t("Inactive"), "bad"),
            `<div class="row-actions">
              <button class="link-button" type="button" data-action="edit-category" data-category-id="${escapeAttribute(category.id)}">${t("Edit")}</button>
              <button class="link-button" type="button" data-action="toggle-category-active" data-category-id="${escapeAttribute(category.id)}" data-active="${category.isActive ? "0" : "1"}">${category.isActive ? t("Deactivate") : t("Activate")}</button>
              <button class="link-button danger-link" type="button" data-action="request-delete-category" data-category-id="${escapeAttribute(category.id)}" data-category-name="${escapeAttribute(category.name)}">${t("Delete")}</button>
            </div>`,
          ]),
        )}
      </section>
    </div>
    ${renderCatalogModal()}
    ${renderCatalogDeleteModal()}
  `;
}

function renderCatalogModal(): string {
  if (!catalogModal) {
    return "";
  }
  const isProduct = catalogModal === "product";
  const isEditing = isProduct
    ? Boolean(editingProductId)
    : Boolean(editingCategoryId);
  const title = isProduct
    ? isEditing
      ? t("Edit product")
      : t("Add product")
    : isEditing
      ? t("Edit category")
      : t("Add category");
  return `
    <div class="modal-overlay">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttribute(title)}">
        <div class="modal-head">
          <div>
            <p class="eyebrow">${t("Catalog")}</p>
            <h3>${title}</h3>
          </div>
          <button class="secondary" type="button" data-action="close-modal">${t("Close")}</button>
        </div>
        ${isProduct ? renderProductForm() : renderCategoryForm()}
      </section>
    </div>
  `;
}

function renderCatalogDeleteModal(): string {
  if (!catalogDeleteTarget) {
    return "";
  }
  const isProduct = catalogDeleteTarget.kind === "product";
  const title = t(isProduct ? "Delete product" : "Delete category");
  const question = t(
    isProduct
      ? "Delete this product permanently?"
      : "Delete this category permanently?",
  );

  return `
    <div class="modal-overlay">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttribute(title)}">
        <div class="modal-head">
          <div>
            <p class="eyebrow">${t("Catalog")}</p>
            <h3>${title}</h3>
          </div>
          <button class="secondary" type="button" data-action="close-delete-modal">${t("Close")}</button>
        </div>
        <div class="confirmation-content">
          <p>${question} <strong>${escapeHtml(catalogDeleteTarget.name)}</strong></p>
          <p>${t("This action cannot be undone.")}</p>
          ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
          <div class="form-actions">
            <button class="secondary" type="button" data-action="close-delete-modal">${t("Cancel")}</button>
            <button class="danger" type="button" data-action="confirm-delete-catalog-item">${t("Delete")}</button>
          </div>
        </div>
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
      <form class="form catalog-form" data-action="${isEditing ? "update-product" : "create-product"}">
        ${product ? `<input type="hidden" name="productId" value="${escapeAttribute(product.product.id)}" />` : ""}
        <div class="field">
          <label>${t("Name")}</label>
          <input name="name" value="${escapeAttribute(product?.product.name ?? "")}" required />
        </div>
        <div class="field">
          <label>${t("Category")}</label>
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
          <label>${t("Unit")}</label>
          <select name="unit" required>
            ${productUnitOptions(product?.product.unit)}
          </select>
        </div>
        <div class="field full">
          <label>${t("Description")}</label>
          <textarea name="description">${escapeHtml(product?.product.description ?? "")}</textarea>
        </div>
        <div class="field full">
          <label>${t("Image URL")}</label>
          <input name="imageUrl" value="${escapeAttribute(product?.product.imageUrl ?? "")}" />
        </div>
        ${
          isEditing
            ? ""
            : `
              <div class="field">
                <label>${t("Customer price, KZT")}</label>
                <input name="customerPrice" type="number" min="0" step="1" required />
              </div>
              <div class="field">
                <label>${t("Internal cost, KZT")}</label>
                <input name="internalCost" type="number" min="0" step="1" />
              </div>
            `
        }
        <div class="check-row full">
          <label class="check-field"><input name="isActive" type="checkbox" ${(product?.product.isActive ?? true) ? "checked" : ""} /> ${t("Active")}</label>
          <label class="check-field"><input name="isAvailable" type="checkbox" ${(product?.availability.isAvailable ?? true) ? "checked" : ""} /> ${t("Available")}</label>
        </div>
        <div class="field full">
          <label>${t("Availability note")}</label>
          <input name="availabilityNote" value="${escapeAttribute(product?.availability.note ?? "")}" />
        </div>
        <div class="form-actions">
          <button class="secondary" type="button" data-action="close-modal">${t("Cancel")}</button>
          <button class="primary" type="submit">${isEditing ? t("Save product") : t("Create product")}</button>
        </div>
      </form>
  `;
}

function renderCategoryForm(): string {
  const category = editingCategoryId
    ? data.categories.find((candidate) => candidate.id === editingCategoryId)
    : undefined;
  const isEditing = Boolean(category);
  return `
      <form class="form catalog-form" data-action="${isEditing ? "update-category" : "create-category"}">
        ${category ? `<input type="hidden" name="categoryId" value="${escapeAttribute(category.id)}" />` : ""}
        <div class="field">
          <label>${t("Name")}</label>
          <input name="name" value="${escapeAttribute(category?.name ?? "")}" required />
        </div>
        <div class="field">
          <label>${t("Slug")}</label>
          <input name="slug" value="${escapeAttribute(category?.slug ?? "")}" required />
        </div>
        <div class="field">
          <label>${t("Sort order")}</label>
          <input name="sortOrder" type="number" step="1" value="${escapeAttribute(String(category?.sortOrder ?? 0))}" required />
        </div>
        <div class="check-row">
          <label class="check-field"><input name="isActive" type="checkbox" ${(category?.isActive ?? true) ? "checked" : ""} /> ${t("Active")}</label>
        </div>
        <div class="form-actions">
          <button class="secondary" type="button" data-action="close-modal">${t("Cancel")}</button>
          <button class="primary" type="submit">${isEditing ? t("Save category") : t("Create category")}</button>
        </div>
      </form>
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
      ${metric(t("Priced products"), String(data.products.length))}
      ${metric(t("Missing cost"), String(data.products.filter((item) => !item.price.internalCost).length))}
      ${metric(t("Changed today"), String(data.products.filter((item) => isToday(item.price.effectiveFrom)).length))}
    </div>
    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h3>${t("Current prices")}</h3></div>
        ${table(
          ["Product", "Customer", "Cost", "Margin", ""].map(t),
          data.products.map(({ product, price }) => [
            `<strong>${escapeHtml(product.name)}</strong><br><span class="muted">${escapeHtml(product.unit)}</span>`,
            formatMoney(price.customerPrice),
            price.internalCost ? formatMoney(price.internalCost) : "-",
            formatMargin(price),
            `<form class="inline-form" data-action="save-price" id="price-${escapeAttribute(product.id)}">
              <input type="hidden" name="productId" value="${escapeAttribute(product.id)}" />
              <input name="customerPrice" type="number" min="0" step="1" value="${moneyInput(price.customerPrice)}" aria-label="Customer price" />
              <input name="internalCost" type="number" min="0" step="1" value="${price.internalCost ? moneyInput(price.internalCost) : ""}" aria-label="Internal cost" />
              <button class="primary" type="submit">${t("Save")}</button>
              <button class="secondary" type="button" data-action="load-price-history" data-product-id="${escapeAttribute(product.id)}">${t("History")}</button>
            </form>`,
          ]),
        )}
      </section>
      <section class="panel">
        <div class="panel-head"><h3>${selectedProduct ? escapeHtml(selectedProduct.product.name) : t("Price history")}</h3></div>
        ${
          history.length === 0
            ? `<div class="form"><p class="muted">${t("Select a product history.")}</p></div>`
            : table(
                ["Effective", "Customer", "Cost"].map(t),
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
        <div class="panel-head"><h3>${t("Accounts")}</h3></div>
        ${table(
          ["Name", "Roles", "State", ""].map(t),
          data.staff.map((staff) => [
            `<strong>${escapeHtml(staff.displayName)}</strong><br><span class="muted">${shortId(staff.userId)}</span>`,
            staff.roles.map((role) => badge(role, "neutral")).join(" "),
            staff.isActive
              ? badge(t("Active"), "ok")
              : badge(t("Inactive"), "bad"),
            staff.isActive
              ? `<button class="link-button" type="button" data-action="deactivate-staff" data-staff-id="${escapeAttribute(staff.id)}">${t("Deactivate")}</button>`
              : "",
          ]),
        )}
      </section>
      <section class="panel">
        <div class="panel-head"><h3>${t("Create staff")}</h3></div>
        <form class="form" data-action="create-staff">
          <div class="field">
            <label>${t("Display name")}</label>
            <input name="displayName" required />
          </div>
          <div class="field">
            <label>${t("Phone")}</label>
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
          <button class="primary" type="submit">${t("Create account")}</button>
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
      ${metric(t("Payments"), String(data.payments.length))}
      ${metric(t("Refunds"), String(data.refunds.length))}
      ${metric(t("Exceptions"), String(failed))}
    </div>
    <section class="panel">
      <div class="panel-head"><h3>${t("Payments")}</h3></div>
      ${table(
        ["Payment", "Order", "Status", "Authorized", "Captured", "Actions"].map(
          t,
        ),
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
      <div class="panel-head"><h3>${t("Refunds")}</h3></div>
      ${table(
        ["Refund", "Payment", "Amount", "Reason", "Status"].map(t),
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
        <div class="panel-head"><h3>${t("Picking tasks")}</h3></div>
        ${table(
          ["Task", "Order", "Picker", "Status", "Assigned"].map(t),
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
        <div class="panel-head"><h3>${t("Courier tasks")}</h3></div>
        ${table(
          ["Task", "Order", "Courier", "Status"].map(t),
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
      ${metric(t("Order count"), String(metrics?.orderCount ?? 0))}
      ${metric(t("Average check"), metrics ? formatMoney(metrics.averageCheck) : "0 KZT")}
      ${metric(t("Delivery revenue"), metrics ? formatMoney(metrics.deliveryFeeRevenue) : "0 KZT")}
      ${metric(t("Refund amount"), metrics ? formatMoney(metrics.refundAmount) : "0 KZT")}
      ${metric(t("Gross profit/order"), metrics ? formatMoney(metrics.grossProfitPerOrder) : "0 KZT")}
    </div>
    <section class="panel">
      <div class="panel-head"><h3>${t("Order statuses")}</h3></div>
      ${table(
        ["Status", "Orders"].map(t),
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
      <div class="panel-head"><h3>${t("Audit log")}</h3></div>
      ${table(
        ["When", "Actor", "Action", "Entity", "Metadata"].map(t),
        data.auditLog.map((entry) => [
          formatDate(entry.createdAt),
          shortId(entry.actorUserId),
          escapeHtml(formatAuditAction(entry.action)),
          `${escapeHtml(formatAuditEntity(entry.entityType))}<br><span class="muted">${shortId(entry.entityId)}</span>`,
          formatAuditMetadata(entry.metadata),
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

  if (action === "set-locale") {
    const nextLocale = button.dataset.locale;
    if (nextLocale === "ru" || nextLocale === "kk" || nextLocale === "en") {
      locale = nextLocale;
      window.localStorage.setItem(localeStorageKey, locale);
      render();
    }
    return;
  }

  if (action === "toggle-nav") {
    navOpen = !navOpen;
    render();
    return;
  }

  if (action === "module") {
    activeModule = button.dataset.module as AdminModule;
    navOpen = false;
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
    catalogModal = "product";
    render();
    return;
  }

  if (action === "edit-product") {
    editingProductId = button.dataset.productId;
    catalogModal = "product";
    render();
    return;
  }

  if (
    action === "request-delete-product" &&
    button.dataset.productId &&
    button.dataset.productName
  ) {
    catalogDeleteTarget = {
      kind: "product",
      id: button.dataset.productId,
      name: button.dataset.productName,
    };
    errorMessage = undefined;
    successMessage = undefined;
    render();
    return;
  }

  if (action === "new-category") {
    editingCategoryId = undefined;
    catalogModal = "category";
    render();
    return;
  }

  if (action === "edit-category") {
    editingCategoryId = button.dataset.categoryId;
    catalogModal = "category";
    render();
    return;
  }

  if (
    action === "request-delete-category" &&
    button.dataset.categoryId &&
    button.dataset.categoryName
  ) {
    catalogDeleteTarget = {
      kind: "category",
      id: button.dataset.categoryId,
      name: button.dataset.categoryName,
    };
    errorMessage = undefined;
    successMessage = undefined;
    render();
    return;
  }

  if (action === "close-modal") {
    editingProductId = undefined;
    editingCategoryId = undefined;
    catalogModal = undefined;
    render();
    return;
  }

  if (action === "close-delete-modal") {
    catalogDeleteTarget = undefined;
    errorMessage = undefined;
    render();
    return;
  }

  if (action === "confirm-delete-catalog-item" && catalogDeleteTarget) {
    const target = catalogDeleteTarget;
    await runAction(
      t(target.kind === "product" ? "Product deleted." : "Category deleted."),
      async () => {
        await apiSend(
          `/api/admin/catalog/${target.kind === "product" ? "products" : "categories"}/${target.id}`,
          { method: "DELETE" },
        );
        catalogDeleteTarget = undefined;
        await refreshData(false);
      },
    );
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
      catalogModal = undefined;
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
      catalogModal = undefined;
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
    return t(payload.error);
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

function readStoredLocale(): AppLocale {
  const storedLocale = window.localStorage.getItem(localeStorageKey);
  return storedLocale === "kk" || storedLocale === "en" ? storedLocale : "ru";
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
    return t("Checking backend");
  }
  return backendState === "online" ? t("Backend online") : t("Backend offline");
}

function metric(labelText: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  if (rows.length === 0) {
    return `<div class="form"><p class="muted">${t("No records.")}</p></div>`;
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
                `<tr>${row.map((cell, index) => `<td data-label="${escapeAttribute(headers[index] ?? "")}">${cell}</td>`).join("")}</tr>`,
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
              `<option value="${status}" ${status === payment.status ? "selected" : ""}>${t(status)}</option>`,
          )
          .join("")}
      </select>
      <button class="secondary" type="submit">${t("Update")}</button>
    </form>
  `;
}

function refundForm(payment: Payment): string {
  return `
    <form class="inline-form" data-action="create-refund">
      <input type="hidden" name="paymentId" value="${escapeAttribute(payment.id)}" />
      <input name="amount" type="number" min="1" step="1" placeholder="KZT" aria-label="${escapeAttribute(t("Refund amount"))}" />
      <input name="reason" placeholder="${escapeAttribute(t("Reason"))}" aria-label="${escapeAttribute(t("Refund reason"))}" />
      <button class="danger" type="submit">${t("Issue refund")}</button>
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
              `<option value="${status}" ${status === task.status ? "selected" : ""}>${t(status)}</option>`,
          )
          .join("")}
      </select>
      <button class="secondary" type="submit">${t("Update")}</button>
    </form>
  `;
}

function productUnitOptions(selected?: ProductUnit): string {
  const units: readonly ProductUnit[] = ["kg", "g", "piece", "bundle", "box"];
  return units
    .map(
      (unit) =>
        `<option value="${unit}" ${unit === selected ? "selected" : ""}>${t(unit)}</option>`,
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
  return task ? staffName(task.pickerId) : t("Unassigned");
}

function deliveryOwner(orderId: string): string {
  const task = data.deliveryTasks.find(
    (candidate) => candidate.orderId === orderId,
  );
  return task ? staffName(task.courierId) : t("Unassigned");
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
    return badge(t(status), "bad");
  }
  if (
    status.includes("pending") ||
    status.includes("awaiting") ||
    status.includes("authorized")
  ) {
    return badge(t(status), "warn");
  }
  if (
    status.includes("captured") ||
    status === "delivered" ||
    status === "completed" ||
    status === "refunded"
  ) {
    return badge(t(status), "ok");
  }
  return badge(t(status), "neutral");
}

function formatAuditAction(action: string): string {
  return auditActionLabels[locale][action] ?? humanizeTechnicalLabel(action);
}

function formatAuditEntity(entityType: string): string {
  return (
    auditEntityLabels[locale][entityType] ?? humanizeTechnicalLabel(entityType)
  );
}

function formatAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): string {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) {
    return `<span class="muted">—</span>`;
  }

  return `<div class="audit-details">${entries
    .map(
      ([key, value]) =>
        `<div class="audit-detail"><span class="audit-detail-label">${escapeHtml(auditFieldLabels[locale][key] ?? humanizeTechnicalLabel(key))}:</span>${formatAuditValue(key, value)}</div>`,
    )
    .join("")}</div>`;
}

function formatAuditValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    if (key === "isAvailable") {
      return escapeHtml(value ? t("Available") : t("Unavailable"));
    }
    return escapeHtml(value ? t("Active") : t("Inactive"));
  }
  if (typeof value === "number") {
    if (key.endsWith("Minor")) {
      return formatMoney({ amountMinor: value });
    }
    return escapeHtml(String(value));
  }
  if (typeof value === "string") {
    if (key === "status" || key === "paymentStatus") {
      return escapeHtml(t(value));
    }
    if (key === "pickerId" || key === "courierId") {
      return escapeHtml(staffName(value));
    }
    if (key.endsWith("Id")) {
      return shortId(value);
    }
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => escapeHtml(humanizeTechnicalLabel(String(item))))
      .join(", ");
  }
  return escapeHtml(humanizeTechnicalLabel(String(value)));
}

function humanizeTechnicalLabel(value: string): string {
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  if (!normalized) {
    return "—";
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function formatMoney(value: { readonly amountMinor: number }): string {
  return `${new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-US").format(value.amountMinor / 100)} KZT`;
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
  return new Intl.DateTimeFormat(
    locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(
    locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-GB",
    { day: "numeric", month: "short" },
  ).format(new Date(value));
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
