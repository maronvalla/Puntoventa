-- Railway/Prisma usa una conexión PostgreSQL privilegiada y seguirá funcionando.
-- Esta migración evita que las tablas queden expuestas por la Data API mientras
-- trasladamos autenticación y permisos a Supabase.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    '_prisma_migrations',
    'business_products',
    'businesses',
    'plush_inventory',
    'plush_loads',
    'plush_machine_photos',
    'plush_machines',
    'plush_purchases',
    'plush_settlements',
    'plush_stock_adjustments',
    'products',
    'purchase_items',
    'purchases',
    'sale_items',
    'sales',
    'stock_adjustments',
    'users'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end
$$;
