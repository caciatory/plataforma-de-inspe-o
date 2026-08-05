# Design — Fase 5 Sub-Projeto 1: Finalização do Técnico (RF-23/24, RF-33/34)

## 1. Contexto e bloqueio original

RF-23/24 (`docs/especificacao-tecnica-v1.md`) descrevem o botão de finalizar/enviar inspeção que o técnico usa ao terminar o preenchimento — tecnicamente parte da Fase 1, mas nunca implementado: grep exaustivo confirma que `inspections.status` nunca é atualizado em lugar nenhum do código da app. Isso bloqueia a Fase 5 (RF-31, aprovação do admin) porque não existe nada que tenha sido "enviado" ainda.

**Decisão:** em vez de tratar isso como um ciclo prévio separado, o gap entra como o primeiro dos 3 sub-projetos sequenciais da Fase 5:

1. **Finalização do técnico (RF-23/24, RF-33/34) — este documento.**
2. Lista do admin + aprovação/devolução (RF-31–34, RF-57–59, RF-62).
3. Edição do admin + auditoria + cancelamento (RF-35–37, RF-60–61).

## 2. Decisões fechadas com o usuário

- **Botão vive na página de resumo da inspeção** (`app/(app)/inspections/[id]/page.tsx`), não na tela da checklist. Essa página hoje só mostra dados básicos + link "Ir para a checklist"; passa a mostrar também status, motivo de devolução (quando houver) e o botão de ação.
- **Checagem de completude reaproveita `computeGroupProgress`** (`lib/checklist/progress.ts`), somando `pendentes` de todos os grupos ativos. **Sem filtro por `aplica_stand`** — RF-63 (filtragem por `tipo_cliente`) é um gap conhecido e separado, deferido explicitamente pelo usuário: conta-se todos os itens do template independente do tipo de cliente.
- **Botão bloqueado detalha pendências por grupo** (ex: "Pneus: 3 pendentes, Travões: 1 pendente"), não só um total agregado.
- **Botão habilitado exige diálogo de confirmação** antes de mudar `status` para `aguardando_aprovacao` — porque o técnico perde acesso de edição assim que envia.
- **Mesmo botão trata reenvio pós-devolução (RF-34)**: quando `status = 'devolvida'`, o label muda para "Reenviar para aprovação" e o motivo da devolução (mais recente `review_events` com `tipo = 'devolucao'` para essa inspeção) aparece acima do botão.
- **Bloqueio de edição já existe na RLS** — `owns_editable_inspection()` (`supabase/migrations/00008_rls_helpers_and_core.sql:23`) só permite escrita do técnico quando `status in ('rascunho', 'devolvida')`. Nenhuma RLS nova é necessária. A UI só precisa detectar esse mesmo estado e mostrar banner read-only + desabilitar controles nas telas de checklist quando o status atual não permite edição, em vez de deixar o técnico bater num erro de RLS sem explicação.
- **`review_events` fica fora de escopo para inserção** — essa tabela registra ações do *admin* (aprovação/devolução/cancelamento via sub-projeto 2), não o envio do técnico. Este sub-projeto só lê `review_events` (pra mostrar motivo de devolução) e escreve em `inspections.status`.

## 3. Detalhes técnicos

### 3.1 Página de resumo (`app/(app)/inspections/[id]/page.tsx`)

Query adicional: buscar grupos/itens/respostas ativos da inspeção (mesmo padrão já usado na tela de checklist) para alimentar `computeGroupProgress`, e o `review_events` mais recente com `tipo = 'devolucao'` quando `status = 'devolvida'`.

Estados do botão, por `inspection.status`:

| status | botão | comportamento |
|---|---|---|
| `rascunho`, com pendências | "Finalizar inspeção" desabilitado | lista pendências por grupo |
| `rascunho`, sem pendências | "Finalizar inspeção" habilitado | confirmação → `status = 'aguardando_aprovacao'` |
| `devolvida`, com pendências | "Reenviar para aprovação" desabilitado | motivo de devolução visível + pendências por grupo |
| `devolvida`, sem pendências | "Reenviar para aprovação" habilitado | confirmação → `status = 'aguardando_aprovacao'` |
| `aguardando_aprovacao`, `aprovada`, `cancelada` | sem botão de ação | só leitura |

### 3.2 Read-only na checklist

Nas telas de preenchimento (`app/(app)/inspections/[id]/checklist/**`), quando `status` não está em `('rascunho', 'devolvida')`: banner explicando que a inspeção não está mais editável + inputs/controles desabilitados no client. Não é uma segunda fonte de verdade — só espelha a mesma condição que `owns_editable_inspection()` já aplica no banco, para dar feedback em vez de um erro de RLS cru.

### 3.3 Mutação de status

Uma única função/server action que recebe `inspection_id`, valida no servidor que `pendentes === 0` (não confia só no estado desabilitado do botão no client) e faz `update inspections set status = 'aguardando_aprovacao' where id = ...`. A própria RLS de `owns_editable_inspection()` já impede a escrita se o status não permitir — a validação de completude é a única regra nova, e vive nessa função, não duplicada em cada chamador.

## 4. Testes

- `computeGroupProgress` já tem cobertura própria — não é retestado aqui.
- Teste de integração (ou SQL) do update de status: bloqueia quando há pendências, permite quando não há, respeita a RLS de `owns_editable_inspection()` (tentativa de update com status `aguardando_aprovacao`/`aprovada`/`cancelada` falha).
- Teste do botão/label conforme a tabela do §3.1 (rascunho vs. devolvida, com/sem pendências).

## 5. Fora de escopo

- RF-63 (filtro `aplica_stand` por `tipo_cliente`) — gap separado, não corrigido aqui.
- Qualquer inserção em `review_events` (fica para o sub-projeto 2, ações do admin).
- Sub-projetos 2 e 3 da Fase 5 (lista/aprovação do admin; edição do admin/auditoria/cancelamento).
