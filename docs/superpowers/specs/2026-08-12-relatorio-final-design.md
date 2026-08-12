# Design — Fase 6: Relatório final da inspeção (RF-43 a RF-53, RNF-13)

## 1. Contexto e escopo

Depois da Fase 5 (aprovação do admin) e da remoção de duplicação Identificação/Histórico, o botão "Gerar relatório" na página de resumo (`app/(app)/inspections/[id]/page.tsx:216-220`) continua desabilitado com `title="Em breve"`. Esta fase constrói esse relatório de verdade: uma página web, acessível só a usuários autenticados, que consolida os dados já existentes da inspeção (veículo, respostas da checklist, pontuação) num documento apresentável ao cliente final.

**Fora de escopo desta fase** (confirmado com o usuário):
- Acesso público sem login (RF-52 — tela pública por código de certificado fica para fase futura).
- Pipeline de PDF dedicado (RF-49 — impressão via CSS do navegador é suficiente; PDF só entra se virar necessidade real).
- Seção "Evidências Visuais" (galeria de fotos avulsas) — explicitamente excluída pelo usuário do design do mockup de referência.
- Gráfico radar de 5 eixos do mockup de referência — não mapeia para nenhum agrupamento real de dados do sistema atual; descartado.

## 2. Identidade visual — exceção deliberada ao design system

Esta página usa uma identidade visual **exclusiva**, deliberadamente diferente do design system claro/verde do resto do app (`DESIGN.md`): fundo escuro (glassmorphism), acento verde-menta, tipografia `DM Sans`, ícones `Material Symbols Outlined`. Referência: mockup fornecido pelo usuário (`relat_rio_de_inspe_o_premium_tech_v2/code.html`), adaptado com dados reais do Check Auto (não o conteúdo fictício "Inspecta"/Porsche do mockup) e com as seções descritas abaixo — decisão confirmada explicitamente pelo usuário, não uma tentativa de reconciliar com o restante do app.

## 3. Decisões fechadas com o usuário

- **Acesso**: só autenticado (admin ou o técnico responsável, mesma regra de leitura já aplicada em outras telas da inspeção). Link/botão "Gerar relatório" na página de resumo passa a ficar habilitado apenas quando `status = 'aprovada'`, apontando para `/inspections/[id]/relatorio`.
- **Fotos de capa + dados do parceiro são geridos numa seção separada, a qualquer momento após a aprovação** — não bloqueiam a aprovação em si. Um botão novo **"Fotos & Parceiro"** aparece na tabela do admin (`app/(app)/admin/inspections-table.tsx`), ao lado do botão "Ver" existente, **só quando `status = 'aprovada'`**. Clicar abre uma caixa de diálogo com:
  - Upload de 10-15 fotos de capa (`photos`, `contexto = 'capa'`, `item_response_id = null` — schema já suporta, RLS `photos_insert`/`photos_delete` já permitem `is_admin()` incondicionalmente, sem mudança de RLS necessária).
  - Campos do parceiro: nome, logo (upload de imagem), telefone.
- **Parceiro (stand/revendedor)**: substitui o espaço do gráfico radar descartado. Nome + logo + telefone, exibidos com o telefone como link `https://wa.me/<dígitos>` (WhatsApp). **Preenchido do zero pelo admin** — texto livre, não puxado de `client_data` (evita qualquer conflito com RF-50, já que `client_data` guarda dados do *solicitante*, um conceito diferente do *parceiro/stand*). Campos opcionais (nullable) — nem toda inspeção tem parceiro associado; quando vazios, o bloco não aparece no relatório.
- **Código de certificado**: 8 caracteres aleatórios maiúsculos+números (ex: `CK7X29QP`), gerado automaticamente dentro de `approveInspectionAction` (`app/(app)/inspections/[id]/actions.ts`) no momento em que `status` passa a `'aprovada'`. Atende RNF-13 (não sequencial/não adivinhável) por construção.
- **RF-45 (filtros) substituído por destaque em grupo**: a ideia original de filtros "Todos / Pontos de Atenção / Com Fotos" foi trocada, por proposta do usuário, por: grupos mostram um ícone de atenção quando contêm algum item "ruim"; ao abrir o grupo, os itens problemáticos ficam **destacados no lugar** (card com tom vermelho), sem reordenar para o topo. O filtro "Com Fotos" também foi descartado — a foto aparece como ícone no próprio item, sem filtro dedicado.
- **Grupos/subcategorias/itens — hierarquia de exibição**:
  - Só grupos com pelo menos um item avaliado aparecem (RF-46, reaproveita a mesma lógica de `computeGroupProgress`/`groupItemsBySubcategoria`).
  - Cada grupo é colapsável, com contagem "N OK / M atenção" no cabeçalho (os ícones `check_circle`/`warning` pedidos explicitamente pelo usuário) e um ícone de atenção no cabeçalho do próprio grupo quando `M > 0`.
  - Dentro do grupo, itens aparecem agrupados por subcategoria (mesma subdivisão da checklist).
  - Cada item mostra: nome, badge da resposta selecionada (cor derivada via `resolveEscolhaColorModifier`, `lib/checklist/siblings.ts:88-101` — ótimo/médio/ruim/NA), nunca a lista de opções não escolhidas.
  - Itens "ruim" recebem destaque visual automático (RF-48) — card com tom vermelho, sem ação manual do admin.
