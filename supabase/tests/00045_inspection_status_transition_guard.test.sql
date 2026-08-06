-- supabase/tests/00045_inspection_status_transition_guard.test.sql
-- Cobre o trigger inspections_status_transition (00045): tecnico so pode
-- transicionar rascunho/devolvida -> aguardando_aprovacao; qualquer outro
-- salto de status por um tecnico e bloqueado; editar outros campos sem
-- tocar status continua livre; admin continua sem restricao.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'devolvida', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
begin
  begin
    update public.inspections set status = 'aprovada'
      where id = '00000000-0000-0000-0000-000000000020';
    raise exception 'FALHOU: tecnico nao deveria conseguir pular direto pra aprovada';
  exception when insufficient_privilege then
    raise notice 'OK: tecnico bloqueado ao tentar setar status=aprovada diretamente';
  end;
end $$;

do $$
begin
  begin
    update public.inspections set status = 'cancelada'
      where id = '00000000-0000-0000-0000-000000000020';
    raise exception 'FALHOU: tecnico nao deveria conseguir pular direto pra cancelada';
  exception when insufficient_privilege then
    raise notice 'OK: tecnico bloqueado ao tentar setar status=cancelada diretamente';
  end;
end $$;

do $$
declare v_status text;
begin
  update public.inspections set status = 'aguardando_aprovacao'
    where id = '00000000-0000-0000-0000-000000000021';
  select status into v_status from public.inspections where id = '00000000-0000-0000-0000-000000000021';
  if v_status <> 'aguardando_aprovacao' then
    raise exception 'FALHOU: tecnico deveria poder enviar rascunho -> aguardando_aprovacao';
  end if;
  raise notice 'OK: tecnico envia rascunho -> aguardando_aprovacao';
end $$;

do $$
declare v_status text;
begin
  update public.inspections set status = 'aguardando_aprovacao'
    where id = '00000000-0000-0000-0000-000000000022';
  select status into v_status from public.inspections where id = '00000000-0000-0000-0000-000000000022';
  if v_status <> 'aguardando_aprovacao' then
    raise exception 'FALHOU: tecnico deveria poder reenviar devolvida -> aguardando_aprovacao';
  end if;
  raise notice 'OK: tecnico reenvia devolvida -> aguardando_aprovacao';
end $$;

do $$
declare v_nota numeric;
begin
  -- Regressao: editar outro campo sem tocar status nao pode ser bloqueado
  -- pelo trigger (NEW.status = OLD.status, entao a condicao "is distinct
  -- from" nunca dispara a checagem de transicao).
  update public.inspections set nota_geral = 8.5
    where id = '00000000-0000-0000-0000-000000000023';
  select nota_geral into v_nota from public.inspections where id = '00000000-0000-0000-0000-000000000023';
  if v_nota is distinct from 8.5 then
    raise exception 'FALHOU: tecnico deveria poder editar outros campos sem tocar status';
  end if;
  raise notice 'OK: editar campo sem tocar status continua livre (trigger nao interfere)';
end $$;

-- simulate admin
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_status text;
begin
  update public.inspections set status = 'aprovada'
    where id = '00000000-0000-0000-0000-000000000020';
  select status into v_status from public.inspections where id = '00000000-0000-0000-0000-000000000020';
  if v_status <> 'aprovada' then
    raise exception 'FALHOU: admin deveria poder setar qualquer status';
  end if;
  raise notice 'OK: admin nao e restringido pelo trigger de transicao';
end $$;

reset role;
rollback;
