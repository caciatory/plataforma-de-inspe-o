-- supabase/migrations/00029_item_template_colunas_genericas.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secoes 3 e 5. checklist_item_templates ganha as colunas que os 4 tipos
-- estruturais precisam (conjunto_opcao_id pra escolha, unidade_medicao +
-- faixas de referencia pra medicao). qtd_pontos_medicao afrouxa de 3-5 pra
-- 1-5 (itens novos como tensao do alternador sao valor unico). O CHECK de
-- grupo_replicacao (Fase 2.5) passa a referenciar 'escolha' em vez de
-- 'padrao'. Termina com o backfill dos 320 itens ja existentes, pra manter
-- o comportamento de hoje identico (tinta: mesmas faixas da migration
-- 00012; classificacao: mesmo conjunto Otimo/Medio/Ruim/N.A. de sempre).

alter table public.checklist_item_templates
  add column conjunto_opcao_id uuid references public.conjuntos_opcao(id),
  add column unidade_medicao text,
  add column faixa_min_ok numeric,
  add column faixa_max_ok numeric,
  add column limiar_critico_inferior numeric,
  add column limiar_critico_superior numeric;

alter table public.checklist_item_templates drop constraint qtd_pontos_medicao_valido;
alter table public.checklist_item_templates add constraint qtd_pontos_medicao_valido check (
  tipo <> 'medicao' or (qtd_pontos_medicao is not null and qtd_pontos_medicao between 1 and 5)
);

alter table public.checklist_item_templates drop constraint grupo_replicacao_so_padrao;
alter table public.checklist_item_templates add constraint grupo_replicacao_so_padrao
  check (grupo_replicacao is null or tipo = 'escolha');

-- Backfill: os itens tipo='escolha' (ex-'padrao') usam o conjunto default
-- estado_4 (Otimo/Medio/Ruim/N.A., criado na Task 1).
update public.checklist_item_templates
set conjunto_opcao_id = (select id from public.conjuntos_opcao where nome = 'estado_4')
where tipo = 'escolha';

-- Backfill: os itens tipo='medicao' (todos espessura de tinta hoje)
-- recebem as mesmas faixas hardcoded que a migration 00012 usava --
-- <70 ou 161-299 = atencao, >=300 = critico, resto = ok.
update public.checklist_item_templates
set unidade_medicao = 'µm',
    faixa_min_ok = 70,
    faixa_max_ok = 160,
    limiar_critico_superior = 300
where tipo = 'medicao';
