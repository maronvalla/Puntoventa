create or replace function public.pos_plush_remaining()
returns integer
language sql
security definer
set search_path = ''
as $$
  select coalesce((select "initialQuantity" from public.plush_inventory where "id" = 'main'), 0)
    + coalesce((select sum("quantity") from public.plush_purchases where "status" = 'ACTIVE'), 0)
    + coalesce((select sum("delta") from public.plush_stock_adjustments where "status" = 'ACTIVE'), 0)
    - coalesce((select sum("quantity") from public.plush_loads where "status" = 'ACTIVE'), 0);
$$;

create or replace function public.pos_plush_initialize(p_quantity integer, p_unit_cost numeric, p_actor_id text, p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_locked boolean;
begin
  select "locked" into v_locked from public.plush_inventory where "id" = 'main' for update;
  if found and v_locked then raise exception using errcode='P0001', message='El stock inicial ya está bloqueado; usá un ajuste'; end if;
  insert into public.plush_inventory ("id","initialQuantity","initialUnitCost","locked","createdById","createdByName","createdAt","updatedAt")
  values ('main',p_quantity,p_unit_cost,false,p_actor_id,p_actor_name,now(),now())
  on conflict ("id") do update set "initialQuantity"=excluded."initialQuantity", "initialUnitCost"=excluded."initialUnitCost", "updatedAt"=now();
  return 'main';
end; $$;

create or replace function public.pos_plush_adjust(p_delta integer, p_reason text, p_actor_id text, p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text := gen_random_uuid()::text; v_remaining integer;
begin
  perform 1 from public.plush_inventory where "id"='main' for update;
  if not found then raise exception using errcode='P0001', message='Configurá primero el stock inicial'; end if;
  update public.plush_inventory set "locked"=true,"updatedAt"=now() where "id"='main' and "locked"=false;
  v_remaining := public.pos_plush_remaining();
  if v_remaining + p_delta < 0 then raise exception using errcode='P0001', message='El ajuste dejaría el depósito con stock negativo'; end if;
  insert into public.plush_stock_adjustments ("id","delta","reason","status","createdById","createdByName","createdAt")
  values (v_id,p_delta,btrim(p_reason),'ACTIVE',p_actor_id,p_actor_name,now());
  return v_id;
end; $$;

create or replace function public.pos_plush_void_adjustment(p_id text,p_reason text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_delta integer; v_remaining integer;
begin
  perform 1 from public.plush_inventory where "id"='main' for update;
  select "delta" into v_delta from public.plush_stock_adjustments where "id"=p_id and "status"='ACTIVE' for update;
  if not found then raise exception using errcode='P0001', message='Ajuste inexistente o ya anulado'; end if;
  v_remaining := public.pos_plush_remaining();
  if v_remaining - v_delta < 0 then raise exception using errcode='P0001', message='No se puede anular: dejaría el depósito con stock negativo'; end if;
  update public.plush_stock_adjustments set "status"='VOIDED',"voidReason"=btrim(p_reason),"voidedAt"=now(),"voidedById"=p_actor_id,"voidedByName"=p_actor_name where "id"=p_id;
  return p_id;
end; $$;

create or replace function public.pos_plush_purchase(p_quantity integer,p_total_cost numeric,p_supplier text,p_notes text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text := gen_random_uuid()::text;
begin
  perform 1 from public.plush_inventory where "id"='main' for update;
  if not found then raise exception using errcode='P0001', message='Configurá primero el stock inicial'; end if;
  update public.plush_inventory set "locked"=true,"updatedAt"=now() where "id"='main' and "locked"=false;
  insert into public.plush_purchases ("id","quantity","totalCost","unitCost","supplier","notes","status","createdById","createdByName","createdAt")
  values (v_id,p_quantity,p_total_cost,p_total_cost/p_quantity,btrim(coalesce(p_supplier,'')),btrim(coalesce(p_notes,'')),'ACTIVE',p_actor_id,p_actor_name,now());
  return v_id;
end; $$;

create or replace function public.pos_plush_void_purchase(p_id text,p_reason text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_quantity integer; v_remaining integer;
begin
  perform 1 from public.plush_inventory where "id"='main' for update;
  select "quantity" into v_quantity from public.plush_purchases where "id"=p_id and "status"='ACTIVE' for update;
  if not found then raise exception using errcode='P0001', message='Compra inexistente o ya anulada'; end if;
  v_remaining := public.pos_plush_remaining();
  if v_remaining - v_quantity < 0 then raise exception using errcode='P0001', message='No se puede anular: parte de esta compra ya fue cargada'; end if;
  update public.plush_purchases set "status"='VOIDED',"voidReason"=btrim(p_reason),"voidedAt"=now(),"voidedById"=p_actor_id,"voidedByName"=p_actor_name where "id"=p_id;
  return p_id;
end; $$;

create or replace function public.pos_plush_load(p_machine_id text,p_quantity integer,p_notes text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text := gen_random_uuid()::text; v_remaining integer;
begin
  perform 1 from public.plush_inventory where "id"='main' for update;
  if not found then raise exception using errcode='P0001', message='Configurá primero el stock inicial'; end if;
  perform 1 from public.plush_machines where "id"=p_machine_id and "active"=true for update;
  if not found then raise exception using errcode='P0001', message='Seleccioná una máquina activa'; end if;
  update public.plush_inventory set "locked"=true,"updatedAt"=now() where "id"='main' and "locked"=false;
  v_remaining := public.pos_plush_remaining();
  if p_quantity > v_remaining then raise exception using errcode='P0001', message='Stock insuficiente: quedan ' || v_remaining || ' peluches'; end if;
  insert into public.plush_loads ("id","machineId","quantity","notes","status","createdById","createdByName","createdAt")
  values (v_id,p_machine_id,p_quantity,btrim(coalesce(p_notes,'')),'ACTIVE',p_actor_id,p_actor_name,now());
  return v_id;
end; $$;

create or replace function public.pos_plush_void_load(p_id text,p_reason text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.plush_loads where "id"=p_id and "status"='ACTIVE' for update;
  if not found then raise exception using errcode='P0001', message='Carga inexistente o ya anulada'; end if;
  update public.plush_loads set "status"='VOIDED',"voidReason"=btrim(p_reason),"voidedAt"=now(),"voidedById"=p_actor_id,"voidedByName"=p_actor_name where "id"=p_id;
  return p_id;
end; $$;

create or replace function public.pos_plush_settlement(p_machine_id text,p_final_counter integer,p_cash numeric,p_qr numeric,p_notes text,p_day_key text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text:=gen_random_uuid()::text; v_machine record; v_inventory record; v_initial integer; v_cpp numeric;
begin
  select * into v_inventory from public.plush_inventory where "id"='main' for update;
  if not found then raise exception using errcode='P0001', message='Configurá primero el stock inicial'; end if;
  update public.plush_inventory set "locked"=true,"updatedAt"=now() where "id"='main' and "locked"=false;
  select * into v_machine from public.plush_machines where "id"=p_machine_id and "active"=true for update;
  if not found then raise exception using errcode='P0001', message='Seleccioná una máquina activa'; end if;
  select "finalCounter" into v_initial from public.plush_settlements where "machineId"=p_machine_id and "status"='ACTIVE' order by "createdAt" desc limit 1;
  v_initial := coalesce(v_initial,v_machine."initialCounter");
  if p_final_counter < v_initial then raise exception using errcode='P0001', message='La lectura no puede ser menor que '||v_initial; end if;
  select "unitCost" into v_cpp from public.plush_purchases where "status"='ACTIVE' order by "createdAt" desc limit 1;
  v_cpp := coalesce(v_cpp,v_inventory."initialUnitCost");
  insert into public.plush_settlements ("id","machineId","dayKey","initialCounter","finalCounter","prizesDelivered","cashAmount","qrAmount","cppSnapshot","consignmentSnapshot","locatorNameSnapshot","locatorPercentSnapshot","notes","status","createdById","createdByName","createdAt","updatedAt")
  values (v_id,p_machine_id,p_day_key,v_initial,p_final_counter,p_final_counter-v_initial,p_cash,p_qr,v_cpp,v_machine."consignment",case when v_machine."consignment" then v_machine."locatorName" else '' end,case when v_machine."consignment" then v_machine."locatorPercent" else 0 end,btrim(coalesce(p_notes,'')),'ACTIVE',p_actor_id,p_actor_name,now(),now());
  return v_id;
end; $$;

create or replace function public.pos_plush_update_settlement(p_id text,p_final_counter integer,p_cash numeric,p_qr numeric,p_notes text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_item record; v_latest text;
begin
  select * into v_item from public.plush_settlements where "id"=p_id and "status"='ACTIVE' for update;
  if not found then raise exception using errcode='P0001', message='Liquidación inexistente o anulada'; end if;
  select "id" into v_latest from public.plush_settlements where "machineId"=v_item."machineId" and "status"='ACTIVE' order by "createdAt" desc limit 1;
  if v_latest<>p_id then raise exception using errcode='P0001', message='Solo se puede corregir la última liquidación'; end if;
  if p_final_counter<v_item."initialCounter" then raise exception using errcode='P0001', message='La lectura no puede ser menor que '||v_item."initialCounter"; end if;
  update public.plush_settlements set "finalCounter"=p_final_counter,"prizesDelivered"=p_final_counter-v_item."initialCounter","cashAmount"=p_cash,"qrAmount"=p_qr,"notes"=p_notes,"updatedAt"=now() where "id"=p_id;
  return p_id;
end; $$;

create or replace function public.pos_plush_void_settlement(p_id text,p_reason text,p_actor_id text,p_actor_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_machine_id text; v_latest text;
begin
  select "machineId" into v_machine_id from public.plush_settlements where "id"=p_id and "status"='ACTIVE' for update;
  if not found then raise exception using errcode='P0001', message='Liquidación inexistente o anulada'; end if;
  select "id" into v_latest from public.plush_settlements where "machineId"=v_machine_id and "status"='ACTIVE' order by "createdAt" desc limit 1;
  if v_latest<>p_id then raise exception using errcode='P0001', message='Solo se puede anular la última liquidación'; end if;
  update public.plush_settlements set "status"='VOIDED',"voidReason"=btrim(p_reason),"voidedAt"=now(),"voidedById"=p_actor_id,"voidedByName"=p_actor_name,"updatedAt"=now() where "id"=p_id;
  return p_id;
end; $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pos_plush_%'
  loop execute format('revoke all on function %s from public, anon, authenticated',r.sig); execute format('grant execute on function %s to service_role',r.sig); end loop;
end $$;
