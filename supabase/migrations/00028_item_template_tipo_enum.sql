-- supabase/migrations/00028_item_template_tipo_enum.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 3. Generaliza item_template_tipo de 2 valores fixos (padrao/medicao)
-- pros 4 tipos estruturais que cobrem os ~30 rotulos de "Tipo de Resposta"
-- do checklist v7 (escolha/texto/data/medicao). 'padrao' vira 'escolha'
-- (mesmo significado -- agora tem opcoes configuraveis em vez de uma
-- classificacao fixa). Migration isolada de proposito: o Postgres nao
-- deixa usar um valor de enum recem-adicionado (ADD VALUE) na mesma
-- transacao em que foi adicionado; a Task 3 e quem usa 'escolha'/'texto'/
-- 'data' em constraints e colunas novas, numa transacao separada.

alter type public.item_template_tipo rename value 'padrao' to 'escolha';
alter type public.item_template_tipo add value 'texto';
alter type public.item_template_tipo add value 'data';
