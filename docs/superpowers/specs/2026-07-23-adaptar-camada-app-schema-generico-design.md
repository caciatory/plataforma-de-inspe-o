# Design — Adaptar a camada de app ao schema genérico de tipos de resposta (Peça 1b)

## 1. Escopo

Peça 1b, a segunda das 4 peças da iniciativa de redesign do checklist (Fase 2.8; ver `docs/ROADMAP.md` — Peça 1a, **Peça 1b**, Peça 2 = re-seed dos 360 itens, Peça 3 = redesign visual). A Peça 1a (`docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md`, branch `worktree-modelo-generico-tipos-resposta`, migrations `00027`–`00036`) trocou o schema rígido (`classificacao`/`paint_measurements`) por um modelo genérico (`opcoes`/`opcao_id`, `medicoes`, views `checklist_item_status`/`medicoes_resultado`) e deixou a camada de app **quebrada de propósito** — ainda referencia colunas, tabelas e RPCs que não existem mais.

Esta peça conserta isso: adapta `actions.ts`, os forms de item, o painel de lote, as queries de página e os tipos compartilhados de `lib/checklist/` pro schema novo, **mantendo a UI/UX de hoje sem redesign visual** (isso é a Peça 3).

**Fora de escopo:**
- Forms para os tipos `texto` e `data` — o seed atual (320 itens) só usa `escolha` e `medicao`; `texto`/`data` só aparecem no checklist real de 360 itens, conteúdo da Peça 2 (re-seed). Ficam pra quando houver item real desse tipo pra desenhar contra.
- Qualquer flag ou lógica de "excluir da pontuação/relatório" — pontuação (Fase 4) e relatório (Fase 6) ainda não existem no app; cada uma decide isso no seu próprio brainstorming, com mais contexto na hora.
- Qualquer mudança visual (layout, CSS, dashboard) — Peça 3.

## 2. Renomeações

Os nomes atuais (`item-classificacao-form.tsx`, `saveClassificacaoAction`, `CLASSIFICACOES`, campo de form `classificacao`) datam do schema rígido, onde "classificação" era o único tipo de resposta possível. O schema novo chama esse tipo estrutural de item **`escolha`** (enum `item_template_tipo`). Renomeia pra acompanhar:

| Antes | Depois |
|---|---|
| `item-classificacao-form.tsx` / `ItemClassificacaoForm` | `item-escolha-form.tsx` / `ItemEscolhaForm` |
| `saveClassificacaoAction` | `saveEscolhaAction` |
| `applyClassificacaoBatchAction` | `applyOpcoesBatchAction` |
| `CLASSIFICACOES` (constante estática) | removida — opções vêm do banco |
| `initialClassificacao` (prop) | `initialOpcaoId` |
| campo de form `classificacao` | `opcaoId` |

`item-medicao-form.tsx` e seus nomes internos não mudam — o tipo `medicao` já se chamava assim antes e depois.

## 3. Queries de página

### `page.tsx` (item — `checklist/[groupId]/[itemId]/page.tsx`)

- Select de `checklist_item_templates` ganha `conjunto_opcao_id, unidade_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_inferior, limiar_critico_superior`.
- Se `item.tipo === 'escolha'`: query nova — `opcoes` filtradas por `conjunto_id = item.conjunto_opcao_id`, `select id, label, ordem, exige_foto`, `order by ordem`. Resultado passado como prop `opcoes` pro form.
- Select de `checklist_item_responses` (resposta do item atual): troca `classificacao` por `opcao_id, resposta_texto, resposta_data`.
- Medição: troca a tabela `paint_measurements`/coluna `valores_um` por `medicoes`/`valores` (mesmo padrão de query, só nomes novos).
- Siblings (`groupResponses`, usado por `deriveSiblingRows`): a view `checklist_item_status` não expõe `opcao_id` (só `respondido`), e a tabela base `checklist_item_responses` não expõe o label da opção. Resolve com 2 queries em paralelo — respostas base (`item_template_id, opcao_id`) e, se houver `opcao_id`s presentes, os labels dessas opções — e junta em memória antes de montar `SiblingRow[]`.

### `page.tsx` (grupo — `checklist/[groupId]/page.tsx`)

- Select de `checklist_item_responses` troca `status` (coluna antiga) pela view `checklist_item_status` (`respondido` boolean).
- **Consequência confirmada com o usuário:** o badge da lista de itens perde o 3º estado visual (NF tinha cor própria); vira 2 estados (pendente/feito). N.A. fica visualmente igual a qualquer outra resposta preenchida — consistente com a decisão de não dar tratamento especial a N.A. nesta peça.

## 4. Server Actions e RPCs (`actions.ts`)

