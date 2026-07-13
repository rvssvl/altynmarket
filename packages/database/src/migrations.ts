import type { Migration } from "./index.js";

const initialSchema = `
create table users (
  id uuid primary key,
  phone_e164 text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table staff_profiles (
  id uuid primary key,
  user_id uuid not null references users(id),
  display_name text not null,
  roles text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key,
  user_id uuid not null references users(id),
  label text not null,
  city text not null,
  street text not null,
  apartment text,
  entrance text,
  floor text,
  comment text,
  latitude numeric,
  longitude numeric
);

create table categories (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table products (
  id uuid primary key,
  category_id uuid not null references categories(id),
  name text not null,
  description text,
  unit text not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_prices (
  id uuid primary key,
  product_id uuid not null references products(id),
  customer_price_minor integer not null,
  internal_cost_minor integer,
  currency text not null default 'KZT',
  effective_from timestamptz not null default now()
);

create table product_availability (
  product_id uuid primary key references products(id),
  is_available boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key,
  customer_id uuid not null references users(id),
  address_id uuid not null references addresses(id),
  status text not null,
  goods_total_minor integer not null,
  delivery_fee_minor integer not null,
  final_total_minor integer not null,
  currency text not null default 'KZT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key,
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  product_name_snapshot text not null,
  unit_snapshot text not null,
  requested_quantity numeric not null,
  picked_quantity numeric,
  unit_price_minor integer not null,
  currency text not null default 'KZT',
  status text not null,
  cancellation_reason text
);

create table order_status_history (
  id uuid primary key,
  order_id uuid not null references orders(id),
  from_status text,
  to_status text not null,
  changed_by uuid not null references users(id),
  note text,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key,
  order_id uuid not null unique references orders(id),
  provider text not null,
  status text not null,
  authorized_amount_minor integer not null,
  captured_amount_minor integer,
  currency text not null default 'KZT',
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key,
  payment_id uuid not null references payments(id),
  amount_minor integer not null,
  currency text not null default 'KZT',
  reason text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table picking_tasks (
  id uuid primary key,
  order_id uuid not null references orders(id),
  picker_id uuid not null references staff_profiles(id),
  status text not null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

create table delivery_tasks (
  id uuid primary key,
  order_id uuid not null references orders(id),
  courier_id uuid not null references staff_profiles(id),
  status text not null,
  assigned_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table notifications (
  id uuid primary key,
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  channel text not null,
  event text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table admin_audit_log (
  id uuid primary key,
  actor_user_id uuid not null references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index orders_status_idx on orders(status);
create index order_items_order_id_idx on order_items(order_id);
create index picking_tasks_picker_status_idx on picking_tasks(picker_id, status);
create index delivery_tasks_courier_status_idx on delivery_tasks(courier_id, status);
create index notifications_status_idx on notifications(status);
`;

const authCartSessions = `
create table otp_challenges (
  id uuid primary key,
  phone_e164 text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index otp_challenges_phone_active_idx
  on otp_challenges(phone_e164, expires_at desc)
  where consumed_at is null;

create table device_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  device_name text,
  user_agent text,
  ip_address text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_sessions_user_idx on device_sessions(user_id, revoked_at);

create table auth_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  device_session_id uuid not null references device_sessions(id),
  access_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index auth_sessions_user_idx on auth_sessions(user_id, expires_at desc);

create table refresh_tokens (
  id uuid primary key,
  session_id uuid not null references auth_sessions(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  replaced_by_token_id uuid references refresh_tokens(id),
  created_at timestamptz not null default now()
);

create index refresh_tokens_session_idx on refresh_tokens(session_id);

create table carts (
  id uuid primary key,
  user_id uuid not null references users(id),
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index carts_active_user_idx on carts(user_id) where status = 'active';

create table cart_items (
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cart_id, product_id)
);

alter table payments
  add column provider_redirect_url text,
  add column provider_deeplink_url text;

create index staff_profiles_user_idx on staff_profiles(user_id);
`;

const seedCatalog = `
insert into categories (id, name, slug, sort_order, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'Produce', 'produce', 10, true),
  ('22222222-2222-4222-8222-222222222222', 'Dairy', 'dairy', 20, true),
  ('33333333-3333-4333-8333-333333333333', 'Bakery', 'bakery', 30, true)
on conflict (slug) do nothing;

insert into products (id, category_id, name, description, unit, image_url, is_active)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'Almaty tomatoes',
    'Fresh tomatoes from Altyn Orda market.',
    'kg',
    null,
    true
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '11111111-1111-4111-8111-111111111111',
    'Golden apples',
    'Crisp seasonal apples.',
    'kg',
    null,
    true
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    '22222222-2222-4222-8222-222222222222',
    'Farm milk',
    'Pasteurized local milk.',
    'piece',
    null,
    true
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    '33333333-3333-4333-8333-333333333333',
    'Tandir bread',
    'Fresh round bread.',
    'piece',
    null,
    true
  )
on conflict (id) do nothing;

insert into product_prices (
  id,
  product_id,
  customer_price_minor,
  internal_cost_minor,
  currency,
  effective_from
)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    85000,
    65000,
    'KZT',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    72000,
    52000,
    'KZT',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    59000,
    43000,
    'KZT',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    25000,
    15000,
    'KZT',
    now()
  )
on conflict (id) do nothing;

insert into product_availability (product_id, is_available, note)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', true, null)
on conflict (product_id) do nothing;
`;

const pushSubscriptions = `
create table push_subscriptions (
  token text primary key,
  user_id uuid not null references users(id),
  platform text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_enabled_idx
  on push_subscriptions(user_id, enabled);
`;

export const migrations: readonly Migration[] = [
  {
    id: "0001_initial",
    description: "Initial Altyn Market operational schema",
    sql: initialSchema,
  },
  {
    id: "0002_auth_cart_sessions",
    description: "OTP challenges, device sessions, refresh tokens, carts",
    sql: authCartSessions,
  },
  {
    id: "0003_seed_catalog",
    description: "MVP catalog seed products",
    sql: seedCatalog,
  },
  {
    id: "0004_push_subscriptions",
    description: "Customer app push notification device subscriptions",
    sql: pushSubscriptions,
  },
];
