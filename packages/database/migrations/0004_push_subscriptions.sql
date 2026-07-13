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