- **`saveEscolhaAction`** (ex-`saveClassificacaoAction`): recebe `opcaoId` do form. Validação: consulta `opcoes` pra confirmar que o `opcaoId` recebido pertence ao `conjunto_opcao_id` do item (não é mais um enum fixo validável em memória). Upsert `opcao_id` (em vez de `classificacao`) em `checklist_item_responses`. Erro amigável genérico (código `23514`): "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar." — bate com a mensagem que o trigger `check_exige_foto` (migration `00033`) já produz, sem mais citar "ruim" especificamente.
- **`saveMeasurementAction`**: troca a chamada RPC `save_paint_measurement(p_valores_um, ...)` por `save_medicao(p_valores, ...)`. O retorno passa a incluir `resultado` (`ok`/`atencao`/`critico`); não há tela hoje que exiba resultado calculado, então o retorno extra é ignorado por enquanto — sem novo uso de UI.
- **`applyOpcoesBatchAction`** (ex-`applyClassificacaoBatchAction`): payload `{item_template_id, opcao_id, observacao}` (em vez de `classificacao`), chama RPC `apply_opcoes_batch`. Mesma semântica de lote atômico (já existente na RPC, migration `00035`).
- **`attachPhotoAction`/`deletePhotoAction`**: sem mudança.
- `friendlyDbError`: mensagem passa a ser genérica (não cita "ruim"), reaproveitada por `saveEscolhaAction`, `saveMeasurementAction` e `applyOpcoesBatchAction`.

## 5. Componentes de UI

- **`ItemEscolhaForm`** (ex-`ItemClassificacaoForm`): recebe `opcoes: {id: string; label: string; exigeFoto: boolean}[]` como prop (carregada em `page.tsx`), renderiza radios com `opcao.id` como value em vez de importar `CLASSIFICACOES`. `confirm()` de N.A. **removido** (decisão explícita — sem tratamento especial por opção nesta peça). Hint de sibling já respondido mostra o label da opção do sibling em vez de `classificacao ?? status`.
- **`ItemMedicaoForm`**: legenda "Medição (µm)" vira `Medição (${unidadeMedicao})`, lendo a nova coluna `checklist_item_templates.unidade_medicao` (passada como prop). Sem mudança de comportamento pra itens de tinta (seguem µm via backfill da migration `00029`).
- **`BatchApplyPanel`**: mesma troca de radios pra usar a prop `opcoes` em vez de `CLASSIFICACOES`. Checagem client-side de "falta foto" (hoje `r.classificacao === "ruim"`) passa a olhar `opcoes.find(o => o.id === r.opcaoId)?.exigeFoto`. `confirm()` de N.A. removido, mesmo motivo do item 5 acima.

## 6. Tipos compartilhados (`lib/checklist/`)

- **`progress.ts`**: `ItemResponseStatus` (`"pendente" | "respondido" | "NF"`) vira `respondido: boolean`. `isItemPending` passa a checar `!respondido`. `ChecklistItemStatus`/`SubcategoriaGroup` seguem a mesma troca.
- **`siblings.ts`**: `SiblingResponseRow`/`SiblingRow`/`BatchRowInput` trocam `classificacao: string | null` por `opcaoId: string | null` + `opcaoLabel: string | null` (label já resolvido em `page.tsx`, pra `siblings.ts` não precisar conhecer a tabela `opcoes`). `CLASSIFICACOES` removida daqui (era exportada deste arquivo).

## 7. Testes

- `actions.test.ts`: adapta asserts de payload (`{classificacao}` → `{opcao_id}`) e nomes de RPC (`save_paint_measurement`→`save_medicao`, `apply_classificacao_batch`→`apply_opcoes_batch`), incluindo a query de validação nova de `saveEscolhaAction`.
- `batch-apply-panel.test.tsx`: fixtures de `BatchRow` trocam `classificacao` por `opcaoId`, mais prop `opcoes` nova.
- `lib/checklist/siblings.test.ts`: fixtures trocam `classificacao` por `opcaoId`/`opcaoLabel`.
- `lib/checklist/progress.test.ts` (se existir cobertura de `ItemResponseStatus`): adapta pra `respondido: boolean`.
- Sem teste novo de UI — não há UI nova, só troca de fonte de dado sobre a UI existente.

## 8. Branch e integração

Esta peça continua na mesma branch da Peça 1a (`worktree-modelo-generico-tipos-resposta`) — é a mesma que a Peça 1a deixou de propósito com o front-end quebrado, justamente pra ser consertada aqui antes de qualquer merge em `main`. Só integra em `main` (via `finishing-a-development-branch`) depois desta peça passar pelo gate de revisão completo (`docs/ROADMAP.md`, seção final).