- **Ícones de foto e comentário no item**:
  - Ícone de foto: só aparece se o item tem fotos (`photos` com `contexto = 'item'` e `item_response_id` daquela resposta). Clique abre diálogo com a(s) foto(s).
  - Ícone de comentário (informação): só aparece se `checklist_item_responses.observacao` não é vazio. Clique abre diálogo com o texto do comentário.
  - **Quando o item tem comentário E é classificado como problemático** (mesmo critério de destaque do RF-48), o ícone de comentário pisca (animação sutil, respeitando `prefers-reduced-motion: reduce`) para chamar atenção do cliente assim que a página abre. Itens sem problema não piscam, mesmo com comentário.
  - Os dois ícones (foto e comentário) podem coexistir no mesmo item e abrem diálogos independentes.
- **Especificações do veículo**: grid de cards com os campos reais de `vehicle_data` — matrícula, marca, modelo, versão (`versao_trim`), ano de fabrico, ano do modelo, cor, VIN, motor (`numero_motor`), portas (`numero_portas`), combustível, caixa de velocidades (`caixa_velocidades`), quilometragem. Sem filtros/abas nessa seção — grid direto, ampliando a versão mais enxuta considerada inicialmente.
- **Classificação final**: usa `inspection_score` real (`nota_geral`, `classificacao` A/B/C — **não existe grau "A+"**, ao contrário do mockup). Gauge circular de pontuação com a nota real (0-10, não 0-100 como no mockup — a escala do mockup é só estética, adaptada à escala real do sistema).
- **Selo "Elegível para Garantia"**: mantido no bloco de veredito final, **por decisão explícita do usuário**, apesar de o sistema não ter nenhum conceito de garantia real associado à inspeção. Não deriva de nenhum dado — é um selo fixo de branding do Check Auto, não uma afirmação condicionada a dados da inspeção.
- **RF-50**: `client_data` (nome/contacto/email do solicitante) nunca é consultado nem exibido nesta página. Só `vehicle_data` (dados técnicos) e o novo bloco de parceiro (dado independente, digitado pelo admin) aparecem.
- **RF-49 / impressão**: web é a prioridade; impressão usa CSS `@media print` do navegador, sem pipeline de PDF. Quando impresso, todo o conteúdo relevante sai na página (não esconder itens "sem problema" ou colapsados — impressão expande tudo).
- **Rodapé**: nome do técnico responsável (`inspections.tecnico_id → users.nome`) e `credencial_interna` quando existir (RF-53), + código do certificado + data de emissão.

## 4. Modelo de dados

### 4.1 Nova migration — campos do parceiro

Adiciona 3 colunas nullable em `inspections` (mesmo padrão de `codigo_certificado`/`certificado_emitido_em`, já existentes desde a migration 00001):

```sql
alter table public.inspections
  add column parceiro_nome text,
  add column parceiro_logo_url text,
  add column parceiro_telefone text;
```

Sem RLS nova: a policy `inspections_update` (00008) já permite `is_admin()` independente de status — cobre a escrita pós-aprovação desses campos.

### 4.2 Geração do certificado

`approveInspectionAction` (`app/(app)/inspections/[id]/actions.ts:69-103`) passa a gerar o código junto com a mudança de status:

```ts
function gerarCodigoCertificado(): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
}
```

No update que já existe (`.update({ status: "aprovada" })`), soma `codigo_certificado: gerarCodigoCertificado(), certificado_emitido_em: new Date().toISOString()`. Colisão é praticamente impossível (36^8 combinações) e a coluna já tem `unique` — se o update falhar por colisão de unicidade, tratar como erro genérico da action (mesmo padrão de erro já usado ali), sem retry automático (YAGNI — nunca deve acontecer na prática).

