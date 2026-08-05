create or replace function public.pos_create_business_product(
  p_business_id text,
  p_product_id text,
  p_name text,
  p_code text,
  p_barcode text,
  p_price numeric,
  p_cost_price numeric,
  p_stock integer,
  p_critical_stock integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id text;
  v_item_id text := gen_random_uuid()::text;
begin
  if p_product_id is null or btrim(p_product_id) = '' then
    if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_code, '')) = '' then
      raise exception using errcode = 'P0001', message = 'Nombre y código requeridos';
    end if;

    v_product_id := gen_random_uuid()::text;
    insert into public.products (
      "id", "name", "code", "barcode", "active", "createdAt", "updatedAt"
    ) values (
      v_product_id,
      btrim(p_name),
      lower(btrim(p_code)),
      nullif(btrim(coalesce(p_barcode, '')), ''),
      true,
      now(),
      now()
    );
  else
    select "id"
      into v_product_id
      from public.products
     where "id" = p_product_id and "active" = true;

    if v_product_id is null then
      raise exception using errcode = 'P0001', message = 'Producto de catálogo no encontrado';
    end if;
  end if;

  insert into public.business_products (
    "id", "businessId", "productId", "price", "costPrice", "stock",
    "criticalStock", "active", "createdAt", "updatedAt"
  ) values (
    v_item_id, p_business_id, v_product_id, p_price, p_cost_price, p_stock,
    p_critical_stock, true, now(), now()
  );

  return v_item_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'El producto ya existe en el catálogo o negocio';
end;
$$;

create or replace function public.pos_adjust_stock(
  p_business_id text,
  p_business_product_id text,
  p_delta integer,
  p_reason text,
  p_admin_id text,
  p_admin_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id text;
begin
  select "id"
    into v_item_id
    from public.business_products
   where "id" = p_business_product_id
     and "businessId" = p_business_id
   for update;

  if v_item_id is null then
    raise exception using errcode = 'P0001', message = 'Producto no encontrado';
  end if;

  update public.business_products
     set "stock" = "stock" + p_delta,
         "updatedAt" = now()
   where "id" = v_item_id;

  insert into public.stock_adjustments (
    "id", "businessId", "businessProductId", "delta", "reason",
    "adminId", "adminName", "createdAt"
  ) values (
    gen_random_uuid()::text, p_business_id, v_item_id, p_delta, btrim(p_reason),
    p_admin_id, p_admin_name, now()
  );

  return v_item_id;
end;
$$;

revoke all on function public.pos_create_business_product(text, text, text, text, text, numeric, numeric, integer, integer)
  from public, anon, authenticated;
revoke all on function public.pos_adjust_stock(text, text, integer, text, text, text)
  from public, anon, authenticated;

grant execute on function public.pos_create_business_product(text, text, text, text, text, numeric, numeric, integer, integer)
  to service_role;
grant execute on function public.pos_adjust_stock(text, text, integer, text, text, text)
  to service_role;
