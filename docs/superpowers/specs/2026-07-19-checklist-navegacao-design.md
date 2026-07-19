# Navegação do Checklist — Inspecta v1.0

> Deriva de `docs/especificacao-tecnica-v1.md` §1.3 (RF-09–12). Fecha o placeholder deixado em `app/(app)/inspections/[id]/page.tsx` pela Fase 1a: "A checklist será implementada numa fase seguinte." Ver `docs/ROADMAP.md` — Fase 1 (restante).

## 1. Escopo

Cobre exclusivamente RF-09 a RF-12: lista de grupos com indicador de progresso, agrupamento visual de itens por subcategoria dentro de um grupo, navegação livre entre grupos.

**Fora de escopo deste documento** (decidido no brainstorming, 2026-07-19):
- **RF-23/24** (bloquear/liberar o botão de finalizar) — fica pra quando a ação de finalizar de fato existir (Fase 5, admin/revisão). Construir o botão agora seria um botão sem ação por trás.
- **RF-13–22** (preencher um item: classificação, foto, observação) — Fase 2. Nesta fase, cada item é uma linha de leitura, sem interação.
- **Filtro `aplica_stand` (RF-63)** — desbloqueado para desenvolvimento desde 2026-07-11 (`especificacao-tecnica-v1.md` §6): todos os 285 itens ficam visíveis para os dois tipos de cliente até o CSV revisado dos sócios chegar. Nenhum filtro por `tipo_cliente` é aplicado aqui.
- **RLS nova** — as policies de `checklist_group_templates`, `checklist_item_templates` e `checklist_item_responses` (migration `00009`) já cobrem exatamente o que esta fase precisa ler. Nenhuma policy nova.

## 2. Rotas

Segue o padrão de rotas aninhadas já usado no resto do app (`app/(app)/inspections/new/`, `app/(app)/inspections/[id]/`):

```
app/(app)/inspections/[id]/checklist/
  layout.tsx        — barra lateral (Server Component), fica montada entre navegações
  page.tsx           — rota-índice: redireciona pro primeiro grupo ativo (menor `ordem`)
  [groupId]/
    page.tsx          — painel central: itens do grupo, agrupados por subcategoria
```

`app/(app)/inspections/[id]/page.tsx` (existente): o parágrafo placeholder vira um link para `/inspections/[id]/checklist`.

Por estar dentro de um `layout.tsx` compartilhado, trocar de grupo não remonta a barra lateral — só o conteúdo de `[groupId]/page.tsx` troca. A URL reflete o grupo selecionado (deep-link e refresh-safe), sem que a navegação pareça um recarregamento de tela pro técnico.

## 3. Dados

**Barra lateral** (`layout.tsx`): busca `checklist_group_templates` (`ativo = true`, ordenado por `ordem`) e, para cada grupo, quantos dos seus itens ainda estão pendentes para esta inspeção. Não existe coluna de contagem pronta — calculado cruzando `checklist_item_templates` (por `group_id`) com `checklist_item_responses` (filtrado por `inspection_id`): item sem linha de resposta correspondente, ou com linha cujo `status = 'pendente'`, conta como pendente. 285 itens no total — uma carga só, sem paginação, sem view/RPC nova no banco.

**Painel de grupo** (`[groupId]/page.tsx`): busca os `checklist_item_templates` daquele `group_id` + as `checklist_item_responses` da inspeção para esses itens, agrupa por `subcategoria` para renderizar.

**Ordenação dos itens dentro do grupo:** não existe coluna `ordem` em `checklist_item_templates` (só existe em `checklist_group_templates`). Ordenação estável definida como: `subcategoria` (asc) e depois `nome` (asc) — não é a ordem do CSV-fonte, mas é determinística sem exigir mudança de schema.

## 4. Componentes / UI

- **Item da barra lateral:** nome do grupo + indicador — `✅` quando `pendentes = 0`, `⚠️ (N)` quando `pendentes > 0`, sendo N o número de itens pendentes.
- **Linha de item no painel central:** nome do item + indicador de status (respondido/pendente/NF) — **sem link, sem `onClick`**. É uma linha de leitura; interação real chega na Fase 2.
- Cabeçalho de subcategoria acima de cada bloco de itens que a compartilham.

## 5. Casos especiais

- **Grupo com 0 itens aplicáveis:** não deveria existir hoje (todo grupo ativo do v1.0 tem itens), mas se acontecer, conta como `✅` (0 pendentes de 0 totais) em vez de erro ou divisão por zero.
- **Rota-índice sem grupo selecionado:** redireciona automaticamente pro grupo de menor `ordem` — o técnico nunca vê uma tela central vazia esperando ele escolher.
- **`groupId` inválido ou de grupo inativo:** `notFound()`, mesmo padrão já usado em `/inspections/[id]/page.tsx` para inspeção inexistente.

## 6. Testes

Sem migration nova — nenhum teste SQL. Segue o padrão Vitest já estabelecido na Fase 1a (`*.test.ts`/`*.test.tsx` ao lado do código): cobertura mínima esperada —
- cálculo de pendentes por grupo (sem resposta = pendente; com resposta não-pendente = respondido);
- ordenação de itens por subcategoria/nome dentro de um grupo;
- redirecionamento da rota-índice pro primeiro grupo;
- `notFound()` em `groupId` inexistente/inativo.

## 7. Fora do escopo (confirmado)

- RF-23/24 (finalizar) — Fase 5.
- RF-13–22 (preencher item) — Fase 2.
- Filtro `aplica_stand` (RF-63) — aguarda CSV dos sócios.
- Qualquer policy de RLS nova.
- Coluna `ordem` em `checklist_item_templates` — não faz parte deste trabalho; a ordenação por subcategoria/nome é suficiente para esta fase.