### 4.3 Fotos de capa + parceiro — dialog do admin

Novo botão "Fotos & Parceiro" em `app/(app)/admin/inspections-table.tsx`, visível só quando `r.status === 'aprovada'` (precisa expor `status` em `AdminInspectionRow`, `lib/inspection/admin-list.ts` — hoje já expõe `nota`/`classificacao`, então adicionar `status` segue o mesmo padrão). Abre um `<dialog>` client-side (mesmo padrão de confirmação já usado no fluxo de edição) com:
- Upload de fotos (`contexto = 'capa'`) — reaproveita o storage bucket e helper de upload já usados para fotos de item, só trocando o `contexto`.
- Campos de texto: nome do parceiro, telefone (validação simples de formato antes de gerar o link `wa.me`), upload de logo — reaproveita o mesmo bucket/fluxo de upload das fotos de capa (não é uma foto de `contexto='capa'` da inspeção, é um arquivo à parte cuja URL pública fica salva em `parceiro_logo_url`).
- Um server action único que faz upsert dos 3 campos de parceiro em `inspections` e insere as linhas de `photos`.

## 5. Página do relatório (`/inspections/[id]/relatorio`)

Server Component. Acesso: usuário autenticado com `is_admin()` ou `tecnico_id = auth.uid()` (mesma regra de leitura de `inspections_select`, já reaproveitada por herança de RLS — sem checagem extra na página além de tratar `null`/`notFound()` se a query não retornar linha). Só renderiza conteúdo de relatório quando `status = 'aprovada'`; caso contrário, redireciona/mostra mensagem (o link só é exposto quando aprovada, mas a rota deve se proteger sozinha contra acesso direto por URL).

Seções, na ordem:
1. **Hero**: foto de capa (primeira de `photos` com `contexto='capa'`, `ordem` menor), matrícula/marca/modelo, gauge circular com `nota_geral`/`classificacao`, status "Aprovada" + data.
2. **Especificações do veículo**: grid de cards (§3, campos de `vehicle_data`).
3. **Parceiro** (só se `parceiro_nome` preenchido): logo, nome, telefone como link WhatsApp.
4. **Análise técnica**: grupos colapsáveis com contagem OK/atenção, subcategorias, itens com badge de resposta + ícones de foto/comentário (§3).
5. **Veredito final**: card com nota geral grande, classificação, selo "Qualidade Check Auto" (adaptado do "Inspecta Premium" do mockup), badge "Elegível para Garantia" (fixo, mantido por decisão do usuário), badge de estado geral, assinatura do técnico.
6. **Rodapé**: técnico + credencial + código de certificado + data de emissão (RF-53).

Dados: uma query por página, reaproveitando as mesmas tabelas/views já usadas na tela de resumo e na checklist (`inspection_score`, `vehicle_data`, `checklist_group_templates`/`checklist_item_templates`/`checklist_item_responses`/`opcoes`/`photos`), sem view nova — a única lógica nova é a contagem OK/atenção por grupo, derivável em memória a partir de `resolveEscolhaColorModifier` por item (mesma função já usada na checklist).

## 6. Testes

- `gerarCodigoCertificado`: teste unitário de formato (8 chars, alfabeto correto) — não testa aleatoriedade estatística.
- `approveInspectionAction`: teste de integração/SQL confirmando que `codigo_certificado`/`certificado_emitido_em` são preenchidos na aprovação (hoje só há teste do `status`).
- Contagem OK/atenção por grupo: teste unitário puro, dado um conjunto de respostas mistas.
- RLS: confirmar que `inspections_update` permite admin escrever `parceiro_*` fora do período editável (`status = 'aprovada'`) e que `tecnico` não-admin não consegue.
- Página do relatório: teste de que dados de `client_data` nunca aparecem no HTML renderizado (RF-50) — grep simples no output renderizado por nome/contacto/email do solicitante de teste.

## 7. Fora de escopo

- Tela pública de consulta por código de certificado (RF-52, fase futura).
- Pipeline de PDF dedicado (RF-49 — só CSS de impressão).
- Seção de galeria "Evidências Visuais" solta (excluída pelo usuário).
- Gráfico radar de 5 eixos (descartado, sem dado real correspondente).
- Qualquer derivação de garantia real a partir de dados da inspeção — o selo "Elegível para Garantia" é estático/de branding, não condicional.
