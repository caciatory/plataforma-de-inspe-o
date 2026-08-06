# Design — Fase 5, Sub-Projetos 2+3: Revisão e Gestão do Admin

## 1. Contexto e escopo

O `docs/ROADMAP.md` dividiu a Fase 5 em 3 sub-projetos sequenciais no brainstorming original (2026-08-05): (1) finalização do técnico — RF-23/24/33/34, completo e mesclado em 2026-08-06 —, (2) lista do admin + aprovação/devolução — RF-31–34, 57–59, 62 —, (3) edição do admin + auditoria + cancelamento — RF-35–37, 60–61.

Durante o brainstorming deste ciclo, dois achados mudaram o plano original:

- **A RLS já suporta a edição do admin desde a Fase 1** (`is_admin()` tem bypass em `inspections`, `checklist_item_responses`, `vehicle_data`, `photos` — ver `supabase/migrations/00008_rls_helpers_and_core.sql` e `00009_rls_checklist_media.sql`). O trabalho de RF-35 não é "construir a permissão", é só abrir a UI existente pro admin e tornar a checagem de "editável" ciente do papel do usuário — muito mais barato do que o roadmap original assumia.
- **Não existe nenhuma distinção de papel no app hoje.** O login redireciona todo mundo pra `/inspections/new`; a única distinção admin/técnico vive na RLS. Resolver isso é pré-requisito de qualquer uma das duas peças, então vira parte deste ciclo em vez de ficar implícito.

**Decisão:** por causa desses dois achados, os sub-projetos 2 e 3 se fundem num ciclo só — o custo marginal de incluir edição/cancelamento junto com lista/aprovação é baixo, e evita dois ciclos de revisão sobre a mesma tela de detalhe da inspeção. Este documento cobre RF-31 a RF-37 e RF-57 a RF-62 por completo, mais duas peças adicionais que surgiram no brainstorming: roteamento por papel (pré-requisito) e gestão de técnico (gap operacional real — não existe hoje nenhum jeito de criar um técnico pelo app).

## 2. Decisões fechadas com o usuário

- **Roteamento por papel:** login lê `users.role`. Admin → `/admin`. Técnico → `/inspections` (nova lista "minhas inspeções", substitui o redirect direto pra `/inspections/new` de hoje). Guard em cada área redireciona quem está no papel errado. Rejeitadas as alternativas de um shell único com nav condicional (risco de vazar ação de admin na tela do técnico) e de grupos de rota totalmente isolados (over-engineering pro tamanho do app).
- **Edição do admin reaproveita a mesma tela de checklist do técnico** — não uma tela nova mais simples. `isInspectionEditable` passa a considerar o papel além do status.
- **Auditoria (RF-36) vive nas Server Actions já existentes** (`[itemId]/actions.ts`), não em triggers de banco nem em rotas paralelas: quando quem chama é admin, grava uma linha em `audit_log_entries` depois do save.
- **Nota/classificação da lista do admin (RF-57) vem da view `inspection_score`** (Fase 4), não das colunas `inspections.nota_geral`/`classificacao_final` — confirmado por grep que nada no código de app lê ou escreve essas duas colunas; são vestígio de antes da Fase 2.8.
- **Busca/filtro/ordenação (RF-58/59) são client-side** sobre a lista já carregada — volume esperado (inspeções de uma oficina) não justifica paginação/busca no servidor neste momento.
- **Edição pós-aprovação:** editar um item de uma inspeção `aprovada` é permitido (sem novo fluxo de re-aprovação), mas a tela mostra um aviso visível de que a nota foi recalculada — porque `inspection_score` é uma view ao vivo, não um valor congelado, e editar sem avisar deixaria a nota mudar silenciosamente depois do "ok" oficial do admin.
- **Histórico (`review_events` + `audit_log_entries` combinados) é visível só pro admin**, numa seção read-only na tela de detalhe da inspeção. Técnico não vê essa seção — decisão explícita do usuário, mesmo depois de eu sugerir o contrário por transparência.
- **Gestão de técnico (`/admin/tecnicos`) — ideia do usuário, confirmada como gap real:** grep confirma que não existe trigger nem fluxo de app nenhum criando `public.users` a partir de `auth.users` — hoje é 100% manual no dashboard do Supabase. Criar técnico usa `supabase.auth.admin.createUser()` + insert em `public.users`. Desativar/reativar reaproveita o ban nativo do Supabase Auth (`auth.admin.updateUserById` com `ban_duration`) em vez de uma coluna `ativo` nova — já bloqueia login sozinho, sem tocar nas inspeções já feitas por esse técnico (`tecnico_id` intacto, continuam aparecendo normalmente na lista do admin).
- **Pré-requisito de infra, fora do código deste ciclo:** criar usuário via `auth.admin.createUser()` exige a **service role key** do Supabase, que não está configurada no ambiente de desenvolvimento atual (confirmado em sessão anterior). Precisa ser adicionada ao `.env.local` antes da peça de gestão de técnico funcionar — não bloqueia o design nem o resto da implementação, só essa peça específica.
- **Botão de relatório é placeholder** — visível e desabilitado quando `status = 'aprovada'`, sem link real (Fase 6 constrói o relatório de verdade).

