# Design — Fase 4: Pontuação (RF-38 a RF-42, RNF-18–19)

## 1. Contexto e bloqueio original

RF-38 a RF-42 (`docs/especificacao-tecnica-v1.md`) descrevem o cálculo de nota do veículo: cada classificação de item tem um valor numérico fixo (ótimo=10, médio=6, ruim=2), a nota do grupo é a média dos itens avaliados, a nota geral é a média dos grupos avaliados, e a classificação final (A/B/C) vem de cortes sobre a nota geral. RNF-18/19 fixam esses valores e faixas de medição no código — sem tela de configuração no v1.0.

**Bloqueio original:** os valores exatos de pontuação e os cortes A/B/C nunca foram de fato decididos — nem a especificação técnica nem o PRD (`docs/superpowers/specs/2026-07-09-inspecta-prd-design.md`) trazem números concretos, só a intenção de que ficam fixos no código.

**Complicação descoberta ao reabrir o RF-38:** a especificação pressupõe um enum universal de 4 valores (ótimo/médio/ruim/NF). Esse enum não existe mais desde a Fase 2.8 Peça 1a (schema genérico de tipos de resposta) — hoje o checklist usa 22 `conjuntos_opcao` compartilhados (`supabase/migrations/00037_seed_checklist_v7.sql`), cada um com 2 a ~5 opções e semântica própria (Bom/Médio/Mau, Funciona/Não Funciona, Sim/Não + variantes com N.A., etc.), além de itens `tipo='medicao'` (RNF-19, já com resultado calculado em faixas) e `tipo='texto'`/`'data'` (sem noção de qualidade). RF-38 precisou ser generalizado, não só parametrizado.

## 2. Decisões fechadas com o usuário

- **Pontuação por posição, não por valor curado.** Dentro de cada conjunto, ignorando opções N.A., a opção de posição *i* (entre N opções válidas, ordenadas por `ordem`) recebe `10 - (i-1) × 8/(N-1)`. Reproduz o RF-38 original exatamente para conjuntos de 3 opções (10/6/2); generaliza para qualquer N sem precisar listar valor por opção (2 opções → 10/2; 5 opções → 10/8/6/4/2). N=1 (conjunto degenerado) recebe 10.
- **Escala fixa 10 (melhor) a 2 (pior)** — mantém os extremos do RF-38 original.
- **Medição (RNF-19) usa a mesma escala**, reaproveitando o resultado já calculado por `medicoes_resultado.resultado` (`ok`/`atencao`/`critico`, faixas de referência já configuráveis por item desde a Fase 2.8): ok=10, atenção=6, crítico=2.
- **Texto e data nunca pontuam** (sempre fora da média — não têm noção de qualidade).
- **N.A. e pendente (sem resposta) ficam fora da média do grupo**, igual ao "NF" do RF-39/40 original — a nota sempre reflete só o que já foi avaliado, inclusive com a inspeção em andamento.
- **Grupo sem nenhum item avaliado fica fora da nota geral** (RF-40 equivalente).
- **Cortes A/B/C sobre a nota geral: A ≥ 8, B ≥ 5, C < 5.**
- **Escopo só de cálculo** — RF-38 a RF-42 pedem cálculo, não tela. A exibição da nota fica pra Fase 5 (revisão do admin, ainda não construída), que já vai ter tela própria pra consumir isso. Esta fase não cria nenhuma UI nova.

## 3. Dado novo: `opcoes.is_na`

Hoje "esta opção é N.A." é inferido só no cliente, por regex sobre o rótulo (`NA_LABEL_RE` em `lib/checklist/siblings.ts`, usado por `resolveEscolhaColorModifier` pra não colorir N.A. como ruim). Não existe um jeito estruturado de saber isso no banco — e replicar o mesmo regex em SQL duplicaria a mesma lógica frágil em dois lugares (JS e SQL divergem no tempo).

