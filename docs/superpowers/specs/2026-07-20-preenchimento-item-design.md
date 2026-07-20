# Design — Preenchimento de item (Fase 2 UI)

## 1. Escopo

RF-13 a RF-22 (`docs/especificacao-tecnica-v1.md` §5, bloco 2): tela de preenchimento de item do checklist — classificação, confirmação de NF, foto + observação, item de medição de espessura com cálculo automático de resultado.

A camada de DB (migrations 00011–00014) já está em `main` e é a fonte de verdade das regras de negócio: `resultado_calculado` como coluna gerada, trigger que exige foto quando `classificacao = 'ruim'`, RLS completa de insert/update/delete em `checklist_item_responses`, `paint_measurements` e `photos` (via `owns_editable_inspection()` — só permite escrita enquanto a inspeção está `rascunho`/`devolvida`). Esta fase constrói a UI sobre essa base, sem duplicar nenhuma regra já imposta pelo banco.

**Fora do escopo** (pertencem a outras fases, já confirmado nos docs):
- RF-23/24 (botão finalizar inspeção) e RF-63 (filtro `aplica_stand`) — listados na tabela "Fase 1" da especificação técnica, ainda não construídos, não são responsabilidade desta feature.
- Autosave (Fase 3, RF-25–27).
- Pontuação (Fase 4).
- **"Aplicar aos demais" em itens repetidos** (pneus, vidros, bancos, faróis, etc.) — a pendência documentada em §6 do doc técnico ("a definir na Fase 1/2") é resolvida aqui só na forma (ver §5 abaixo), mas a implementação em si vira **Fase 2.5**, registrada no roadmap como próximo passo imediato após esta fase.

## 2. Gap de infraestrutura — Storage de fotos

Não existe bucket do Supabase Storage configurado em nenhuma migration; `photos.url` é hoje só uma coluna de texto sem nada que a preencha. Nova migration:

- Bucket `fotos-inspecao`, **público** (decisão explícita: mais simples que signed URLs; risco aceito é URL de foto de item acessível por quem tiver o link — mesmo nível de proteção que "UUID não adivinhável", não maior que isso).
- Policy de `storage.objects` **INSERT**: restrita a usuários autenticados, condicionada a `owns_editable_inspection()` do `inspection_id` embutido no path do objeto (convenção de path: `{inspection_id}/{item_response_id}/{filename}`).
- Policy de `storage.objects` **DELETE**: mesma condição, espelhando a policy `photos_delete` já existente (RF-17) — `is_admin() or (owns_editable_inspection(inspection_id) and contexto = 'item')`.
- Upload é direto do browser pro Storage via client Supabase (não passa pelo servidor Next.js — evita limite de tamanho de body de Server Action).

## 3. Rotas e componentes

Nova rota dedicada por item: `/inspections/[id]/checklist/[groupId]/[itemId]` (Server Component + Server Actions, mesmo padrão das rotas da Fase 1).

- Busca `checklist_item_templates` pelo `itemId`, a resposta existente em `checklist_item_responses` (se houver) e fotos já anexadas em `photos`.
- **Item `tipo = 'padrao'`:** botões de classificação (ótimo/médio/ruim/NF), textarea de observação, upload de foto(s), botão "Salvar e próximo". Selecionar NF dispara `confirm()` nativo do browser antes de submeter (RF-14) — sem lib de modal nova.
- **Item `tipo = 'medicao'`:** de 3 a 5 campos numéricos (µm), conforme `qtd_pontos_medicao` do template; mesmos controles de foto/observação; **sem** botões de classificação manual — é derivada automaticamente (§4).
- Fotos já anexadas aparecem como thumbnails com botão "excluir" (RF-17).
- `[groupId]/page.tsx` (Fase 1) precisa dos itens virarem links clicáveis pra essa nova rota — hoje são `<li>` estáticos.

## 4. Fluxo de escrita

**Padrão comum:** toda ação de escrita começa com um `upsert` em `checklist_item_responses` (`on conflict (inspection_id, item_template_id)`), garantindo que a linha existe independente da ordem em que o técnico interage com os campos — evita ter que criar a resposta na primeira visita da página (Server Components não escrevem no GET).

