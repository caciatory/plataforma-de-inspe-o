-- supabase/migrations/00044_fix_sim_nao_problema_ordem.sql
-- Fase 4 (pontuacao), achado da revisao final whole-branch: sim_nao_problema
-- e sim_nao_problema_na (supabase/migrations/00037_seed_checklist_v7.sql:76-80)
-- tem 'Sim' (defeito presente) na ordem=1 e 'Nao' (sem defeito) na ordem=2 --
-- o inverso de todos os outros 20 conjuntos do catalogo, onde ordem=1 e
-- sempre a melhor resposta e exige_foto=true nunca fica na ordem=1 (esse e
-- o sinal que expos o problema: aqui exige_foto=true estava exatamente na
-- ordem=1). Consequencia real: checklist_item_score (migration 00042)
-- pontuava 'Sim' (defeito presente) com 10 pontos e 'Nao' (sem defeito) com
-- 2 -- invertido. Troca as ordens: 'Nao' vira 1 (melhor, 10 pontos), 'Sim'
-- vira 2 (pior, 2 pontos), igual a convencao do resto do catalogo. Nao
-- muda nenhuma resposta ja salva (opcao_id permanece o mesmo) -- so a
-- ordem, que e o que a pontuacao e a cor da UI (resolveEscolhaColorModifier
-- em lib/checklist/siblings.ts, nao tocado aqui) usam pra ranquear.
update public.opcoes set ordem = case when label = 'Sim' then 2 else 1 end
where label in ('Sim', 'Não')
  and conjunto_id in (
    select id from public.conjuntos_opcao where nome in ('sim_nao_problema', 'sim_nao_problema_na')
  );
