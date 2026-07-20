create table if not exists users (
  id uuid primary key,
  phone_e164 text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists staff_profiles (
  id uuid primary key,
  user_id uuid not null references users(id),
  display_name text not null,
  roles text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists addresses (
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

create table if not exists categories (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists products (
  id uuid primary key,
  category_id uuid not null references categories(id),
  name text not null,
  description text,
  unit text not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_prices (
  id uuid primary key,
  product_id uuid not null references products(id),
  customer_price_minor integer not null,
  internal_cost_minor integer,
  currency text not null default 'KZT',
  effective_from timestamptz not null default now()
);

create table if not exists product_availability (
  product_id uuid primary key references products(id),
  is_available boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
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

create table if not exists order_items (
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

create table if not exists order_status_history (
  id uuid primary key,
  order_id uuid not null references orders(id),
  from_status text,
  to_status text not null,
  changed_by uuid not null references users(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
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

create table if not exists refunds (
  id uuid primary key,
  payment_id uuid not null references payments(id),
  amount_minor integer not null,
  currency text not null default 'KZT',
  reason text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists picking_tasks (
  id uuid primary key,
  order_id uuid not null references orders(id),
  picker_id uuid not null references staff_profiles(id),
  status text not null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists delivery_tasks (
  id uuid primary key,
  order_id uuid not null references orders(id),
  courier_id uuid not null references staff_profiles(id),
  status text not null,
  assigned_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists notifications (
  id uuid primary key,
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  channel text not null,
  event text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id uuid primary key,
  actor_user_id uuid not null references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_status_idx on orders(status);
create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists picking_tasks_picker_status_idx on picking_tasks(picker_id, status);
create index if not exists delivery_tasks_courier_status_idx on delivery_tasks(courier_id, status);
create index if not exists notifications_status_idx on notifications(status);