## 3. Detalhes técnicos

### 3.1 Roteamento por papel

`app/login/page.tsx` passa a buscar `users.role` do usuário autenticado antes do redirect (hoje redireciona sem checar nada). Novo `app/(app)/admin/layout.tsx` e ajuste no layout do técnico: cada um verifica o papel via uma query simples e faz `redirect()` pro destino do papel certo se bater errado — mesmo padrão de guard que a checklist já usa pra `isInspectionEditable`, só que a nível de papel em vez de status.

### 3.2 Tela do técnico — "Minhas Inspeções" (`/inspections`)

Nova página, lista as inspeções do próprio técnico (RLS já filtra por `tecnico_id` — query sem filtro explícito de segurança adicional, só ordenação). Cada linha: matrícula, status (badge), data de abertura. Linhas com `status = 'devolvida'` ganham destaque visual + o motivo mais recente (de `review_events`, mesmo padrão de query que `[id]/page.tsx` já usa hoje) + link direto pra continuar. Botão "Nova inspeção" no topo, leva pra `/inspections/new` como hoje.

### 3.3 Tela do admin — Lista de inspeções (`/admin`)

Query: `inspections` com join em `vehicle_data` (matrícula/marca/modelo), `users` (nome do técnico) e `inspection_score` (nota/classificação, `LEFT JOIN` — inspeções sem resposta nenhuma não têm linha na view, tratado como nota vazia). Coluna "atrasada": computada em JS a partir de `data_abertura < hoje && status not in ('aprovada', 'cancelada')`, sem coluna nova no banco.

Busca livre (matrícula/cliente/modelo) + filtros (período por `data_abertura`, técnico, `tipo_cliente`) + ordenação (data/nota/status): tudo aplicado sobre o array já carregado no client, sem round-trip novo por interação.

### 3.4 Aprovar / Devolver (RF-31–34)

Na tela de detalhe (`app/(app)/inspections/[id]/page.tsx`, agora também acessível pelo admin), quando `status = 'aguardando_aprovacao'` e o usuário é admin: botões "Aprovar" e "Devolver", mesmo padrão de `<dialog>` que `SubmitInspectionPanel` já usa. Aprovar: insert em `review_events` (`tipo = 'aprovacao'`, sem motivo), update `status = 'aprovada'`. Devolver: motivo obrigatório no formulário, insert `review_events` (`tipo = 'devolucao'`, motivo), update `status = 'devolvida'`. O trigger de transição (`00045_inspection_status_transition_guard.sql`) já não restringe admin — nenhuma migration nova precisa aqui.

### 3.5 Edição do admin + auditoria (RF-35–37)

`lib/inspection/status.ts` — `isInspectionEditable` ganha um parâmetro de papel: `isInspectionEditable(status, role)` retorna `true` sempre que `role === 'admin'`, senão a lógica atual (`rascunho`/`devolvida`). Todo call site (`checklist/layout.tsx`, `[id]/page.tsx`) passa a buscar o papel do usuário atual junto com o status.

As 5 Server Actions em `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts` (`saveEscolhaAction`, `saveTextoAction`, `saveDataAction`, `saveMeasurementAction`, `attachPhotoAction`/`deletePhotoAction`) ganham um passo condicional: depois do save ter sucesso, se `users.role` de quem chamou é `admin`, insere uma linha em `audit_log_entries` (`admin_id`, `inspection_id`, `descricao` — texto simples tipo "Editou {nome do item}", `timestamp`). Sem diff de valor anterior/novo, conforme RF-36 explicita.

