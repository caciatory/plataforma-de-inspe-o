# Design — Histórico e Equipamentos (Peça 3, recorte 3)

## 1. Escopo

Peça 3, recorte 3 — última fatia planejada da Fase 2.8. Recorte 2 (abas Cliente/Identificação/Histórico/Especificações/Equipamentos, com as duas últimas em stub "Nenhum dado ainda") está mesclado em `main` (`4ec3dc1`). Este recorte preenche Histórico e Equipamentos com campos reais, a partir da especificação `.md` fornecida pelo usuário (fonte de verdade dos campos, análogo ao papel de `docs/data/checklist-inspecta-v7.md` pro recorte anterior).

**Fora de escopo:**
- Compressão/redimensionamento de fotos antes do upload — o `PhotoManager` existente também não faz isso; mantém consistência.
- Edição pós-criação de Histórico/Equipamentos — nenhuma das outras abas tem tela de edição hoje; este recorte não inventa uma.
- Catálogo de equipamentos pré-definidos editável por admin — lista fixa em código, não em tabela (ver §3).

## 2. Contexto e decisões fechadas em conversa

- **Quilometragem duplicada:** a aba Identificação já tinha um campo `quilometragem` obrigatório (migração `00019`, usado por `lib/inspection/validity.ts` no cálculo de validade). A spec pede `quilometragem_atual` em Histórico. Decisão: é o mesmo dado — o campo **muda de aba** (Identificação → Histórico), a coluna `vehicle_data.quilometragem` e o RPC não são renomeados.
- **Fotos de equipamento vs. timing de criação:** upload de foto hoje só funciona com a inspeção já existindo no banco (padrão do checklist pós-criação, `PhotoManager`). Decisão: Equipamentos continua na aba 5 do formulário de criação; fotos ficam como `File` locais até o `Guardar` funcionar, e só então sobem (ver §4.3).
- **Biblioteca de sugestões de equipamento personalizado:** decisão — **global**, todo técnico contribui e todo técnico vê as sugestões de todos (não por técnico individual).
- **Item desmarcado em Equipamentos:** mantém a condição/comentário/fotos preenchidos num estado local (Map), caso o item seja remarcado antes do `Guardar` — não é apagado ao desmarcar. Só o que está marcado no momento do envio é persistido.
- **Duplicação com o checklist existente:** o checklist (`docs/data/checklist-inspecta-v7.md`) já tinha uma seção inteira "10. Equipamentos" (subgrupos Multimédia/Conforto/ADAS/Segurança, itens 271–300) cobrindo essencialmente os mesmos equipamentos, só que como "Funciona/Não Funciona/N.A." em vez de Bom/Atenção+comentário+fotos. Decisão: **remover esses 30 itens do checklist**, mais 11 duplicados espalhados fora da seção 10 (GPS 150, Bluetooth 151, teto manual/elétrico 154/155, fecho centralizado 249, alarme 250, Start/Stop 251, travão de mão elétrico 252, Isofix 253, pneu suplente 157, macaco/chave de rodas 158) — ver §6. "Acessórios e Itens Obrigatórios" (301–310) não tem equivalente na nova aba e **fica** no checklist.

## 3. Aba Histórico — campos e modelo de dados

Reorganização visual igual às abas existentes (`form-grid` de duas colunas, campos controlados em `useState`, mesmo padrão de `new-inspection-form.tsx`). Colunas novas em `vehicle_data` (mesma tabela 1:1-por-inspeção que já guarda `quilometragem`, matrícula etc. — não crio tabela nova só pra isso):

| Campo (spec) | Coluna `vehicle_data` | Tipo | Obrigatório |
|---|---|---|---|
| `quilometragem_atual` | `quilometragem` (já existe, só muda de aba) | int | Sim |
| `indicios_adulteracao_km` | `indicios_adulteracao_km` | text | Não |
| `numero_proprietarios_anteriores` | `numero_proprietarios_anteriores` | int, check ≥ 0 | Não |
| `registo_acidentes_anteriores` | `registo_acidentes_anteriores` | text | Não |
| `historico_manutencao` | `historico_manutencao` | text | Não |
| `inspecoes_periodicas_ipo` (texto + data) | `inspecoes_periodicas_ipo_notas` text, `inspecoes_periodicas_ipo_data` date | Não |
| `situacao_fiscal` (checkbox + texto) | `situacao_fiscal_regular` boolean not null default false, `situacao_fiscal_observacoes` text | Não |

