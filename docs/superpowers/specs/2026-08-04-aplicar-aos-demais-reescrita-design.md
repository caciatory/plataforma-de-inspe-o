# Design — Reescrita do "aplicar aos demais" (grupos de replicação)

## 1. Contexto e motivação

`docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md` desenhou a feature original (Fase 2.5), com um RPC atômico (`apply_opcoes_batch`, renomeado da Fase 2.8 Peça 1a) como mecanismo de gravação. Depois do redesign da tela de preenchimento (Peça 3) e da Fase 3 (autosave), a feature ficou quebrada: em teste ao vivo (2026-08-04), aplicar uma resposta em lote aos itens irmãos não refletia na tela até o técnico reabrir o diálogo manualmente.

Duas rodadas de patch pontual na mesma sessão, cada uma corrigindo uma causa raiz real mas insuficiente:

1. `BatchApplyPanel` navegava via `router.push()` de volta pra própria URL em vez de `router.refresh()` — Next.js trata navegação pra URL idêntica como no-op, então os dados nunca eram re-buscados. Corrigido.
2. Irmãos já respondidos eram permanentemente excluídos do painel de lote (`buildBatchRows` os descartava antes mesmo de renderizar) em vez de aparecerem desmarcados com opção de reincluir, perdendo o "Passo 1" do design original. Corrigido — reintroduzido com checkbox.
3. `EscolhaCell`/`TextoCell`/`DataCell` guardam a resposta num `useState` inicializado só uma vez no mount (`useState(response?.opcao_id ?? "")`) — quando o prop `response` muda por uma fonte externa (lote aplicado num irmão), o estado local não resincroniza. Tentativa de correção: `useEffect` observando `response?.opcao_id`. **Usuário reportou que o sintoma persiste mesmo depois desse terceiro patch.**

Por ser a mesma classe de sintoma sobrevivendo a 2 rodadas de correção pontual — sinal que `systematic-debugging` chama de "3+ fixes falharam, questionar a arquitetura em vez de tentar mais um fix isolado" — decisão do usuário: parar de remendar, reescrever o mecanismo de gravação e o de sincronização visual do zero, usando como referência o padrão que já funciona de forma comprovada para itens individuais (não-agrupados): Server Action salva → componente chama `router.refresh()` → prop atualiza → pronto, sem estado local duplicado sobrevivendo à mudança externa.

**Valor de negócio (motivo de investir na reescrita em vez de aceitar o estado atual):** grupos de replicação (ex.: 4 pneus, 4 portas, todos os faróis) agilizam bastante o tempo do técnico — responder um item e propagar a resposta pros irmãos evita repetir a mesma inspeção várias vezes.

## 2. Escopo

Reescreve **apenas** o mecanismo de gravação e o de sincronização visual do fluxo de "aplicar aos demais". A UX do diálogo (Passo 1 — lista de irmãos com checkbox, pré-marcados só os pendentes, nota "já respondido: X" nos que não estão; Passo 2 — formulário completo por item marcado: condição/observação/foto) já está correta e **não muda**.

**Fora de escopo:** grupo continua existindo só para itens `tipo='escolha'` (texto/data/medição não têm essa feature hoje — não é adicionada agora). O RPC `apply_opcoes_batch` fica no banco sem uso — sem migration de drop; é uma mudança de baixo risco e reversível se precisar dele de volta depois.

## 3. Mecanismo de gravação — reusar a Server Action individual

`BatchApplyPanel.handleConfirm()` para de chamar `applyOpcoesBatchAction`/RPC `apply_opcoes_batch`. Em vez disso, para cada linha marcada como `included`, monta um `FormData` (mesmo formato que `EscolhaCell.save()` já usa: `inspectionId`, `itemTemplateId`, `opcao_id`, `observacao`) e chama `saveEscolhaAction` diretamente — a mesma Server Action usada pelo salvamento individual — em sequência, dentro de um único `startTransition`. Se todas resolverem sem erro, um único `router.refresh()` no final.

**Tratamento de erro:** se alguma chamada retornar `{status: "error"}`, para o loop ali, mostra a mensagem de erro já retornada pela action (nomeando implicitamente o item, já que o erro aparece associado à linha em edição) e não continua pros itens seguintes. Itens já salvos com sucesso antes do erro permanecem salvos — **não é mais atômico** (o RPC antigo revertia o lote inteiro em caso de falha de um item; a Server Action individual não tem esse comportamento). Aceito explicitamente pelo usuário: a validação client-side já bloqueia confirmar com foto obrigatória faltando (mesma checagem que já existe hoje, sem mudança), então uma falha no meio do lote vira caso raro (rede caiu, etc.) em vez de fluxo comum — e nesse caso o técnico vê quais itens já ficaram salvos (reabrindo o diálogo, que já reflete estado real) e tenta de novo só os que faltaram.

## 4. Mecanismo de sincronização visual — remount por `key`, não `useEffect`

Troca a tentativa de sincronizar manualmente (`useEffect` observando `response?.opcao_id`) por remontagem via `key`. `EscolhaCell` (e, por consistência de padrão, `TextoCell`/`DataCell`) ganham uma `key` derivada do valor atual salvo — cada tipo de célula usa só o campo que lhe importa, montada no componente pai (`ChecklistItemTable`):

- `EscolhaCell`: `key={`${item.id}:${response?.opcao_id ?? "vazio"}`}`
- `TextoCell`: `key={`${item.id}:${response?.resposta_texto ?? "vazio"}`}`
- `DataCell`: `key={`${item.id}:${response?.resposta_data ?? "vazio"}`}`

Sempre que a resposta mudar por qualquer via externa ao próprio componente (lote aplicado, outro técnico editando a mesma inspeção), o valor usado na `key` muda, o React desmonta a instância antiga e monta uma nova — o `useState` inicial já lê o valor fresco do prop, sem depender de nenhuma sincronização manual. É o padrão do próprio React para "estado local que espelha um prop que pode mudar por uma fonte externa ao componente", mais robusto que um efeito (nenhuma dependência de array pra acertar, nenhuma janela onde o efeito ainda não rodou).

Efeito colateral aceito: qualquer estado transitório da célula (ex.: uma mensagem de erro de uma tentativa anterior) é descartado no remount — correto, porque o remount só acontece quando a resposta no servidor genuinamente mudou, e nesse ponto um erro anterior já não é mais relevante.

## 5. Testes

- `BatchApplyPanel`: teste comprovando que confirmar chama `saveEscolhaAction` uma vez por linha incluída, com o `FormData` correto; teste de falha no meio do lote (uma chamada retorna erro) — as chamadas seguintes não acontecem, a mensagem de erro aparece, `router.refresh()` não é chamado.
- `ChecklistItemTable`/`EscolhaCell`: teste comprovando que, ao re-renderizar com uma prop `responses` atualizada externamente (simulando o efeito de um `router.refresh()` pós-lote), a linha do irmão aparece como "respondido" e o pill mostra a opção certa **sem precisar de nenhuma interação adicional** — esse é o teste que teria pego os 2 patches anteriores antes de eu achar que estavam prontos, e é o critério de "pronto" desta reescrita.
- Suite completa (`npm test`) e `tsc --noEmit` limpos antes de considerar concluído.
- Verificação manual no navegador pelo usuário: aplicar em lote, fechar o diálogo, confirmar que a tela reflete sem reabrir nada.
