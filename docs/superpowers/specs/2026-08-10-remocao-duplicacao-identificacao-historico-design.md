# Design — Eliminar duplicação Identificação/Histórico entre "Nova Inspeção" e o checklist

## 1. Contexto e escopo

Achado durante teste ao vivo do usuário (não veio de um relatório de bug formal — surgiu ao investigar "duplicação de itens/histórico/equipamentos" na lista de dificuldade de bugs desta sessão). Confirmado por leitura de código, não é hipótese:

- O formulário "Nova Inspeção" (`app/(app)/inspections/new/new-inspection-form.tsx`) já coleta, nas abas Identificação e Histórico: marca, modelo, versão/trim, ano de fabrico/modelo, cor, VIN, número de motor, matrícula, número de portas, combustível, caixa de velocidades, tração, potência, torque, quilometragem, indícios de adulteração de quilometragem, número de proprietários anteriores, registo de acidentes anteriores, histórico de manutenção, situação fiscal — persistidos em `vehicle_data`/`client_data` via a RPC `create_inspection`.
- O checklist (grupo `ordem = 1`, subcategorias "Identificação" e "Histórico" — `supabase/migrations/00037_seed_checklist_v7.sql`) tem 21 `checklist_item_templates` pedindo exatamente os mesmos dados de novo, persistidos separadamente em `checklist_item_responses`, sem nenhuma ligação com `vehicle_data`/`client_data`.
- Por regra de pontuação já fixada na Fase 4 ("texto/data nunca pontuam"), 14 desses 21 itens (todos `tipo = 'texto'`) nunca contribuíram pra nota. Os outros 4 (`tipo = 'escolha'`: Indícios de adulteração de quilometragem, Registo de acidentes anteriores, Histórico de manutenção, Situação fiscal) pontuam hoje — **mas não deveriam**: o usuário confirmou que, no modelo de negócio, só a aba "Equipamentos" da inspeção conta nota; Cliente/Identificação/Histórico/Especificações são puramente informativos.
- **Bug pré-existente descoberto no caminho:** corrigir esses dados pelo item do checklist (ex. "Cor do veículo") grava em `checklist_item_responses`, não em `vehicle_data.cor` — que é o que a lista do admin/técnico, a validade da inspeção e os filtros de busca realmente leem. Ou seja, hoje não existe nenhum jeito de uma correção pós-criação propagar pro resto do app.
- "Equipamentos" (grupo `ordem = 10` no schema do checklist) **não está duplicado** — já foi movido pra sua própria aba dentro do formulário "Nova Inspeção" numa fase anterior (Fase 2.8/Peça 3), com tabela própria (`equipamento_inspecao` + `equipamento_fotos`) e caminho de pontuação separado do `checklist_item_score`. Fora de escopo, não é tocado aqui.

## 2. Decisões fechadas com o usuário

- **Os 21 itens de Identificação/Histórico saem do checklist por completo** — os 14 `texto` (nunca pontuaram) e os 4 `escolha` (pontuavam indevidamente). Nenhum sobra nos templates do checklist.
- **Correção pós-criação reaproveita o formulário "Nova Inspeção" existente, em modo edição** — rejeitada a alternativa de construir um resumo/painel novo do zero (proposta inicial minha). Mesmo componente `NewInspectionForm`, mesmas 5 abas (Cliente, Identificação, Histórico, Especificações, Equipamentos), pré-preenchido com o dado atual da inspeção. Nova rota `/inspections/[id]/editar`, acesso controlado pela mesma `isInspectionEditable(status, role)` que já rege o resto do app (técnico edita em rascunho/devolvida, admin sempre). Link de acesso a partir do início do checklist.
- **Edição grava direto em `vehicle_data`/`client_data`** (não mais em `checklist_item_responses`) — corrige de brinde o bug de propagação descrito acima.
- **Reconciliação de Equipamentos em modo edição:**
  - Fotos existentes (slots fixos `foto1`/`foto2`, não o `PhotoManager` flexível dos itens comuns): se o usuário não mexer no slot, a foto atual permanece; escolher um arquivo novo substitui.
  - Editar condição/nome de um equipamento já existente: `UPDATE` na linha existente de `equipamento_inspecao`, nunca um novo insert pro mesmo item.
  - Adicionar um equipamento novo: `INSERT`, mesmo caminho que a criação já usa hoje.
  - **Remover (desmarcar) um equipamento já selecionado exige confirmação** — diálogo explícito antes de apagar a linha e as fotos anexadas (mesmo padrão de `<dialog>` já usado em Cancelar/Devolver inspeção), para não perder evidência por acidente.
