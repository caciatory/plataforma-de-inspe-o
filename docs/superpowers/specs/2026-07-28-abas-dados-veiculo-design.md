# Design — Abas de dados do veículo (Peça 3, recorte 2)

## 1. Escopo

Peça 3, recorte 2 — segunda e (por ora) última fatia planejada da Fase 2.8 (redesign do checklist). Recorte 1 (tabela densa por subseção da tela de preenchimento) está concluído e mesclado em `main`. Este recorte cobre a reorganização em abas dos dados do veículo/cliente, hoje capturados num formulário único e longo.

**Fora de escopo deste recorte:**
- Tela de login — decisão fechada em conversa: já é um card simples e consistente com o resto do app, não precisa de mudança estrutural.
- Toggle "Modo Funcionário" da referência visual (troca entre visão técnico/admin) — descartado, papéis já são fixos por login (mesma decisão já tomada no recorte 1).
- Auditoria de outros formulários do app pelo bug de perda de valor em campo (ver §4) — fica como item separado futuro.
- Qualquer campo novo de dados que hoje não existe (histórico de manutenção, lista de equipamentos de fábrica) — ver §3.

## 2. Contexto e decisões de design

As screenshots de referência (as mesmas 6 usadas no recorte 1) mostram, além da tabela de checklist, um formulário de dados do veículo dividido em abas: **Identificação**, **Histórico**, **Especificações**, **Equipamentos**. O Check Auto não tem hoje nenhuma tela parecida — só um formulário único (`app/(app)/inspections/new/new-inspection-form.tsx`) com os campos de Cliente e Veículo em sequência numa página só, e uma tela de resumo pós-criação só-leitura (`app/(app)/inspections/[id]/page.tsx`, 5 campos).

**Decisões fechadas em conversa:**
- As 4 abas da referência viram uma **reorganização visual do formulário de criação existente**, não uma tela nova de consulta/edição pós-criação. Continua sendo preenchido uma vez, na criação da inspeção.
- Os dados de Cliente (que não encaixam em nenhuma das 4 abas de veículo) ganham uma 5ª aba própria, **Cliente**, mantendo os campos como estão hoje.
- **Histórico** e **Equipamentos** não têm nenhum campo hoje — ficam como abas navegáveis, mas com um aviso simples de "sem dados ainda" no lugar de campos. Nenhum campo novo é inventado neste recorte (YAGNI).
- Trocar de aba é **só troca de visualização no navegador** — nenhum dado é salvo por aba; o envio continua sendo um único `Guardar` no final, como hoje. Não é um assistente com salvamento por etapa.

## 3. Mapeamento de campos existentes → abas

Os 21 campos atuais (schema em `lib/inspection/schema.ts`, formulário em `new-inspection-form.tsx`) se dividem assim:

| Aba | Campos |
|---|---|
| **Cliente** | `tipoCliente`, `objetivo`, `nomeSolicitante`*, `contacto`, `email`, `responsavelPresente` (+ `StandAutocomplete`, exibido só quando `tipoCliente === "stand"`) |
| **Identificação** | `matricula`*, `marca`*, `modelo`*, `versaoTrim`, `anoFabrico`, `anoModelo`, `cor`, `vin`, `quilometragem`* |
| **Histórico** | (nenhum campo — aviso "sem dados ainda") |
| **Especificações** | `numeroMotor`, `numeroPortas`, `combustivel`, `caixaVelocidades`, `tracao`, `potenciaCv`, `torqueNm` |
| **Equipamentos** | (nenhum campo — aviso "sem dados ainda") |

(*) campos obrigatórios pelo schema Zod hoje (`nomeSolicitante`, `matricula`, `marca`, `modelo`, `quilometragem`).

A aba **Cliente** é a primeira/padrão ao abrir a tela — mantém a ordem de leitura de cima pra baixo que já existe hoje (Cliente antes de Veículo).

## 4. Bug real encontrado: campos perdem valor no erro de validação

Reproduzido ao vivo (`teste1@checkauto.pt`, dev server local): ao forçar um erro de validação no servidor (contornando a validação nativa do navegador via `form.noValidate`), os campos **controlados** por `useState` (`email`, `nomeSolicitante`, `contacto`, `tipoCliente`, `objetivo`) mantiveram o valor digitado; todos os campos **não controlados** (`matricula`, `marca`, `modelo`, `quilometragem`, e o resto — a maioria) foram apagados.

