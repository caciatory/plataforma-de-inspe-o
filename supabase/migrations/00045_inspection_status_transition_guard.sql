-- supabase/migrations/00045_inspection_status_transition_guard.sql
-- Achado da revisao de codigo da branch finalizacao-tecnico (RF-23/24): a
-- policy inspections_update (00008_rls_helpers_and_core.sql) so valida QUEM
-- pode escrever (tecnico_id = auth.uid()) no seu WITH CHECK -- nunca PRA QUE
-- status a linha esta indo. USING restringe quais linhas o tecnico consegue
-- tocar (owns_editable_inspection -- so rascunho/devolvida), mas depois
-- disso o tecnico pode, via uma chamada direta ao Supabase (fora do app,
-- sem passar por submitInspectionAction), colocar qualquer valor em status
-- -- inclusive 'aprovada' ou 'cancelada', pulando por completo a revisao do
-- admin que a Fase 5 existe pra garantir.
--
-- Apertar o WITH CHECK direto (ex. "and status = 'aguardando_aprovacao'")
-- quebraria o fluxo normal: o tecnico edita varios campos de uma inspecao
-- em rascunho ao longo do tempo (nota_geral, etc.) sem nunca tocar status,
-- e nesses updates o status da linha nova e igual ao da linha antiga (nao
-- 'aguardando_aprovacao') -- ver supabase/tests/00008_rls_helpers_and_core.test.sql,
-- teste "tecnico edita inspecao propria em rascunho". WITH CHECK nao tem
-- acesso ao valor antigo da coluna pra distinguir "nao mexi no status" de
-- "mudei pra um status proibido", entao a validacao certa e um trigger
-- (mesmo padrao ja usado pra RF-16 em 00033_rf16_generico.sql), que ve OLD
-- e NEW.
--
-- Regra: se quem esta editando nao e admin e o status esta mudando, a unica
-- transicao permitida e rascunho/devolvida -> aguardando_aprovacao (a
-- mesma que submitInspectionAction sempre aplica). Qualquer outra mudanca
-- de status por um tecnico e bloqueada. Admin continua livre (is_admin()),
-- sub-projeto 3 (edicao do admin) e quem vai definir as transicoes dele.

create function public.check_inspection_status_transition() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    if old.status not in ('rascunho', 'devolvida') or new.status <> 'aguardando_aprovacao' then
      raise exception 'Tecnico so pode enviar a inspecao (rascunho/devolvida -> aguardando_aprovacao)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger inspections_status_transition
  before update on public.inspections
  for each row execute function public.check_inspection_status_transition();
