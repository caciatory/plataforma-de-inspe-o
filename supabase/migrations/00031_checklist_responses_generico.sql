-- supabase/migrations/00031_checklist_responses_generico.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 4. classificacao (coluna fixa, um unico enum universal) vira 3
-- colunas especificas por tipo -- so uma delas e preenchida, conforme o
-- tipo do item (validado na camada de app, Peca 1b, nao aqui). status
-- deixa de ser coluna gerada (dependia so de classificacao, mesma linha) e
-- vira view, porque "respondido" agora depende do tipo do item, que mora
-- noutra tabela -- generated columns do Postgres nao leem outra tabela.
--
-- So ha respostas de teste no banco nesta data (confirmado com o usuario,
-- autorizado a apagar) -- limpa antes de trocar o formato da coluna, em
-- vez de escrever codigo de conversao pra dado que ninguem usa.
--
-- apply_classificacao_batch (migration 00026) referencia classificacao e
-- item_classificacao no corpo -- fica quebrada ate a Task 8 a substituir.
-- Derrubada aqui de proposito, mesmo motivo do save_paint_measurement na
-- Task 4.
--
-- status (coluna gerada, migration 00003) depende de classificacao --
-- precisa cair antes do ALTER TABLE, mesmo motivo do resultado_calculado
-- na Task 4 (SQLSTATE 0A000 se a coluna geradora cai primeiro).
--
-- checklist_item_responses_ruim_requires_photo (RF-16, migration 00013) e a
-- funcao que ele chama tambem leem classificacao no corpo -- ficam
-- quebradas ate a Task 6 a substituir por uma versao que leia opcao_id.
-- Derrubadas aqui de proposito, mesmo motivo de apply_classificacao_batch
-- acima.

delete from public.checklist_item_responses;

drop function if exists public.apply_classificacao_batch(uuid, jsonb);

drop trigger checklist_item_responses_ruim_requires_photo on public.checklist_item_responses;
drop trigger photos_ruim_requires_photo on public.photos;
drop function public.check_ruim_requires_photo();

alter table public.checklist_item_responses
  drop column status,
  drop column classificacao,
  add column opcao_id uuid references public.opcoes(id),
  add column resposta_texto text,
  add column resposta_data date;

drop type public.item_classificacao;
drop type public.item_status;

create view public.checklist_item_status as
select r.id as response_id, r.inspection_id, r.item_template_id,
  case
    when t.tipo = 'medicao' then exists (select 1 from public.medicoes m where m.item_response_id = r.id)
    else r.opcao_id is not null or r.resposta_texto is not null or r.resposta_data is not null
  end as respondido
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id;