**Causa raiz confirmada:** o React reseta o formulário automaticamente depois que uma Server Action ligada via `<form action={...}>`/`useActionState` termina de rodar — sucesso ou erro, tanto faz. Campos controlados sobrevivem porque o React os redesenha a partir do estado guardado logo em seguida; campos não controlados não têm de onde restaurar o valor e ficam vazios.

**Correção, escopada só a este formulário (decisão em conversa — auditar os demais formulários do app fica pra depois):** todo campo de `NewInspectionForm` passa a ser controlado (par `useState`/`value`/`onChange`), inclusive os que hoje são simples `<input name=... />` sem estado. Isso resolve ao mesmo tempo (a) a persistência de valores entre troca de aba (necessária de qualquer forma, já que todos os campos continuam montados no mesmo `<form>`) e (b) este bug.

## 5. Comportamento das abas e validação entre abas

- Estado local `activeTab: "cliente" | "identificacao" | "historico" | "especificacoes" | "equipamentos"` no próprio `NewInspectionForm` (sem URL/query string — é um formulário ainda não salvo, não há necessidade de link direto pra uma aba específica, ao contrário do `?sub=` da tabela de checklist).
- Cada aba é uma barra de botões (`type="button"`, não links) — clicar troca `activeTab`, os `fieldset`s de todas as abas continuam no DOM (`hidden` via CSS quando não ativos), então o único `FormData` do envio final inclui todos os campos, de qualquer aba.
- **O atributo `required` nativo do HTML deixa de ser a defesa principal.** Um campo obrigatório escondido numa aba inativa (`display:none`/`hidden`) pode fazer a validação nativa do navegador bloquear o envio sem conseguir mostrar o aviso (o elemento não é focável) — resultado visível: o botão "Guardar" parece não fazer nada. A validação do servidor (Zod, já existente em `inspectionFormSchema`) continua sendo a fonte de verdade; `required` pode continuar presente nos inputs como reforço visual quando a aba estiver ativa, mas o fluxo não depende dele pra pegar erro nenhum.
- `CreateInspectionState` (hoje `{ status: "idle" } | { status: "error"; message: string }`) ganha um campo opcional a mais: `field?: string` — o nome Zod do primeiro campo que falhou (`parsed.error.issues[0]?.path[0]`). O componente usa um mapa fixo campo→aba (o mesmo da tabela em §3) pra trocar `activeTab` automaticamente quando `state.status === "error"` e `state.field` aponta pra um campo de outra aba.
- **Caso especial:** o `.refine()` de `tipoCliente === "stand" ⇒ objetivo === "venda"` não tem um campo único — ambos vivem na aba Cliente, então o erro cai lá naturalmente sem precisar de tratamento extra.

## 6. Estilo (CSS)

Nenhuma classe de aba existe hoje em `app/globals.css`. Novas classes, compostas só de tokens já existentes (`--space-*`, `--color-green-*`, `--radius-*`, `--font-family-*`), seguindo a mesma convenção do recorte 1: `.form-tabs`, `.form-tabs__button`, `.form-tabs__button--active`, `.form-tabs__panel` (mostra/esconde via `hidden` attribute, não `display` inline). Aba ativa usa a mesma paleta verde já estabelecida (sem gradiente, sem elemento decorativo) — nenhuma identidade visual nova, só uma barra de navegação horizontal simples.

## 7. Testes

- `new-inspection-form.test.tsx` (existente, 3 testes) continua passando sem mudança de comportamento nos casos já cobertos (stand/objetivo).
- Novo teste: depois de um erro simulado do servidor, um campo não-controlado anteriormente (ex. `matricula`) mantém o valor digitado — prova de que o bug do §4 foi corrigido.
- Novo teste: erro simulado apontando `field: "combustivel"` (aba Especificações) enquanto a aba ativa é Cliente — o componente troca sozinho para Especificações.
- Novo teste: clicar em cada aba mostra só os campos daquela aba (os demais ficam com `hidden`), sem remover do DOM (o valor digitado antes de trocar de aba continua presente no `FormData` final).
- Sem teste novo para Histórico/Equipamentos além de confirmar que a aba abre e mostra o aviso — não há lógica além disso.

## 8. Branch e integração

Nova branch dedicada (`worktree-peca3-abas-veiculo` ou equivalente, via `using-git-worktrees`). Segue o mesmo gate padrão do projeto (`docs/ROADMAP.md`, seção final): `requesting-code-review` → `ponytail-review` → `verify` (tem UI) → `verification-before-completion` → `finishing-a-development-branch`. `security-review` não se aplica — sem mudança de auth/RLS/permissões (o `create_inspection` RPC e suas validações continuam as mesmas, só a UI que monta o `FormData` muda).
