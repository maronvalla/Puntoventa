create or replace function public.pos_create_sale(
  p_business_id text,
  p_seller_id text,
  p_seller_name text,
  p_day_key text,
  p_payment_method text,
  p_cash_amount numeric,
  p_transfer_amount numeric,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id text := gen_random_uuid()::text;
  v_line jsonb;
  v_item record;
  v_qty integer;
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_cash numeric(12,2);
  v_transfer numeric(12,2);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'El carrito está vacío';
  end if;

  insert into public.sales (
    "id", "businessId", "sellerId", "sellerName", "dayKey", "total",
    "paymentMethod", "cashAmount", "transferAmount", "status", "createdAt", "updatedAt"
  ) values (
    v_sale_id, p_business_id, p_seller_id, p_seller_name, p_day_key, 0,
    'CASH'::public."PaymentMethod", 0, 0, 'ACTIVE'::public."SaleStatus", now(), now()
  );

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_line->>'qty')::integer;
    if v_qty <= 0 then
      raise exception using errcode = 'P0001', message = 'Items inválidos';
    end if;

    select bp."id", bp."price", bp."costPrice", p."name", p."barcode", p."code"
      into v_item
      from public.business_products bp
      join public.products p on p."id" = bp."productId"
     where bp."id" = v_line->>'id'
       and bp."businessId" = p_business_id
       and bp."active" = true
       and p."active" = true
     for update of bp;

    if not found then
      raise exception using errcode = 'P0001', message = 'Algunos productos no pertenecen al negocio';
    end if;

    v_line_total := v_item."price" * v_qty;
    v_total := v_total + v_line_total;

    insert into public.sale_items (
      "id", "saleId", "businessProductId", "name", "qty", "unitPrice",
      "itemCostPrice", "barcode", "code", "lineTotal"
    ) values (
      gen_random_uuid()::text, v_sale_id, v_item."id", v_item."name", v_qty,
      v_item."price", v_item."costPrice", v_item."barcode", v_item."code", v_line_total
    );

    update public.business_products
       set "stock" = "stock" - v_qty,
           "updatedAt" = now()
     where "id" = v_item."id";
  end loop;

  if p_payment_method = 'CASH' then
    v_cash := v_total;
    v_transfer := 0;
  elsif p_payment_method = 'TRANSFER' then
    v_cash := 0;
    v_transfer := v_total;
  elsif p_payment_method = 'MIXED' then
    v_cash := coalesce(p_cash_amount, -1);
    v_transfer := coalesce(p_transfer_amount, -1);
    if v_cash < 0 or v_transfer < 0 or abs(v_cash + v_transfer - v_total) > 0.01 then
      raise exception using errcode = 'P0001', message = 'El pago mixto no coincide con el total';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'Método de pago inválido';
  end if;

  update public.sales
     set "total" = v_total,
         "paymentMethod" = p_payment_method::public."PaymentMethod",
         "cashAmount" = v_cash,
         "transferAmount" = v_transfer,
         "updatedAt" = now()
   where "id" = v_sale_id;

  return v_sale_id;
end;
$$;

create or replace function public.pos_void_sale(
  p_business_id text,
  p_sale_id text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public."SaleStatus";
  v_item record;
begin
  select "status"
    into v_status
    from public.sales
   where "id" = p_sale_id and "businessId" = p_business_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Venta no encontrada';
  end if;
  if v_status = 'VOIDED'::public."SaleStatus" then
    raise exception using errcode = 'P0001', message = 'La venta ya está anulada';
  end if;

  for v_item in
    select "businessProductId", "qty" from public.sale_items where "saleId" = p_sale_id
  loop
    update public.business_products
       set "stock" = "stock" + v_item."qty",
           "updatedAt" = now()
     where "id" = v_item."businessProductId";
  end loop;

  update public.sales
     set "status" = 'VOIDED'::public."SaleStatus",
         "voidReason" = coalesce(p_reason, ''),
         "voidedAt" = now(),
         "updatedAt" = now()
   where "id" = p_sale_id;

  return p_sale_id;
end;
$$;

create or replace function public.pos_create_purchase(
  p_business_id text,
  p_admin_id text,
  p_admin_name text,
  p_day_key text,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id text := gen_random_uuid()::text;
  v_line jsonb;
  v_item record;
  v_qty integer;
  v_cost numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'Compra vacía';
  end if;

  insert into public.purchases (
    "id", "businessId", "adminId", "adminName", "dayKey", "totalCost", "createdAt", "updatedAt"
  ) values (
    v_purchase_id, p_business_id, p_admin_id, p_admin_name, p_day_key, 0, now(), now()
  );

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_line->>'qty')::integer;
    v_cost := (v_line->>'costPrice')::numeric;
    if v_qty <= 0 or v_cost < 0 then
      raise exception using errcode = 'P0001', message = 'Items inválidos';
    end if;

    select bp."id", p."name"
      into v_item
      from public.business_products bp
      join public.products p on p."id" = bp."productId"
     where bp."id" = v_line->>'productId'
       and bp."businessId" = p_business_id
       and bp."active" = true
     for update of bp;

    if not found then
      raise exception using errcode = 'P0001', message = 'Algunos productos no pertenecen al negocio';
    end if;

    insert into public.purchase_items (
      "id", "purchaseId", "businessProductId", "name", "qty", "costPrice"
    ) values (
      gen_random_uuid()::text, v_purchase_id, v_item."id", v_item."name", v_qty, v_cost
    );

    update public.business_products
       set "stock" = "stock" + v_qty,
           "costPrice" = v_cost,
           "updatedAt" = now()
     where "id" = v_item."id";

    v_total := v_total + (v_qty * v_cost);
  end loop;

  update public.purchases
     set "totalCost" = v_total,
         "updatedAt" = now()
   where "id" = v_purchase_id;

  return v_purchase_id;
end;
$$;

revoke all on function public.pos_create_sale(text, text, text, text, text, numeric, numeric, jsonb)
  from public, anon, authenticated;
revoke all on function public.pos_void_sale(text, text, text)
  from public, anon, authenticated;
revoke all on function public.pos_create_purchase(text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.pos_create_sale(text, text, text, text, text, numeric, numeric, jsonb)
  to service_role;
grant execute on function public.pos_void_sale(text, text, text)
  to service_role;
grant execute on function public.pos_create_purchase(text, text, text, text, jsonb)
  to service_role;
