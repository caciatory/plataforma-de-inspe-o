# Design — Fase 3: Autosave online (auditoria e correção)

## 1. Escopo

Fase 3 do roadmap (`docs/especificacao-tecnica-v1.md` §1.7/§Confiabilidade): RF-25 a RF-27, RNF-22. A exploração inicial (feita antes deste doc, ver conversa de brainstorming) encontrou que a maior parte do requisito **já está implementada** desde as fases de preenchimento de item (Fase 2) e o redesign da tabela por subseção (Peça 3 recorte 1):

- **RF-25** (salvar direto ao servidor a cada alteração) — ✅ já existe: escolha salva no `onChange`, texto/data salvam no `onBlur`, tudo via Server Action disparada com `useTransition`, sem botão de salvar intermediário.
- **RF-27** (upload de foto síncrono com indicador) — ✅ já existe: `PhotoManager` faz upload direto ao Storage e mostra "A processar..." durante o envio.
- **RF-26** (erro visível + retry manual) — ⚠️ parcial: a célula de escolha tem botão "Tentar novamente" explícito; texto/data só mostram a mensagem de erro, sem botão (retry só acontece se o campo perder o foco de novo sem mudar o valor, comportamento não óbvio pro técnico).

O trabalho real desta fase, portanto, é **auditoria e correção de gaps**, não construção de autosave do zero:

1. Eliminar o "piscar" da tela a cada resposta salva (pendência já registrada no `ROADMAP.md`, adiada de propósito na Peça 3 recorte 1).
2. Padronizar o botão de retry em texto/data, igual ao que a célula de escolha já tem.
3. Ajustar o fechamento do diálogo de medição, que hoje depende de um efeito colateral do bug que está sendo corrigido.

**Fora de escopo:**
- Retry de foto sem reselecionar o arquivo — decisão do usuário: reselecionar é aceitável (falha de upload é rara; guardar o `File` em estado seria complexidade extra pra um caso raro).
- Fila de sincronização offline (RF-28 a RF-30) — explicitamente removida do escopo do v1.0 pela própria especificação técnica.
- Redesenho do fluxo de autosave em si — já funciona, não precisa mudar de forma.

## 2. Causa raiz do "piscar"

As 4 Server Actions que salvam uma resposta de item (`saveEscolhaAction`, `saveTextoAction`, `saveDataAction`, `saveMeasurementAction`, em `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`) terminam com `redirect(nextUrl)`. `nextUrl` (passado como `pageUrl` desde `ChecklistItemTable`) é sempre a **mesma página** onde o técnico já está — resquício do fluxo anterior à Peça 3 recorte 1, quando cada item tinha sua própria página e fazia sentido navegar pro "próximo item" depois de salvar. Hoje, com todos os itens numa única tabela densa por subseção, isso vira um redirect pra si mesmo a cada resposta — a árvore de componentes remonta inteira (inclusive fechando qualquer `<dialog>` aberto, como o de medição), causando o flash visível.

A ação `applyOpcoesBatchAction` ("aplicar aos demais") já **não** segue esse padrão — retorna `{}`/`{error}` e deixa o cliente (`BatchApplyPanel`) decidir o que fazer via `router.push` + callback `onSuccess`. Esta fase estende o mesmo espírito (controle do lado cliente) às 4 actions restantes, mas usando `router.refresh()` em vez de `router.push()`, porque não há necessidade de navegação nenhuma — só de re-buscar os dados do servidor (status "respondido", ícone de família, contadores da sidebar) sem trocar de URL, sem resetar scroll, sem remontar a árvore toda.

## 3. Mudanças

### 3.1 Server Actions

Em `actions.ts`, remove `redirect(nextUrl)` das 4 funções e o parâmetro `nextUrl` de cada uma (lido de `formData.get("nextUrl")`). Tipos de retorno ganham um caminho de sucesso explícito:

- `saveEscolhaAction`, `saveTextoAction`, `saveDataAction`: sem `redirect`, retornam `{ status: "idle" }` no sucesso (já é o shape usado hoje pro estado inicial — como essas 3 são chamadas via `startTransition` direto, não via `useActionState`, o componente já lida com "não é erro" sem precisar de um variant novo).
- `saveMeasurementAction`: como `ItemMedicaoForm` usa `useActionState` ligado a um `<form>` real, precisa de um jeito de o componente reagir a "acabou de salvar com sucesso" (pra fechar o diálogo) — `SaveMeasurementState` ganha um terceiro variant, ficando `{ status: "idle" } | { status: "error"; message: string } | { status: "success" }`; a função retorna `{ status: "success" }` no lugar do `redirect(nextUrl)` que tinha antes.

