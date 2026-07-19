-- supabase/tests/00018_fix_checklist_mojibake.test.sql
-- Verifica dados ja corrigidos pela migration 00018 -- sem begin/rollback,
-- porque nao ha fixture de teste pra desfazer, so leitura contra dados
-- reais e permanentes.

do $$
declare v_new int; v_old int;
begin
  select count(*) into v_new from public.checklist_item_templates where nome = 'Documento Único Automóvel (DUA)';
  select count(*) into v_old from public.checklist_item_templates where nome = 'Documento -nico Automóvel (DUA)';
  if v_new <> 1 or v_old <> 0 then
    raise exception 'FALHOU: DUA -- esperava novo=1/velho=0, achei novo=%/velho=%', v_new, v_old;
  end if;
  raise notice 'OK: DUA corrigido (Documento Único Automóvel)';
end $$;

do $$
declare v_new int; v_old int;
begin
  select count(*) into v_new from public.checklist_item_templates where observacoes = 'Check engine, ABS, airbag';
  select count(*) into v_old from public.checklist_item_templates where observacoes = 'Check engine, ABS, airbag-';
  if v_new <> 1 or v_old <> 0 then
    raise exception 'FALHOU: airbag -- esperava novo=1/velho=0, achei novo=%/velho=%', v_new, v_old;
  end if;
  raise notice 'OK: observacoes "Check engine, ABS, airbag" sem hifen pendurado';
end $$;

do $$
declare v_new int; v_old int;
begin
  select count(*) into v_new from public.checklist_item_templates where nome = 'Sistema de carregamento - teste real (ligar à tomada)';
  select count(*) into v_old from public.checklist_item_templates where nome = 'Sistema de carregamento - teste real (ligar -  tomada)';
  if v_new <> 1 or v_old <> 0 then
    raise exception 'FALHOU: tomada -- esperava novo=1/velho=0, achei novo=%/velho=%', v_new, v_old;
  end if;
  raise notice 'OK: "ligar à tomada" corrigido';
end $$;

do $$
declare v_new int; v_old int;
begin
  select count(*) into v_new from public.checklist_item_templates where observacoes = 'Visual - NÃO tocar';
  select count(*) into v_old from public.checklist_item_templates where observacoes = 'Visual - N-O tocar';
  if v_new <> 1 or v_old <> 0 then
    raise exception 'FALHOU: NAO tocar -- esperava novo=1/velho=0, achei novo=%/velho=%', v_new, v_old;
  end if;
  raise notice 'OK: "Visual - NÃO tocar" corrigido';
end $$;

do $$
declare v_new int; v_old int;
begin
  select count(*) into v_new from public.checklist_item_templates where observacoes = 'Detetor portátil ~50€';
  select count(*) into v_old from public.checklist_item_templates where observacoes = 'Detetor portátil ~50-';
  if v_new <> 1 or v_old <> 0 then
    raise exception 'FALHOU: detetor -- esperava novo=1/velho=0, achei novo=%/velho=%', v_new, v_old;
  end if;
  raise notice 'OK: "Detetor portátil ~50€" corrigido';
end $$;