**Fix:** `alter table public.opcoes add column is_na boolean not null default false`, setado no seed (migration) pra cada opção que hoje corresponde a uma variante N.A. (usando a mesma curadoria manual que já decide `exige_foto` por opção). Vira a fonte única de verdade — a pontuação no banco lê `is_na` diretamente; o regex do cliente (`resolveEscolhaColorModifier`) não é tocado nesta fase (fora de escopo trocar agora), mas o campo fica disponível se um dia quiserem migrar essa lógica pro dado em vez do rótulo.

## 4. Views de cálculo

Seguem o padrão já usado em `checklist_item_status`/`medicoes_resultado` (`supabase/migrations/00031_checklist_responses_generico.sql`): views simples, `security_invoker` (mesma RLS do usuário logado, sem reabrir o vazamento que a migration `00007` já corrigiu uma vez).

### `checklist_item_score(item_response_id, item_template_id, inspection_id, pontos)`

Uma linha por `checklist_item_responses`. `pontos` é `numeric`, nulo quando o item não pontua:

- **Escolha:** nulo se `opcao_id is null` (pendente) ou a opção tem `is_na = true`. Senão, calcula a posição da opção escolhida entre as opções não-N.A. do mesmo `conjunto_id` (via `row_number() over (partition by conjunto_id order by ordem)` num CTE que já filtra `is_na = false`) e aplica a fórmula do §2.
- **Medição:** nulo se não houver `medicoes_resultado` pra essa resposta (medição não feita). Senão, mapeia `resultado` → pontos via `case`.
- **Texto/data:** sempre nulo (não precisa de `case` por tipo — a query só teria `join` com `opcoes`/`medicoes_resultado`, que naturalmente não batem pra esses tipos).

### `checklist_group_score(inspection_id, group_id, nota, itens_avaliados)`

Uma linha por grupo por inspeção: `nota = avg(pontos)` sobre `checklist_item_score` não-nulo, `itens_avaliados = count(pontos não-nulo)`. Grupos com `itens_avaliados = 0` ainda aparecem na view (pra quem quiser listar todos os grupos), mas `nota` fica nula.

### `inspection_score(inspection_id, nota_geral, classificacao)`

Uma linha por inspeção: `nota_geral = avg(nota)` sobre `checklist_group_score` onde `itens_avaliados > 0`. `classificacao` é `case when nota_geral >= 8 then 'A' when nota_geral >= 5 then 'B' when nota_geral is not null then 'C' else null end`. Nula enquanto nenhum item da inspeção foi avaliado ainda (inspeção recém-criada).

## 5. Testes

SQL tests (`supabase/tests/`, mesmo padrão dos existentes) cobrindo:

- Conjunto de 2, 3 e 5 opções pontuando nos valores exatos esperados (10/2; 10/6/2; 10/8/6/4/2).
- Opção `is_na = true` nunca entra na fórmula de posição das demais (a contagem N exclui ela) nem recebe pontos própria (fica nula).
- Item de medição mapeado corretamente nos 3 níveis de resultado.
- Item texto/data sempre com `pontos` nulo, mesmo respondido.
- Item pendente (sem resposta) com `pontos` nulo.
- Grupo com todos os itens N.A./pendentes: `itens_avaliados = 0`, `nota` nula, fora da nota geral.
- `inspection_score`: fronteiras exatas de corte (nota_geral = 8.0 → 'A'; 7.999... → 'B'; 5.0 → 'B'; 4.999... → 'C'; nenhum item avaliado → `nota_geral`/`classificacao` nulos).

## 6. Fora de escopo

- Qualquer tela nova (Fase 5 consome estas views depois).
- Trocar o regex `NA_LABEL_RE` do cliente pelo `opcoes.is_na` novo (o campo fica disponível, mas essa migração de lógica não é desta fase).
- Tela de configuração dos valores/cortes (RNF-18 mantém fixo no código).
