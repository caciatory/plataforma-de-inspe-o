# Design — "Aplicar aos demais" em itens repetidos (Fase 2.5)

## 1. Escopo

Resolve a pendência registrada em `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md` §6: itens repetidos (pneus, vidros, bancos, faróis, etc.) ganham um jeito do técnico classificar um item e aplicar o mesmo resultado aos demais do mesmo cluster, editando o que for diferente antes de gravar.

**Fora do escopo:** finalizar inspeção, filtro `aplica_stand`, autosave, pontuação — mesmas exclusões da Fase 2. Itens `tipo='medicao'` também ficam de fora (não têm classificação manual pra copiar).

## 2. Curadoria dos clusters — dado, não código

`checklist_item_templates.grupo_replicacao text` (nullable). Itens com o mesmo valor não-nulo são "irmãos" — clicáveis entre si na UI de aplicar-aos-demais. Constraint `grupo_replicacao_so_padrao check (grupo_replicacao is null or tipo = 'padrao')`.

**Curado manualmente**, mesmo mecanismo já usado pro `aplica_stand`: uma coluna na planilha-fonte (`docs/data/checklist-inspecta-v5.csv`), carregada por uma migration. **Deliberadamente não é heurística automática** — um agrupamento errado por regex faria o técnico marcar um item quebrado como "ok" por engano, e é dado de inspeção.

**Importante para manutenção futura:** ajustar um cluster (juntar, separar, criar novo, remover item de um grupo) é só editar a célula correspondente no CSV e pedir um reseed — nenhuma mudança de código, RPC ou UI é necessária, porque tudo (agrupamento, contagem, quais itens aparecem como "irmãos") é derivado dessa coluna em tempo de leitura.

**36 clusters, 99 itens** (~31% dos 320), levantados por padrão `{Componente} {posição} - {atributo}` dentro da mesma subcategoria, só quando é literalmente o mesmo check em posição diferente (não agrupei atributos diferentes do mesmo componente, ex. "nível" vs "qualidade" do óleo):

| Subcategoria | Clusters |
|---|---|
| Carroçaria | `carrocaria-lateral-estado`, `carrocaria-paralama-estado` |
| Para-choques | `parachoques-estado-geral`, `-alinhamento`, `-fixacoes` |
| Portas | `portas-alinhamento`, `portas-fechadura` |
| Faróis e Luzes | `farois-farol-dianteiro`, `-farol-traseiro`, `-luz-media`, `-luz-maxima`, `-luz-travagem`, `-pisca-dianteiro`, `-pisca-traseiro`, `-nevoeiro-dianteiro`, `-nevoeiro-traseiro`, `-marcha-atras`, `-drl` |
| Vidros | `vidros-lateral-dianteiro`, `-lateral-traseiro`, `-elevador-dianteiro`, `-elevador-traseiro` |
| Espelhos | `espelhos-estado`, `-ajuste-eletrico`, `-aquecimento` |
| Bancos | `bancos-estado`, `bancos-cinto-seguranca` |
| Pneus | `pneus-estado-geral`, `-profundidade-piso`, `-desgaste-irregular`, `-cortes-bolhas` |
| Jantes | `jantes-estado` |
| Travões | `travoes-pastilhas`, `travoes-disco-estado` |
| Suspensão | `suspensao-amortecedor`, `suspensao-mola` |
| Segurança | `seguranca-airbag-luz-painel` |

Grupo 12 (Motorização Especial, Fase 9) fica de fora — inativo (`ativo=false`), fora do v1.0.

## 3. UI — sem rota nova

Tudo acontece na página do item já existente (`/inspections/[id]/checklist/[groupId]/[itemId]`), sem nova rota.

**Passo 1 — seção de irmãos** (só aparece se `item.grupo_replicacao` não for nulo): lista os demais itens com o mesmo `grupo_replicacao` (escopo defensivo: mesmo `group_id` também, já que os clusters curados nunca cruzam grupo). Busca as respostas existentes desses irmãos junto — quem já está `respondido`/`NF` aparece **desmarcado por padrão** com nota "já respondido: {classificação}"; quem está `pendente` vem **marcado por padrão**. Evita sobrescrever sem querer uma resposta que já diverge.

