# Design — Modelo genérico de tipos de resposta do checklist

## 1. Escopo

Peça 1 de 3 de uma iniciativa maior: o usuário rejeitou o visual da Fase 2.7 ("bem ruim") e pediu um redesign no estilo dashboard de uma referência (sidebar, tabela por subseção com todos os itens editáveis inline). Isso expôs que o schema atual do checklist é rígido demais pro conteúdo real dos itens. As outras duas peças (re-seed do checklist v7 com 360 itens/13 categorias, e o redesign visual/tabela) dependem desta e rodam depois, cada uma com seu próprio ciclo `brainstorming → writing-plans → subagent-driven-development`.

O schema atual (`00002_checklist_templates.sql`, `00003_checklist_responses_media.sql`) só suporta 2 tipos rígidos de item: `padrao` (classificação fixa `otimo`/`medio`/`ruim`/`NF`, universal a todo item) e `medicao` (só espessura de tinta em µm, com faixas hardcoded no código). O documento-fonte real do checklist (`checklist_inspecta_v7.md`, 360 itens, 13 categorias) tem ~30 rótulos distintos de "Tipo de Resposta", que não cabem nesse modelo.

Este design troca o modelo rígido por um genérico que suporta qualquer um dos ~30 rótulos, organizados em 4 tipos estruturais: **escolha única** (~260 itens — a grande maioria), **texto livre**, **data**, e **medição** (generalizada além de µm/tinta).

**Fora de escopo:** o conteúdo real dos 360 itens (nomes, qual conjunto de opções cada um usa, valores exatos de faixa/limiar) — isso é a Peça 2 (re-seed). Aqui só a estrutura do schema que vai receber esse conteúdo.

## 2. Catálogo de opções (tipo `escolha`)

~20 conjuntos de opções (Bom/Médio/Mau, Funciona/Não Funciona/N.A., Nível de Fluido, Grau de Corrosão...) se repetem em ~260 dos 360 itens. Um catálogo compartilhado evita duplicar rótulos centenas de vezes e centraliza a manutenção (renomear uma opção, ajustar quem exige foto) num lugar só:

```sql
create table public.conjuntos_opcao (
  id uuid primary key default gen_random_uuid(),
  nome text not null  -- identificador interno, ex. "estado_3", "funciona_3"
);

create table public.opcoes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos_opcao(id) on delete cascade,
  label text not null,       -- "Bom", "Médio", "Mau"...
  ordem int not null,
  exige_foto boolean not null default false  -- substitui o RF-16 fixo em 'ruim'
);

create index on public.opcoes (conjunto_id);
```

`exige_foto` por opção (em vez de uma string `'ruim'` fixa no código) é o que permite ao RF-16 generalizar — qualquer opção de qualquer conjunto pode exigir foto, não só uma classificação universal.

## 3. Tipos de item e faixas de medição

```sql
create type item_template_tipo as enum ('escolha', 'texto', 'data', 'medicao');
```

`checklist_item_templates` ganha:

```sql
alter table public.checklist_item_templates
  add column conjunto_opcao_id uuid references public.conjuntos_opcao(id),  -- obrigatório se tipo='escolha'
  add column unidade_medicao text,                                          -- obrigatório se tipo='medicao' (µm/mm/%/V)
  add column faixa_min_ok numeric,
  add column faixa_max_ok numeric,
  add column limiar_critico_inferior numeric,
  add column limiar_critico_superior numeric;
```

As 4 colunas de faixa são todas nullable e só se aplicam a `tipo='medicao'`. Item de medição sem nenhuma preenchida é medição pura (só valor bruto, sem interpretação) — cobre casos como número de ciclos de carga da bateria BEV, que não têm faixa de referência documentada.

O `CHECK` de `qtd_pontos_medicao` (hoje exige 3–5 pontos, pensado só pra tinta que mede por painel) afrouxa pra **1–5**, já que itens novos como tensão do alternador ou % de fluido de travões são valor único:

```sql
alter table public.checklist_item_templates drop constraint qtd_pontos_medicao_valido;
alter table public.checklist_item_templates add constraint qtd_pontos_medicao_valido check (
  tipo <> 'medicao' or (qtd_pontos_medicao is not null and qtd_pontos_medicao between 1 and 5)
);
```

A constraint `grupo_replicacao_so_padrao` (Fase 2.5, "aplicar aos demais") referencia o valor antigo `'padrao'` — atualiza pra `'escolha'`:

```sql
alter table public.checklist_item_templates drop constraint grupo_replicacao_so_padrao;
alter table public.checklist_item_templates add constraint grupo_replicacao_so_padrao
  check (grupo_replicacao is null or tipo = 'escolha');
```

## 4. Tabela de respostas

```sql
alter table public.checklist_item_responses
  drop column classificacao,
  add column opcao_id uuid references public.opcoes(id),      -- tipo='escolha'
  add column resposta_texto text,                              -- tipo='texto'
  add column resposta_data date;                                -- tipo='data'

drop type public.item_classificacao;
```

Medição continua numa tabela própria (§5), sem coluna aqui — só `observacao` (já existe, universal a todo tipo) e as fotos via `photos.item_response_id`.

Qual das 3 colunas (`opcao_id`/`resposta_texto`/`resposta_data`) é a válida pra uma resposta depende do `tipo` do item — validado na camada de app (Server Actions com Zod, já é o padrão existente), não com `CHECK` cruzando tabela.

### Status (pendente/respondido)

Hoje `status` é uma coluna `generated` a partir de `classificacao` (mesma linha). Isso não é mais possível porque "respondido" agora depende do `tipo` do item, que vive em `checklist_item_templates` — generated columns do Postgres não leem outra tabela. Vira view:

```sql
create view public.checklist_item_status as
select r.id as response_id, r.inspection_id, r.item_template_id,
  case
    when t.tipo = 'medicao' then exists (select 1 from public.medicoes m where m.item_response_id = r.id)
    else r.opcao_id is not null or r.resposta_texto is not null or r.resposta_data is not null
  end as respondido
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id;
```

O status especial `'NF'` (hoje um valor fixo de classificação) desaparece — "N.A." agora é só mais uma opção comum dentro de vários conjuntos (ex. "Funciona/Não Funciona/N.A."), sem tratamento especial: `respondido` fica true assim que qualquer opção (incluindo a de rótulo "N.A.") é escolhida.

## 5. Medição generalizada

`paint_measurements` (hoje só tinta, `valores_um`, `resultado_calculado`/`paint_resultado` hardcoded) generaliza:

```sql
alter table public.paint_measurements rename to medicoes;
alter table public.medicoes rename column valores_um to valores;
alter table public.medicoes alter column valores type numeric(8,2)[];
alter table public.medicoes drop column resultado_calculado;
drop type public.paint_resultado;

create type public.medicao_resultado as enum ('ok', 'atencao', 'critico');

create view public.medicoes_resultado as
select m.item_response_id,
  case
    when t.limiar_critico_superior is not null and public.array_max_numeric(m.valores) >= t.limiar_critico_superior then 'critico'
    when t.limiar_critico_inferior is not null and public.array_min_numeric(m.valores) <= t.limiar_critico_inferior then 'critico'
    when t.faixa_min_ok is not null and public.array_min_numeric(m.valores) < t.faixa_min_ok then 'atencao'
    when t.faixa_max_ok is not null and public.array_max_numeric(m.valores) > t.faixa_max_ok then 'atencao'
    when t.faixa_min_ok is null and t.faixa_max_ok is null
      and t.limiar_critico_inferior is null and t.limiar_critico_superior is null then null
    else 'ok'
  end::public.medicao_resultado as resultado
from public.medicoes m
join public.checklist_item_responses r on r.id = m.item_response_id
join public.checklist_item_templates t on t.id = r.item_template_id;
```

Mesma lógica de "pior caso vence" que a tinta já usa hoje (reaproveita `array_max_numeric`/`array_min_numeric` de `00012`), só que lendo os limiares do item (`checklist_item_templates`) em vez de constantes fixas no código. Pra tinta, `faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300` reproduz exatamente o comportamento de hoje (migration `00012`) — nenhuma mudança de resultado pra inspeções de tinta.

Virou `view` em vez de coluna gerada pelo mesmo motivo do `status` (§3): precisa ler outra tabela.

**Os valores exatos de faixa/limiar pra cada item novo (piso, fluido de travões, tensão) e a decisão de severidade (`atencao` vs `critico`) por item ficam pra Peça 2** — aqui só a estrutura que suporta os dois casos.

## 6. RF-16 generalizado (foto obrigatória)

A constraint trigger de `00013_ruim_requires_photo.sql` checa hoje `classificacao = 'ruim'`. Generaliza pra checar duas fontes:

- resposta de tipo `escolha` cuja `opcoes.exige_foto = true`
- resposta de tipo `medicao` cujo `medicoes_resultado.resultado = 'critico'`

Mensagem de erro genérica ("esta resposta exige pelo menos 1 foto anexada") em vez de citar "ruim" especificamente, já que a opção que dispara a regra varia por item agora.

## 7. RPCs e Server Actions afetadas

- **`save_paint_measurement`** → renomeia/generaliza pra `save_medicao(p_inspection_id, p_item_template_id, p_valores numeric[], p_observacao)`. Remove o cálculo de `resultado_calculado`/derivação de classificação (o "truque" que hoje escreve uma `classificacao` fake só pra reaproveitar `status` e o gatilho RF-16) — não é mais necessário, já que `status` e RF-16 agora leem as views novas diretamente.
- **`saveClassificacaoAction`** (upsert direto, sem RPC) → generaliza pra receber `opcao_id`/`resposta_texto`/`resposta_data` conforme o `tipo` do item, no lugar de `classificacao`.
- **`apply_classificacao_batch`** (Fase 2.5) → mesma lógica de lote (upsert atômico multi-linha, aborta o lote inteiro se RF-16 falhar em qualquer item), só troca o valor replicado de `classificacao` fixo pra `opcao_id`.
- **`attachPhotoAction`/`deletePhotoAction`**: sem mudança — já operam por `item_response_id`, agnósticos ao tipo do item.

## 8. Migração de dados

Confirmado no banco: só 6 `checklist_item_responses` de teste em 7 `inspections` de teste, nenhum dado de produção. Migração é *clean-slate* — dropar e recriar as tabelas/colunas afetadas é seguro, sem necessidade de preservar/converter respostas antigas.

## 9. Testes

- Migração SQL: teste cobrindo que a view `medicoes_resultado` reproduz os mesmos resultados que `paint_resultado` produzia pros mesmos valores de tinta (regressão dos thresholds existentes).
- RF-16 generalizado: teste cobrindo as duas fontes (opção com `exige_foto`, medição `critico`) disparando a exigência de foto, e um caso de cada tipo sem essas condições não disparando.
- `checklist_item_status`: teste cobrindo `respondido=true`/`false` pros 4 tipos de item.
- `save_medicao`: teste SQL equivalente ao que já existe pra `save_paint_measurement`, com o nome/assinatura novos.
- `apply_classificacao_batch` e `saveClassificacaoAction`: testes existentes adaptados pra `opcao_id` no lugar de `classificacao`.
