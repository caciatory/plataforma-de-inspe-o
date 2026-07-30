# Design — Ajustes em Histórico e Equipamentos (pós recorte 3)

## 1. Escopo

Continuação, na mesma branch/worktree `peca3-recorte3-historico-equipamentos` (ainda não mesclada em `main`), do recorte 3 da Fase 2.8 (`docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md`). Dois ajustes pedidos pelo usuário depois de ver o recorte 3 funcionando:

1. Aba **Histórico**: trocar o tipo de um campo existente, mudar outro de texto livre pra Sim/Não com anotação condicional, e adicionar um bloco novo de campos sobre importação/IUC.
2. Aba **Equipamentos**: acordeões de categoria iniciam fechados, itens preenchidos compactam automaticamente, e o cabeçalho de cada categoria mostra uma contagem de progresso.

**Fora de escopo:**
- Edição pós-criação — mesma decisão do recorte 3 (§1 do spec anterior), nenhuma aba tem tela de edição hoje.
- Lista de países validada externamente (API de geolocalização, ISO 3166 completo) — lista curta hardcoded, ver §2.3.
- Alerta visual quando "Isenção de ISV aplicada" é marcada — decisão do usuário: sem UI extra, só o dado fica guardado.

## 2. Aba Histórico — mudanças no modelo de dados

Nova migração `00040_historico_veiculo_v2.sql`, mesmo padrão de drop+recreate do RPC já usado em `00038`/`00039` (a assinatura anterior a dropar é a de `00039_equipamentos_inspecao.sql`, que já inclui `p_equipamentos`).

### 2.1 Campo que muda de tipo

| Campo (spec) | Coluna | De | Para |
|---|---|---|---|
| Situação fiscal regular | `situacao_fiscal_regular` | `boolean not null default false` | `text` |

`alter column situacao_fiscal_regular type text using (case when situacao_fiscal_regular then 'Sim' else '' end)`, depois remove `not null default false` (texto livre, opcional); `alter table vehicle_data drop column situacao_fiscal_observacoes`. O campo removido (textarea separado) vira redundante — o texto livre já cobre o caso (decisão do usuário: "textarea substitui só o checkbox", e como não há mais duas coisas pra dizer, o textarea de observações não tem mais razão de existir separado). UI: um único `TextareaWithCounter` reaproveitado (já existe desde o recorte 3), label "Situação fiscal (ex.: IUC em dia)".

### 2.2 Campo que ganha um gate Sim/Não

| Campo (spec) | Coluna nova | Tipo | Papel |
|---|---|---|---|
| Indícios de adulteração de quilometragem | `indicios_adulteracao_presentes` | `boolean not null default false` | Sim/Não |
| Anotações / detalhes | `indicios_adulteracao_km` (já existe) | `text` | Continua o mesmo campo, agora só visível/relevante quando o primeiro é `true` |

Não há rename de coluna — `indicios_adulteracao_km` já era um campo de texto livre; passa a ser o "detalhe" condicional em vez do campo principal. UI: `SimNaoRadio` (novo, §2.4) seguido do `TextareaWithCounter` existente, escondido (`hidden`) enquanto a resposta não for "Sim".

### 2.3 Bloco novo — Importação

Todas as colunas novas, nullable (só relevantes quando `veiculo_importado = true`):

```
veiculo_importado boolean not null default false
pais_origem text
matricula_origem text
data_importacao date
possui_coc boolean
isencao_isv_aplicada boolean
numero_dav text
```

UI: `SimNaoRadio` pra "Veículo importado?"; o resto do bloco (`PaisOrigemSelect`, matrícula de origem, data de importação, COC, isenção ISV, número DAV) só renderiza com `hidden={!veiculoImportado}`, mesmo padrão já usado pra condição/comentário em `EquipamentoItem`.

`PaisOrigemSelect` — select com lista curta hardcoded (Alemanha, França, Espanha, Itália, Bélgica, Holanda, Luxemburgo) + opção "Outro", que ao ser escolhida revela um input de texto livre ao lado pro nome do país (mesmo padrão visual do dialog de item personalizado em Equipamentos). Constante em `lib/historico/paises.ts`, mesmo espírito de `lib/equipamento/catalog.ts` — dado fixo, sem tabela.

### 2.4 Campos soltos

```
data_primeira_matricula date
valor_base_iuc_anual numeric
```

`data_primeira_matricula`: `<input type="date">`, mesmo padrão de `inspecoesPeriodicasIpoData`. `valor_base_iuc_anual`: `ValorMoedaInput` (novo) — input controlado que formata como moeda pt-PT (`Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })`) ao perder o foco; ao digitar aceita dígitos e vírgula/ponto livremente, sem máscara em tempo real. Sem dependência nova.

### 2.5 `SimNaoRadio` (componente novo, compartilhado)

```ts
SimNaoRadio({ name, label, value, onChange }: {
  name: string; label: string; value: "" | "sim" | "nao"; onChange: (v: "sim" | "nao") => void
})
```

Par de radio, mesmo visual dos radios de condição (`✓ Bom` / `⚠️ Atenção`) em `equipamento-categoria.tsx`. 4 usos: indícios de adulteração, veículo importado, possui COC, isenção ISV — duplicação real (não especulativa), justifica o componente.