**Passo 2 — aplicar:** botão "Aplicar aos selecionados" (client-side, sem submit) copia o que já está preenchido no formulário do item A (classificação + observação) como valor inicial e expande, na mesma página, um painel com uma linha por item selecionado (A + irmãos marcados). Cada linha é um mini-form independente: classificação, observação, foto própria (reaproveita `PhotoManager` de Fase 2, uma instância por linha, upload já salva na hora como já funciona).

**Passo 3 — confirmar:** botão "Confirmar aplicação" grava o lote inteiro numa chamada atômica (§4). Se algum item do lote estiver marcado `NF`, um único `confirm()` nativo cobre o lote ("N itens serão marcados como Não se aplica — confirma?"), não um por linha. Sucesso → redireciona para a lista do grupo (`/inspections/[id]/checklist/[groupId]`) — mais simples que calcular "próximo item" depois de responder vários de uma vez, e a lista já reflete quem ficou pendente.

O botão "Salvar e próximo" de sempre continua funcionando normal pra quem não quiser usar o lote.

## 4. Escrita — RPC atômica

`apply_classificacao_batch(p_inspection_id uuid, p_items jsonb) returns void`, `security invoker`, mesmo estilo de `save_paint_measurement`: itera o array `p_items` (cada elemento `{item_template_id, classificacao, observacao}`) fazendo o mesmo upsert que `saveClassificacaoAction` já faz item a item — mas numa única transação. Se um item do lote falhar (ex: "ruim" sem foto anexada, mesma trigger RF-16 de sempre), **o lote inteiro não é salvo** — comportamento correto: o técnico corrige a linha problemática (geralmente anexando a foto que falta) e confirma de novo, em vez de ficar com metade do lote gravado e metade não.

Justificativa de não reaproveitar `saveClassificacaoAction` em loop no client: N chamadas independentes não garantem atomicidade (uma falha no meio deixaria o lote parcialmente salvo) — o RPC único resolve isso no banco, mesmo padrão já validado em `save_paint_measurement`.

## 4.1 Comportamento de erro — nada se perde, aponta a linha

O painel de lote é só estado local no navegador até o clique em "Confirmar aplicação" — cada linha (classificação, observação, fotos já anexadas) permanece exatamente como o técnico deixou, mesmo se a gravação falhar ou nem for tentada.

**Validação no client antes de chamar o RPC:** como cada linha já sabe quantas fotos tem anexadas (mesmo estado que o `PhotoManager` daquela linha já mantém), "Confirmar aplicação" primeiro checa localmente se toda linha marcada `ruim` tem pelo menos 1 foto. Se não tiver, bloqueia o envio e aponta exatamente qual(is) linha(s) estão faltando foto — sem round-trip ao servidor. Cobre o caso comum (esqueceu de anexar).

**Erro do banco (caso raro — race condition, outra violação):** a trigger RF-16 continua sendo quem garante de verdade (o client-side é só conveniência, mesmo princípio da Fase 2). Se o RPC ainda assim rejeitar, o erro aparece como mensagem genérica no topo do painel — não tenta apontar a linha exata (o erro do Postgres carrega o `item_response_id` interno, não o `item_template_id` que a UI usa; mapear um pro outro só pra esse caso raro não vale a complexidade). Nenhuma linha é limpa; o técnico revisa, corrige, confirma de novo.

## 5. Testes

- RPC: teste SQL cobrindo lote com sucesso (múltiplos itens gravados numa chamada), lote que falha por RF-16 (nenhum item do lote persiste), upsert idempotente (chamar duas vezes não duplica).
- Função pura pra derivar a lista de irmãos + estado de checkbox padrão (marcado só se pendente): testada isolada.
- Server Action que chama o RPC: testada com client mockado, mesmo padrão das demais.
- Painel de lote (client component): testado com Testing Library — linhas renderizam pré-preenchidas, edição por linha funciona, submit chama a Server Action com o payload certo; caso de validação client-side (linha `ruim` sem foto bloqueia o envio e aponta a linha, sem chamar a Server Action) coberto explicitamente.
- Página do item continua sem teste próprio (mesma exceção documentada em Fase 2) — a seção de irmãos é lógica nova o suficiente pra justificar extrair a query/montagem da lista como função pura testável, em vez de inline no componente de página.