**Foto:** upload direto do browser pro Storage — salva na hora, não espera o "Salvar e próximo". Um Server Action grava a linha em `photos` com a URL retornada. Excluir foto = Server Action que apaga o Storage object e a linha em `photos`.

**Classificação + observação (item padrão):** ficam em estado local do formulário; só são gravadas (um único `upsert`) quando o técnico clica "Salvar e próximo", que também navega pro próximo item da ordem do grupo (último item do grupo volta pra lista/próximo grupo).

**Medição (item `medicao`):** nova RPC `save_paint_measurement(item_template_id, inspection_id, valores_um)`, `security invoker`, atômica — upsert da resposta, upsert em `paint_measurements` (dispara `resultado_calculado`, coluna gerada), lê o resultado e atualiza `classificacao` da resposta mapeada assim:

| `resultado_calculado` | `classificacao` |
|---|---|
| `OK` | `otimo` |
| `anomalia` | `medio` |
| `reparacao_colisao` | `ruim` |

Isso faz o `status` gerado (`pendente`/`respondido`/`NF`) funcionar sem qualquer mudança na função pura `computeGroupProgress` da Fase 1, e faz `reparacao_colisao` exigir foto automaticamente via trigger já existente (RF-16) — leitura razoável do requisito, que não restringe "ruim" a item padrão.

## 5. RF-14 (confirmação de NF) e RF-16 (ruim exige foto) na prática

RF-14: `confirm()` nativo antes de submeter classificação `NF`.

RF-16: a trigger de "ruim exige foto" é `deferred`, mas só dentro de uma única transação. Como classificar e anexar foto são requests separados, isso funciona porque o upload de foto já commita a linha em `photos` *antes* do clique em "Salvar e próximo" (foto é salva na hora, ver §4). Se o técnico marcar `ruim` sem nunca ter anexado foto, o `upsert` da classificação falha imediatamente — o Server Action captura o erro do Postgres (`check_violation`) e mostra "anexe uma foto antes de salvar como ruim". Aviso visual adicional no client quando `ruim` selecionado + 0 fotos anexadas (não bloqueia sozinho — quem garante é o banco).

## 6. "Aplicar aos demais" em itens repetidos — resolução da pendência, escopo Fase 2.5

Levantamento no CSV (`docs/data/checklist-inspecta-v5.csv`) confirma que boa parte dos 285 itens segue o padrão `{Componente} {posição} - {atributo}`, onde só a posição varia (esquerdo/direito, dianteiro/traseiro, banco X) — pneus, jantes, vidros, faróis, espelhos, portas, para-choques, bancos, cintos de segurança, entre outros.

**Mecanismo definido** (resolve a pendência do doc técnico §6: "copia só classificação, ou também foto/observação?"): copia **classificação + observação**; **não copia foto** (cada posição normalmente precisa da própria evidência quando "ruim"); técnico pode editar qualquer item do grupo individualmente depois, já que edição é liberada enquanto a inspeção está `rascunho`/`devolvida`.

**Por que curadoria manual, não heurística automática:** um agrupamento errado por regex faria o técnico marcar um item quebrado como "ok" por engano — é dado de inspeção, risco real. Mesmo mecanismo já usado pro `aplica_stand`: curadoria manual na planilha-fonte (nova coluna, ex. `grupo_replicacao`), carregada uma vez no seed, revisão humana antes de qualquer coisa entrar em produção.

**Por que não entra nesta fase:** preenchimento básico de item já é 100% funcional sem isso — só mais lento pro técnico nos clusters repetidos. Curar a coluna corretamente pros 285 itens é trabalho à parte que não deve bloquear o que já está pronto pra construir.

## 7. Testes

- Função pura de mapeamento `resultado_calculado` → `classificacao`: testada isolada, mesmo padrão de `computeInspectionValidity`/`computeGroupProgress`.
- Server Actions: testadas com client Supabase mockado, padrão de `actions.test.ts` existente.
- RPC `save_paint_measurement`: teste SQL em `supabase/tests/`, padrão das migrations 00011–00019.
- Página do item: sem teste próprio — mesma exceção já documentada pras outras páginas fetch-e-renderiza (`checklist/layout.tsx`, `inspections/[id]/page.tsx`); a lógica de verdade é testada isolada nas funções puras e Server Actions acima.
