create or replace function public.pos_plush_pass(
  p_machine_id text,
  p_final_counter integer,
  p_cash numeric,
  p_qr numeric,
  p_notes text,
  p_load_quantity integer,
  p_day_key text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_id text := gen_random_uuid()::text;
  v_load_id text;
  v_machine record;
  v_inventory record;
  v_initial integer;
  v_cpp numeric;
  v_remaining integer;
begin
  select * into v_inventory from public.plush_inventory where "id"='main' for update;
  if not found then raise exception using errcode='P0001', message='Configurá primero el stock inicial'; end if;
  update public.plush_inventory set "locked"=true,"updatedAt"=now() where "id"='main' and "locked"=false;

  select * into v_machine from public.plush_machines where "id"=p_machine_id and "active"=true for update;
  if not found then raise exception using errcode='P0001', message='Seleccioná una máquina activa'; end if;

  select "finalCounter" into v_initial
    from public.plush_settlements
    where "machineId"=p_machine_id and "status"='ACTIVE'
    order by "createdAt" desc limit 1;
  v_initial := coalesce(v_initial,v_machine."initialCounter");
  if p_final_counter < v_initial then
    raise exception using errcode='P0001', message='La lectura no puede ser menor que '||v_initial;
  end if;

  if p_load_quantity < 0 then
    raise exception using errcode='P0001', message='Cantidad a cargar inválida';
  end if;
  if p_load_quantity > 0 then
    v_remaining := public.pos_plush_remaining();
    if p_load_quantity > v_remaining then
      raise exception using errcode='P0001', message='Stock insuficiente: quedan '||v_remaining||' peluches';
    end if;
  end if;

  select "unitCost" into v_cpp
    from public.plush_purchases where "status"='ACTIVE'
    order by "createdAt" desc limit 1;
  v_cpp := coalesce(v_cpp,v_inventory."initialUnitCost");

  insert into public.plush_settlements (
    "id","machineId","dayKey","initialCounter","finalCounter","prizesDelivered",
    "cashAmount","qrAmount","cppSnapshot","consignmentSnapshot","locatorNameSnapshot",
    "locatorPercentSnapshot","notes","status","createdById","createdByName","createdAt","updatedAt"
  ) values (
    v_settlement_id,p_machine_id,p_day_key,v_initial,p_final_counter,p_final_counter-v_initial,
    p_cash,p_qr,v_cpp,v_machine."consignment",
    case when v_machine."consignment" then v_machine."locatorName" else '' end,
    case when v_machine."consignment" then v_machine."locatorPercent" else 0 end,
    btrim(coalesce(p_notes,'')),'ACTIVE',p_actor_id,p_actor_name,now(),now()
  );

  if p_load_quantity > 0 then
    v_load_id := gen_random_uuid()::text;
    insert into public.plush_loads (
      "id","machineId","quantity","notes","status","createdById","createdByName","createdAt"
    ) values (
      v_load_id,p_machine_id,p_load_quantity,'Carga realizada al registrar pasada','ACTIVE',p_actor_id,p_actor_name,now()
    );
  end if;

  return jsonb_build_object('settlementId',v_settlement_id,'loadId',v_load_id);
end;
$$;

revoke all on function public.pos_plush_pass(text,integer,numeric,numeric,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.pos_plush_pass(text,integer,numeric,numeric,text,integer,text,text,text) to service_role;
