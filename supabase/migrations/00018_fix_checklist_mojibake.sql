-- supabase/migrations/00018_fix_checklist_mojibake.sql
-- Corrige 5 celulas com mojibake (corrupcao de caracteres) no CSV-fonte
-- docs/data/checklist-inspecta-v5.csv, detectadas na revisao final da
-- branch. A migration 00016 importou o CSV corretamente -- o defeito
-- estava no CSV, nao no gerador. O CSV ja foi corrigido nesta mesma
-- branch; esta migration corrige os dados ja aplicados permanentemente
-- pela 00016 na base ao vivo. Nao eh um re-seed.

update public.checklist_item_templates
set nome = 'Documento Único Automóvel (DUA)'
where nome = 'Documento -nico Automóvel (DUA)';

update public.checklist_item_templates
set observacoes = 'Check engine, ABS, airbag'
where observacoes = 'Check engine, ABS, airbag-';

update public.checklist_item_templates
set nome = 'Sistema de carregamento - teste real (ligar à tomada)'
where nome = 'Sistema de carregamento - teste real (ligar -  tomada)';

update public.checklist_item_templates
set observacoes = 'Visual - NÃO tocar'
where observacoes = 'Visual - N-O tocar';

update public.checklist_item_templates
set observacoes = 'Detetor portátil ~50€'
where observacoes = 'Detetor portátil ~50-';
