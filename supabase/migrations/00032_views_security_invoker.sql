-- supabase/migrations/00032_views_security_invoker.sql
-- Fix de seguranca (review): medicoes_resultado (migration 00030) e
-- checklist_item_status (migration 00031) foram criadas sem
-- security_invoker = true. Views do Postgres nascem com
-- security_invoker = false por padrao -- rodam com o privilegio do DONO
-- da view (a role postgres, que tem rolbypassrls = true), nao de quem
-- consulta. Resultado: qualquer select nessas views ignora as policies de
-- RLS de checklist_item_responses/checklist_item_templates/medicoes por
-- baixo dos panos, mesmo essas tabelas aplicando RLS corretamente quando
-- consultadas direto. Ja provado ao vivo: tecnico A lendo
-- checklist_item_status enxerga linha de tecnico B; lendo a tabela base
-- direto, so a propria.
--
-- Mesma classe de bug ja corrigida uma vez neste projeto para
-- inspections_with_flags -- ver 00007_security_invoker_fix.sql. Aplicando
-- o mesmo remedio aqui, so que via ALTER VIEW numa migration nova (views
-- ja aplicadas na 00030/00031 nao sao editadas retroativamente).

alter view public.medicoes_resultado set (security_invoker = true);
alter view public.checklist_item_status set (security_invoker = true);
