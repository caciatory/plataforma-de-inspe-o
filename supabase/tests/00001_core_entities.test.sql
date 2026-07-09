begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');

-- caminho feliz: particular pode comprar
insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ('00000000-0000-0000-0000-000000000001', 'particular', 'compra');

-- stand só pode ter objetivo = venda (RF-03)
do $$
begin
  begin
    insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
      values ('00000000-0000-0000-0000-000000000001', 'stand', 'compra');
    raise exception 'FALHOU: deveria ter bloqueado stand com objetivo=compra';
  exception when check_violation then
    raise notice 'OK: objetivo_stand_fixo bloqueou stand+compra';
  end;
end $$;

-- atrasada: inspeção aberta ontem, ainda em rascunho, deve aparecer atrasada
insert into public.inspections (tecnico_id, tipo_cliente, objetivo, data_abertura)
  values ('00000000-0000-0000-0000-000000000001', 'particular', 'compra', current_date - 1);
do $$
declare v_atrasada boolean;
begin
  select atrasada into v_atrasada from public.inspections_with_flags
    where data_abertura = current_date - 1 limit 1;
  if not v_atrasada then
    raise exception 'FALHOU: inspecao de ontem deveria estar atrasada';
  end if;
  raise notice 'OK: inspections_with_flags marca atrasada corretamente';
end $$;

rollback;
