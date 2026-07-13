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
