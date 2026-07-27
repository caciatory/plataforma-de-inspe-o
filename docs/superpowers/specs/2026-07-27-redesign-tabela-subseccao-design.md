# Design — Redesign visual: tabela densa por subseção (Peça 3, recorte 1)

## 1. Escopo

Peça 3, a última das 4 peças da iniciativa de redesign do checklist (Fase 2.8; ver `docs/ROADMAP.md`). Peças 1a (schema genérico), 1b (camada de app adaptada) e 2 (re-seed real, 359 itens/13 grupos) estão concluídas e mescladas em `main`. Esta peça é a única puramente nova (as anteriores foram schema/dados); shape feito via skill `impeccable` (brief aprovada em conversa, não em arquivo separado — ver decisões abaixo).

Este documento cobre o **primeiro recorte** de Peça 3, decidido explicitamente com o usuário: só a tela de subseção (sidebar + tabela densa editável inline), não sidebar+tabs+login da Fase 2.8 inteira. Login, tabs de dados do veículo e qualquer outra tela ficam para recortes seguintes.

**Fora de escopo deste recorte:**
- Tela de login, tabs de dados do veículo (`Identificação`/`Histórico`/`Especificações`/`Equipamentos`) — decisão já fechada (login fica simples, fora do padrão dashboard; sem toggle "Modo Funcionário"), mas a implementação é de um recorte futuro.
- Pontuação, relatório final — fora do roadmap desta peça.

## 2. Decisões de design (via `impeccable:shape`)

Referência visual: 6 screenshots reais de outro sistema de inspeção veicular, fornecidas pelo usuário nesta conversa (sidebar com seções/subseções aninhadas e contador, tabela com header colorido, densidade média por linha, radios de classificação em colunas, botão de foto).

- **Cor:** paleta Check Auto (`--color-green-*` já em `globals.css`), **sem** o gradiente roxo→verde da referência — decisão de brainstorming anterior, reafirmada aqui.
- **Estrutura adotada da referência:** sidebar com seções-pai e subseções aninhadas, cada uma com contador de pendentes; tabela com header e densidade média (não linha-por-linha ultra compacta).
- **Estrutura descartada da referência:** banners decorativos em gradiente tipo "hero" (PRODUCT.md já proíbe estética de dashboard SaaS genérico — ver nota abaixo); coluna "Avaria" (não existe esse conceito separado no modelo Check Auto — a classificação já carrega `exige_foto`); toggle "Modo Funcionário" (papéis já são fixos por login).
- **Nota PRODUCT.md:** a linha "Nada de UI densa demais tipo planilha corporativa" no anti-references está desatualizada — foi revista no brainstorming da Fase 2.8 (técnico usa densidade em tablet, decisão explícita). Atualizar essa frase faz parte desta peça (task de doc, não de código).
- **Linha por tipo de item** (`checklist_item_templates.tipo`):
  - `escolha`: reaproveita o padrão visual já existente (`.escolha-options`/`.escolha-option--*` em `globals.css`, já usado em `ItemEscolhaForm`) — segmented control inline na linha, com o número real de opções do `conjunto_opcao_id` (2 a 6, não sempre 3 como na referência).
  - `medicao`: **não** tenta caber 3-5 campos numéricos na largura da linha. Vira um botão/badge ("Medir" ou o resultado calculado já existente, ex. "OK"/"Atenção"/"Crítico" via view `medicoes_resultado`) que abre `ItemMedicaoForm` (já existe) dentro de um `<dialog>` nativo.
  - `texto`/`data`: campo `<input type="text">`/`<input type="date">` direto na linha, salva ao perder foco (`onBlur`).
- **Fluxo "aplicar aos demais" (substitui a tela própria da Fase 2.5 para este layout):** item com `grupo_replicacao` não nulo, depois de respondido, ganha um ícone de "família" na linha. Clicar abre um `<dialog>` nativo mostrando os itens-irmãos (mesmo cálculo de `deriveSiblingRows`/`buildBatchRows` já existente), com edição/aplicação em lote — mesma regra de bloqueio de foto obrigatória nomeando o item (`apply_opcoes_batch`), só muda a moldura de painel de página pra modal.
- **Sem geração de imagem/variação visual** — ambiente sem tooling de imagem nativo; a decisão foi validada só com as 6 screenshots reais + diálogo, sem probes geradas.

## 3. Rotas e arquivos