### 2.6 Schema, tabs, RPC, Server Action

`inspectionFormSchema` (Zod): `situacaoFiscalRegular` vira `z.string().optional()` (era boolean preprocessado); `indiciosAdulteracaoPresentes` novo (`"sim"|"nao"` → boolean); campos do bloco importação e os dois soltos, todos opcionais exceto o gate `veiculoImportado`. `lib/inspection/tabs.ts` mapeia todos os campos novos pra `"historico"`. `create_inspection` RPC ganha os parâmetros correspondentes (`default null`/`default false`), Server Action (`actions.ts`) repassa como já faz com os campos do recorte 3.

## 3. Aba Equipamentos — acordeão, compactação e badge

### 3.1 Acordeão fechado por padrão

`equipamento-categoria.tsx`: remove o atributo `open` de `<details className="equip-categoria">`. Nativo, sem estado React — `<details>` já fecha por padrão.

### 3.2 Compactação automática do item

Novo estado local em `EquipamentoItem`: `const [expandido, setExpandido] = useState(true)`.

- Marcar o checkbox (`selecionado: false → true`) → `setExpandido(true)`.
- `onBlur` no `<li>` (evento delega de qualquer filho): se `e.relatedTarget` não é descendente do `<li>` (foco saiu do item por completo) **e** `condicao !== ""`, compacta (`setExpandido(false)`). Vale igual pra "Bom" e "Atenção" — confirmado com o usuário que ambos esperam a saída de foco, não compactam no clique do radio.
- Compactado (`!expandido`): renderiza uma linha de resumo — `{nome} — {condicao === "bom" ? "✓ Bom" : "⚠️ Atenção"}` — com `role="button"` e `onClick` que faz `setExpandido(true)`. Os inputs (checkbox, radios, textarea, fotos) continuam montados no DOM, só com `hidden`, igual ao padrão já usado em `.equip-item__answer` — nada se perde do `FormData`.
- Desmarcar o checkbox nunca deixa o item compactado (a condição fica vazia, a guarda do blur não dispara) — sem caso especial extra.

### 3.3 Badge de progresso por categoria

`EquipamentoItem` ganha prop `onVerificadoChange?: (index: number, verificado: boolean) => void`. "Verificado" = `selecionado && condicao !== ""`. Chamado nos handlers `onChange` dos radios de condição (quando passa a ter valor) **e** no `onChange` do checkbox `selecionado` (quando desmarcado, mesmo que `condicao` continue preenchida internamente pelo comportamento já decidido no recorte 3 de preservar dados ao desmarcar — um item desmarcado não foi inspecionado, não deve contar no badge).

`EquipamentoCategoria` mantém `const [verificados, setVerificados] = useState<Set<number>>(new Set())`, atualizado pelo callback. Total de itens = `itensPreDefinidos.length + itensPersonalizados.length` (confirmado: contagem é "verificados/total", não só verificados). No `<summary>`, quando `verificados.size > 0`: badge `✓ {verificados.size}/{total} verificados`.

Esse é o único estado que sobe do item pro card — o resto (`condicao`, `comentario`, `expandido`) continua local ao item; evita controlar cada input do pai, que seria um diff bem maior pra resolver só uma contagem.

### 3.4 CSS

Duas classes novas em `app/globals.css`: `.equip-item--compactado` (linha de resumo) e `.equip-categoria__badge` (badge no summary) — reaproveitam os tokens de cor/spacing já usados em `.equip-item*`/`.equip-categoria*`.

## 4. Testes

- `lib/inspection/schema.test.ts`: `situacaoFiscalRegular` aceita texto livre; `indiciosAdulteracaoPresentes` idem estrutura de outros gates; bloco de importação opcional.
- Componentes novos (`sim-nao-radio.test.tsx`, `pais-origem-select.test.tsx`, `valor-moeda-input.test.tsx` ou agrupados): renderizam, formatam moeda no blur, "Outro" revela input de texto.
- `new-inspection-form.test.tsx`: bloco de importação só aparece com "Sim"; situação fiscal é campo de texto único (textarea de observações não existe mais).
- `equipamento-categoria.test.tsx`: categoria inicia fechada (`<details>` sem `open`); badge aparece/atualiza ao marcar condição; item compacta no blur com condição preenchida (testado pra "Bom" e "Atenção"); não compacta ao tabular entre campos internos do mesmo item; clicar no resumo reabre.
- `supabase/tests/00040_historico_veiculo_v2.test.sql`: `situacao_fiscal_regular` convertida pra text preservando dado; colunas novas existem com os tipos certos; RPC aceita e persiste os novos parâmetros; regressão — parâmetros dos recortes anteriores (Histórico v1, Equipamentos) continuam funcionando.

## 5. Branch e integração

Continua na branch/worktree existente (`peca3-recorte3-historico-equipamentos`), ainda não mesclada — mesmo gate do recorte 3 se aplica ao conjunto final: `requesting-code-review` → `ponytail-review` → `verify` → `verification-before-completion` → `finishing-a-development-branch`.
