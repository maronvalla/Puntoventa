create or replace function public.pos_employee_add_stock(
  p_business_id text,
  p_business_product_id text,
  p_quantity integer,
  p_reason text,
  p_employee_id text,
  p_employee_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id text;
  v_cost_price numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = 'P0001', message = 'La cantidad debe ser un entero positivo';
  end if;

  select "id", "costPrice"
    into v_item_id, v_cost_price
    from public.business_products
   where "id" = p_business_product_id
     and "businessId" = p_business_id
     and "active" = true
   for update;

  if v_item_id is null then
    raise exception using errcode = 'P0001', message = 'Producto no encontrado';
  end if;

  if v_cost_price <> 0 then
    raise exception using errcode = 'P0001', message = 'Los empleados sólo pueden cargar stock en productos de costo cero';
  end if;

  update public.business_products
     set "stock" = "stock" + p_quantity,
         "updatedAt" = now()
   where "id" = v_item_id;

  insert into public.stock_adjustments (
    "id", "businessId", "businessProductId", "delta", "reason",
    "adminId", "adminName", "createdAt"
  ) values (
    gen_random_uuid()::text, p_business_id, v_item_id, p_quantity, btrim(p_reason),
    p_employee_id, p_employee_name, now()
  );

  return v_item_id;
end;
$$;

revoke all on function public.pos_employee_add_stock(text, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.pos_employee_add_stock(text, text, integer, text, text, text)
  to service_role;