- **Auditoria (RF-36):** quando quem edita é **admin**, grava uma linha em `audit_log_entries` — mesmo padrão já usado nas Server Actions de item do checklist hoje (Fase 5). Edição feita pelo próprio técnico não gera entrada de auditoria, consistente com o resto do app.

## 3. Detalhes técnicos

### 3.1 Remoção dos itens do checklist

`checklist_item_responses.item_template_id` referencia `checklist_item_templates(id)` sem `on delete cascade` (confirmado em `00003_checklist_responses_media.sql`) — apagar os 21 templates direto violaria a FK se alguma inspeção em andamento já tiver resposta salva ali. Nova migration faz o delete em duas etapas, mesmo padrão já usado na Fase 2.8 quando os itens de Equipamentos saíram do checklist geral: primeiro apaga as `checklist_item_responses` cujo `item_template_id` está nas subcategorias "Identificação"/"Histórico" do grupo `ordem = 1`, depois apaga os 21 `checklist_item_templates`. Não há perda de dado real — o que está sendo removido é a cópia redundante; `vehicle_data`/`client_data` (a fonte de verdade) não é tocado.

### 3.2 `NewInspectionForm` em modo edição

- Novos props opcionais: `inspectionId?: string` e `initialData?: {...}` (mesmo shape dos campos hoje inicializados como string vazia). Quando `inspectionId` está presente, cada `useState` usa o valor de `initialData` como inicial em vez de `""`, e o `<form action={...}>` liga em `updateInspectionAction` em vez de `createInspectionAction`.
- Nova rota `app/(app)/inspections/[id]/editar/page.tsx` (Server Component): busca `inspection` + `vehicle_data` + `client_data` + `equipamento_inspecao` (com fotos) pelo `id`, verifica `isInspectionEditable(status, role)` (redirect/notFound se não pode editar), monta `initialData` e renderiza `<NewInspectionForm inspectionId={id} initialData={...} />`.
- Link "Editar dados básicos" (ou nome equivalente) no início do checklist (`checklist/layout.tsx`, junto ao cabeçalho do nav ou como primeira entrada), visível só quando `editable`.

### 3.3 `updateInspectionAction`

Nova Server Action em `app/(app)/inspections/new/actions.ts` (ou arquivo dedicado, decisão de organização fica pro plano), espelhando a validação de `createInspectionAction` mas fazendo `UPDATE` em `vehicle_data`/`client_data` pelo `inspection_id`, e a reconciliação de `equipamento_inspecao` descrita na seção 2 (update por id existente, insert pro novo, delete só depois de confirmação client-side, com upload/remoção de foto nos slots fixos). Se quem chama é admin, insere `audit_log_entries` ao final, mesmo padrão das 6 Server Actions de item do checklist.

## 4. Fora de escopo

- Qualquer mudança em Equipamentos como conceito (aba, tabela, pontuação) além da reconciliação de edição descrita acima.
- Qualquer mudança na fórmula/view de pontuação (`inspection_score`, `checklist_item_score`) — a remoção dos 4 itens `escolha` do checklist já resolve a pontuação indevida sem tocar na view.
- Redesign da tabela do checklist com cabeçalho sticky (item separado, maior, fica pra uma sessão de brainstorming própria).