Quando a inspeção editada está com `status = 'aprovada'`: a tela mostra um banner (mesmo padrão de `.status-banner` já usado na tela de detalhe) tipo "Nota recalculada após esta edição — inspeção já estava aprovada", sem mudar o status nem travar nada.

### 3.6 Cancelamento (RF-60–61)

Botão "Cancelar inspeção" na tela de detalhe, visível só quando `status in ('rascunho', 'aguardando_aprovacao', 'devolvida')`. Motivo obrigatório, mesmo padrão de diálogo do Devolver. Insert `review_events` (`tipo = 'cancelamento'`, motivo), update `status = 'cancelada'`. RF-61 (não pode reabrir/editar) já é garantido de graça: `cancelada` não está em `('rascunho', 'devolvida')`, então nem a RLS de técnico nem a checagem `isInspectionEditable` liberam edição — só admin continua vendo a inspeção (read-only, sem os botões de ação).

### 3.7 Histórico (seção read-only, só admin)

Na tela de detalhe, quando `role === 'admin'`: seção "Histórico" com `review_events` (tipo, motivo, autor, timestamp) e `audit_log_entries` (descrição, admin, timestamp) da inspeção, mesclados e ordenados por `timestamp` desc. Sem paginação — volume por inspeção é pequeno.

### 3.8 Gestão de técnico (`/admin/tecnicos`)

Lista de `public.users where role = 'tecnico'`, com indicador de ativo/desativado (lido do campo `banned_until` que a Auth Admin API já expõe, não uma coluna própria). "Criar técnico": formulário (nome, email, senha temporária) → Server Action que chama `supabase.auth.admin.createUser({ email, password, email_confirm: true })` com um client Supabase inicializado com a service role key (só server-side, nunca exposta ao client), depois insert em `public.users` (`id` = id retornado, `nome`, `email`, `role = 'tecnico'`). "Desativar"/"Reativar": Server Action chama `auth.admin.updateUserById(id, { ban_duration: '876000h' })` (~100 anos, efetivamente permanente) ou `ban_duration: 'none'` pra reverter.

### 3.9 Botão de relatório (placeholder)

Na tela de detalhe, quando `status = 'aprovada'`: botão "Gerar relatório" desabilitado, texto auxiliar "Em breve" — sem handler, sem link. Fase 6 substitui por funcionalidade real.

## 4. Testes

- `isInspectionEditable(status, role)` — tabela verdade: admin sempre `true`; técnico como hoje (`rascunho`/`devolvida`).
- Roteamento: técnico batendo em `/admin/*` é redirecionado; admin batendo em `/inspections` (lista do técnico) é redirecionado — cobre os dois sentidos do guard.
- Server Actions de item (`saveEscolhaAction` etc.): quando quem chama é admin, `audit_log_entries` recebe 1 linha nova; quando é técnico, nenhuma linha nova.
- Aprovar/devolver/cancelar: cada um grava o `review_events.tipo` certo e o `status` resultante certo; devolver e cancelar rejeitam formulário sem motivo.
- Cancelamento: bloqueado quando `status` já é `aprovada`/`cancelada` (botão nem aparece — teste de render, não precisa de teste de RLS novo, o trigger `00045` já cobre transição por não-admin, e admin já é livre nele).
- Lista do admin: filtro/busca/ordenação sobre um array fixo de fixtures — sem mock de rede, é lógica pura de array.
- Criar/desativar técnico: mock do client admin do Supabase (`auth.admin.createUser`/`updateUserById`), sem chamada real — mesmo padrão dos outros testes de Server Action deste projeto que já mockam `@/lib/supabase/server`.

## 5. Fora de escopo

- Fase 6 (relatório real, link/PDF) — só o botão placeholder existe aqui.
- RF-63 (filtro `aplica_stand` por `tipo_cliente` na checagem de completude) — gap conhecido, já registrado como fora de escopo desde o sub-projeto 1.
- Reatribuir as inspeções de um técnico desativado pra outro técnico — não é necessário: o admin já tem edição universal (seção 3.5), consegue terminar/corrigir qualquer inspeção independente de quem a começou.
- Paginação/busca no servidor da lista do admin — YAGNI pro volume esperado; revisitar se o número de inspeções crescer muito.
- Editar `vehicle_data`/`client_data` de uma inspeção já criada — nem o técnico tem essa capacidade hoje (só no wizard de criação); fica de fora tanto pro técnico quanto pro admin, gap separado se for priorizado no futuro.