Rota atual: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx` (lista plana por subcategoria, sem tabela) e `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx` (formulário de um item por tela). Esta peça substitui a experiência primária de preenchimento pela tabela; a rota de item deixa de ser navegação principal, mas o código do form (`ItemEscolhaForm`/`ItemMedicaoForm`) é **reaproveitado dentro dos diálogos**, não reescrito.

- **`[groupId]/page.tsx`** (reescrito): busca `checklist_group_templates`, todos os `checklist_item_templates` do grupo (já traz `subcategoria`, `tipo`, `conjunto_opcao_id`, `unidade_medicao`, `grupo_replicacao`), `checklist_item_responses` do grupo (agora incluindo `opcao_id`/`resposta_texto`/`resposta_data`, não só a view `checklist_item_status`), `opcoes` para todos os `conjunto_opcao_id` distintos presentes no grupo (query `in (...)`, não mais 1 item por vez como hoje), e resultado de medição (`medicoes_resultado`) para os itens `tipo='medicao'` respondidos. Renderiza a subcategoria ativa (primeira por padrão, ou via query string `?sub=`) como tabela; sidebar interna lista as demais subcategorias do grupo com contagem — a navegação entre grupos continua vindo do `layout.tsx` existente.
- **`layout.tsx`** (ajuste, não reescrita): a sidebar de grupos já existe (`checklist-nav`); passa a mostrar as subcategorias aninhadas sob cada grupo (nome + contador), não só o grupo. Precisa da mesma agregação de `checklist_item_status` que já busca hoje, só quebrada por `subcategoria` também.
- **Novo `checklist-item-table.tsx`** (Client Component): recebe os itens da subcategoria ativa + respostas + opções já resolvidas, renderiza a tabela, dispara as server actions por linha (`onBlur`/`onChange`), controla abertura dos `<dialog>` de medição e de família.
- **Novos `saveTextoAction`/`saveDataAction`** em `actions.ts`: **gap real descoberto nesta peça** — hoje, itens `tipo='texto'`/`'data'` caem no branch `else` de `[itemId]/page.tsx` (`item.tipo === "medicao" ? ... : <ItemEscolhaForm opcoes={[]} .../>`), renderizando um form de opções vazio, porque esses tipos nunca tiveram form próprio (Peça 1b deixou isso fora de escopo de propósito — só existiam itens `escolha`/`medicao` no seed antigo). Peça 2 semeou itens reais `texto`/`data` pela primeira vez; esta peça precisa implementar o save de fato (upsert `resposta_texto`/`resposta_data` + `observacao` em `checklist_item_responses`, mesma validação de trigger `check_exige_foto` que as demais).
- **`batch-apply-panel.tsx`**: conteúdo reaproveitado, mas passa a renderizar dentro de um `<dialog>` (novo wrapper) em vez de inline na página do item.

## 4. Estilo (CSS)

Sem lib de tabela — tudo greenfield sobre os tokens existentes (`--space-*`, `--color-green-*`/`amber-*`/`red-*`, `--radius-*`). Novas classes: `.item-table`, `.item-table__row`, `.item-table__cell--escolha|medicao|texto|data`, reaproveitando `.escolha-options` como está dentro da célula de `escolha`. Diálogos usam `<dialog>` nativo (não `position: absolute` dentro de container com overflow — evita clipping) com um wrapper `.dialog-panel` reaproveitando `.panel`.

## 5. Estados

Subcategoria com mix pendente/respondido (contagem no header da tabela e na sidebar); subcategoria 100% pendente; subcategoria 100% concluída; item de foto obrigatória sem foto anexada (mesmo bloqueio hoje existente via trigger, mensagem inline na linha); item de medição com resultado calculado exibido como badge; erro de salvamento por linha (mensagem inline, sem travar as outras linhas); responsivo tablet-primeiro (dispositivo real do técnico em campo).

## 6. Testes

- `lib/checklist/progress.ts`: nova função de agregação por subcategoria pra sidebar (contagem aninhada) — cobertura de unidade.
- `actions.test.ts`: casos novos para `saveTextoAction`/`saveDataAction` (payload, upsert, erro de trigger).
- `checklist-item-table` (componente novo): teste de render por tipo de linha (escolha/medicao/texto/data) e do ícone de família condicionado a `grupo_replicacao` + `respondido`.
- Verificação ponta a ponta no navegador obrigatória (tem UI nova) — conta técnico de teste, grupo real com mix de tipos.

## 7. Branch e integração

Nova branch dedicada a este recorte (`worktree-peca3-tabela-subseccao` ou nome equivalente via `using-git-worktrees`). Segue o gate padrão do projeto (`docs/ROADMAP.md`, seção final): `requesting-code-review` → `ponytail-review` → `verify` (tem UI) → `verification-before-completion` → `finishing-a-development-branch`. `security-review` não se aplica (sem mudança de auth/RLS).
