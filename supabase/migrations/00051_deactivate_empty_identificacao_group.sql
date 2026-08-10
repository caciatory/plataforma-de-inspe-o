-- supabase/migrations/00051_deactivate_empty_identificacao_group.sql
-- 00047 removeu Identificação/Histórico e 00050 removeu Documentação do grupo
-- ordem=1 ("Identificação e Documentação") — eram os 3 únicos subgrupos dele
-- (14+7+4=25 itens, exatamente o total do grupo), então o grupo ficou sem
-- nenhum item. Continuava aparecendo no menu do checklist como destino
-- clicável vazio. Desativado (ativo=false), mesmo padrão já usado pro grupo
-- 13 "Motoriz. Especial (F2)" — checklist/layout.tsx já filtra por ativo=true.

update public.checklist_group_templates
set ativo = false
where ordem = 1;