Os 4 campos de texto longo (`indicios_adulteracao_km`, `registo_acidentes_anteriores`, `historico_manutencao`, `inspecoes_periodicas_ipo_notas`) usam um componente `TextareaWithCounter` novo e compartilhado — mostra contador só acima de 500 caracteres (aviso visual, não bloqueia envio). Único componente novo desta aba; evita duplicar a lógica de contagem 4 vezes.

`create_inspection` RPC ganha os novos parâmetros (todos com `default null` exceto `p_quilometragem`, que já é obrigatório hoje) e insere junto com o resto de `vehicle_data`. `inspectionFormSchema` (Zod) ganha os campos correspondentes; `lib/inspection/tabs.ts` (`FIELD_TO_TAB`) mapeia todos pra `"historico"`.

## 4. Aba Equipamentos — modelo de dados

Três peças, cada uma resolvendo uma necessidade diferente:

**4.1 Catálogo pré-definido (fixo).** As 5 categorias e ~40 itens da spec (§2.5) viram uma constante TypeScript, `lib/equipamento/catalog.ts` — não uma tabela. É dado fixo que veio com o app, sem necessidade de edição por admin nem de consulta cross-tela (mesmo raciocínio de `tipoClienteValues`).

**4.2 Sugestões de item personalizado (global, cresce com o tempo).** Tabela nova `equipamento_sugestoes`:
```
id uuid pk, categoria text not null, nome text not null, criado_em timestamptz default now()
unique (lower(categoria), lower(nome))
```
RLS: leitura liberada pra qualquer usuário autenticado (é um catálogo compartilhado, sem dono); insert liberado pra qualquer autenticado (upsert on conflict do nothing, disparado pelo RPC quando um item marcado como personalizado é salvo — ver §4.3).

**4.3 Seleções da inspeção (dados reais da vistoria).** Tabela nova `equipamento_inspecao`:
```
id uuid pk, inspection_id uuid not null references inspections(id) on delete cascade,
categoria text not null, nome_equipamento text not null,
condicao text not null check (condicao in ('bom','atencao')),
comentario text, ordem int not null, criado_em timestamptz default now()
```
E `equipamento_fotos`:
```
id uuid pk, equipamento_inspecao_id uuid not null references equipamento_inspecao(id) on delete cascade,
url text not null, ordem int, criado_em timestamptz default now()
```
RLS em ambas: mesmo padrão de `owns_editable_inspection(inspection_id)` já usado em `vehicle_data`/`client_data`/`photos`. Fotos reaproveitam o bucket de storage `fotos-inspecao` existente — a policy de insert só olha o primeiro segmento do path (`inspection_id`), então **nenhuma migração no bucket é necessária**; caminho novo: `{inspection_id}/{equipamento_inspecao_id}/{filename}`.

**Fluxo de criação:** `create_inspection` RPC ganha um parâmetro `p_equipamentos jsonb` — array de `{categoria, nome_equipamento, condicao, comentario, personalizado, ordem}` — na ordem em que aparecem no formulário. A função insere cada um em `equipamento_inspecao` (usando `ordem` pra manter correlação estável, mesmo padrão de `photos.ordem`) e, pros marcados `personalizado: true`, faz upsert em `equipamento_sugestoes`. A Server Action, depois que a RPC retorna o `inspection_id`, busca `equipamento_inspecao` por `inspection_id` ordenado por `ordem` pra mapear cada item local (com fotos pendentes) ao `id` real — só então dispara os uploads de foto pendentes pro bucket, antes do redirect.

## 5. Aba Equipamentos — UI e comportamento