`redirect` deixa de ser importado em `actions.ts` (nenhuma das 4 funções passa a usá-lo; as outras funções do arquivo — `attachPhotoAction`, `deletePhotoAction`, `applyOpcoesBatchAction` — já não usavam).

### 3.2 `nextUrl`/`pageUrl` — remoção de ponta a ponta

Sem a finalidade de alimentar um `redirect()`, o parâmetro vira código morto e é removido de toda a cadeia: prop `pageUrl` de `ChecklistItemTable`, prop `nextUrl` de `EscolhaCell`/`TextoCell`/`DataCell`/`MedicaoCell`/`ItemMedicaoForm`, campo `nextUrl` no `FormData` de cada save, `<input type="hidden" name="nextUrl">` em `ItemMedicaoForm`, e a leitura correspondente em cada Server Action. O caller de `ChecklistItemTable` (`app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`) para de passar essa prop.

### 3.3 Cliente — `router.refresh()` depois de salvar

`checklist-item-table.tsx` importa `useRouter` de `next/navigation`. `EscolhaCell`, `TextoCell`, `DataCell`: dentro do `startTransition` que já existe, depois de `await saveXAction(...)`, se `result.status !== "error"` chama `router.refresh()`.

`MedicaoCell`/`ItemMedicaoForm`: `MedicaoCell` ganha uma função local:
```ts
function handleMedicaoSaved() {
  router.refresh();
  dialogRef.current?.close();
}
```
passada como novo prop `onSuccess` pra `ItemMedicaoForm`. Dentro de `ItemMedicaoForm`, um `useEffect` observa `state`:
```ts
useEffect(() => {
  if (state.status === "success") onSuccess?.();
}, [state, onSuccess]);
```

Resultado: o diálogo de medição continua fechando sozinho depois de salvar (mesmo comportamento visível de hoje — decisão do usuário), só que agora por uma chamada explícita em vez de um efeito colateral do `redirect()`, e sem o flash de navegação.

### 3.4 Retry padronizado em texto/data

`TextoCell` e `DataCell` ganham a mesma estrutura que `EscolhaCell` já tem: a lógica hoje dentro de `handleBlur` vira uma função `save(currentValue: string)` reutilizável, chamada tanto pelo `onBlur` (quando o valor muda) quanto por um botão novo:
```tsx
{error && (
  <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(value)}>
    Tentar novamente
  </button>
)}
```
— mesmo texto e classe CSS do botão que `EscolhaCell` já usa (`app/globals.css` não precisa de classe nova).

## 4. Testes

- **`actions.test.ts`**: os 4 testes atualmente chamados "...e redireciona pra `nextUrl` no sucesso" mudam pra "...e retorna estado de sucesso, sem redirect" — removem a asserção `expect(redirect).toHaveBeenCalledWith(...)` e adicionam `expect(result).toEqual({ status: ... })` (`"idle"` pras 3 primeiras, `"success"` pra medição); o mock de `next/navigation` deixa de precisar simular `redirect` lançando (já que nenhuma das 4 o chama mais) — mock vira só `{}` ou é removido se nada mais no arquivo depender dele.
- **`checklist-item-table.test.tsx`**: novo mock `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))` no topo do arquivo. Novos casos: salvar escolha/texto/data com sucesso chama `refreshMock`; texto/data mostram e conseguem usar o botão "Tentar novamente" quando o save falha (mock da action retornando erro); salvar medição com sucesso chama `refreshMock` e fecha o `<dialog>` (verificado via `dialogRef`/estado `open` do elemento, mesmo padrão de teste já usado pro diálogo de item personalizado noutra parte do app).
- Suíte inteira (`npm test -- --run`) e `tsc --noEmit` verdes ao final.

## 5. Verificação manual

Como o núcleo da mudança é comportamento de navegação/re-render que `jsdom` não reproduz fielmente (mesma razão pela qual o próprio bug do piscar só foi notado ao vivo no navegador, não pelos testes), a verificação ponta a ponta no navegador é obrigatória antes de fechar esta fase: responder um item de escolha, texto, data e medição em sequência na tabela e confirmar visualmente que a tela não pisca/não perde a posição de scroll, que os contadores da sidebar e o ícone de família atualizam, e que o diálogo de medição fecha sozinho ao salvar.
