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