- Cada categoria é um `<details>/<summary>` nativo — sem lib de accordion, sem estado de expandido/recolhido em React.
- Dentro de cada categoria: lista "Disponíveis" (checkboxes dos itens do catálogo fixo `lib/equipamento/catalog.ts` + sugestões carregadas de `equipamento_sugestoes` pra aquela categoria) e "Selecionados" (itens marcados, no topo).
- Ao marcar um item, ele aparece em "Selecionados" com radio `✓ Bom` / `⚠️ Atenção` — usando `required` nativo no grupo de radio, aproveitando a mesma validação `:invalid` escopada à aba ativa que `handleNext` já usa nas outras abas (nenhuma lógica de validação nova).
- Se `Atenção`: mostra textarea de comentário (placeholder "Adicionar comentário...") + até 2 `<input type="file" accept="image/*">` (aceita câmera e galeria nativamente no mobile, sem código extra). Um terceiro arquivo substitui o segundo, não acumula.
- Desmarcar o checkbox tira o item de "Selecionados" mas mantém condição/comentário/fotos num `Map` local, indexado pelo nome do item — remarcar restaura tudo. Isso é comportamento **só da sessão do formulário** (não salvo até `Guardar`).
- Botão `+` de cada categoria abre um `<dialog>` (mesmo padrão de `checklist-item-table.tsx`) com nome livre (obrigatório) + condição (obrigatório) — ao confirmar, entra em "Selecionados" da categoria como `personalizado: true`, mesmo comportamento dos pré-definidos daí em diante.

## 6. Limpeza do checklist (itens duplicados)

O seed do checklist é **gerado** por `scripts/generate_checklist_seed_v7.py` a partir de `docs/data/checklist-inspecta-v7.md` — não se edita o SQL gerado à mão (mesmo mecanismo já usado em `docs/superpowers/specs/2026-07-24-reseed-checklist-v7-design.md`, "reseed checklist v7"). Este recorte segue o mesmo caminho:

1. Editar `docs/data/checklist-inspecta-v7.md`: remover a seção `## 10. Equipamentos` inteira exceto a subseção `### Acessórios e Itens Obrigatórios` (que fica); remover as 11 linhas espalhadas (itens 150, 151, 154, 155, 157, 158, 249, 250, 251, 252, 253) dos seus grupos originais (Painel, Teto, Estado Geral, Elétrico).
2. Rodar `scripts/generate_checklist_seed_v7.py` de novo pra regenerar a migração de seed (nova numeração, após `00037`).
3. Verificar antes de aplicar se existem respostas reais (`checklist_item_responses`) presas a esses `item_template_id` — o ambiente é de teste (`teste1@checkauto.pt`), mas a migração precisa lidar com isso sem falhar por causa da FK (`checklist_item_responses.item_template_id` não tem `on delete cascade` hoje).

Itens **não removidos** por não terem equivalente exato na nova aba (medem coisa diferente): AC "funciona frio/calor" (148, teste funcional, distinto de presença/condição), fluido de direção assistida (190, nível de fluido), travão de mão mecânico (232), resposta da direção no test-drive (261).

## 7. Testes

- `lib/inspection/schema.test.ts` — novos campos de Histórico: obrigatoriedade de `quilometragem` continua, `numero_proprietarios_anteriores` rejeita negativo.
- `new-inspection-form.test.tsx` — Histórico renderiza os 7 campos; Equipamentos: marcar um item exige condição antes de avançar (`:invalid` bloqueia `handleNext`); desmarcar e remarcar restaura dados preenchidos; adicionar item personalizado entra em "Selecionados".
- Teste de unidade pro RPC/Server Action (ou teste SQL em `supabase/tests/`) confirmando que `p_equipamentos` insere na ordem certa e que item `personalizado: true` gera upsert em `equipamento_sugestoes`.
- `supabase/tests/` — nova migração de reseed do checklist: confirma que os 41 itens saíram e que `checklist_item_responses` órfãs (se existirem no ambiente de teste) não quebram a migração.

## 8. Branch e integração

Nova branch/worktree dedicada (`using-git-worktrees`). Gate padrão do projeto: `requesting-code-review` → `ponytail-review` → `verify` (tem UI e migração de banco) → `verification-before-completion` → `finishing-a-development-branch`. `security-review` recomendado pelas novas tabelas com RLS (`equipamento_inspecao`, `equipamento_fotos`, `equipamento_sugestoes`) e pelo novo path de storage.
