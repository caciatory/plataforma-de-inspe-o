# Design — Re-seed do checklist real (v7, 360 itens/13 categorias)

## 1. Escopo

Peça 2 de 3 da Fase 2.8 (redesign do checklist). A Peça 1a (schema genérico de tipos de resposta) e a Peça 1b (camada de app adaptada) já estão prontas e mescladas em `main` — o banco aceita hoje qualquer um dos 4 tipos estruturais (`escolha`/`texto`/`data`/`medicao`) e um catálogo compartilhado de conjuntos de opções, mas o conteúdo real ainda é o antigo: 320 itens em 12 grupos (`docs/data/checklist-inspecta-v5.csv`), só com classificação universal `Ótimo/Médio/Ruim/N.A.` e medição só de tinta.

Esta peça substitui esse conteúdo inteiro pelo documento real do checklist (`checklist_inspecta_v7.md`, entregue pelo usuário, corrigido de mojibake e salvo em `docs/data/checklist-inspecta-v7.md`): 360 linhas de item, 13 categorias. Uma delas (item #351, "Itens motor térmico aplicam-se – ver Secção 5") não é um item de verificação de verdade — é uma nota de processo apontando pra reaproveitar a Categoria 5 (Motor) — e fica de fora do seed. Resultado: **359 itens seedados em 13 grupos**.

Como só há dados de teste no banco nesta data (mesma situação confirmada na Peça 1a) e o app não tem nenhum nome de item hardcoded (verificado em `app/`/`lib/` — tudo é data-driven pelo `group_id`/`item_template_id`), a troca é *clean-slate*: apaga `checklist_group_templates`/`checklist_item_templates` (cascade limpa `opcoes` órfãs, incluindo o conjunto `estado_4` que só existia pro backfill temporário da Peça 1a) e insere a estrutura nova.

**Fora de escopo:** qualquer mudança de UI ou de schema — só conteúdo. O redesign visual é a Peça 3.

## 2. Fonte e ferramenta de geração

Um script novo, `scripts/generate_checklist_seed_v7.py`, lê `docs/data/checklist-inspecta-v7.md` diretamente (parseia as tabelas markdown por categoria/subcategoria) e gera uma migration nova, `supabase/migrations/00037_seed_checklist_v7.sql`. Sem CSV intermediário — o `.md` é a fonte única de verdade, evita duplicar/dessincronizar conteúdo entre dois formatos.

O script usa:
- um dicionário de mapeamento rótulo "Tipo de Resposta" → tipo estrutural (`escolha`/`texto`/`data`/`medicao`) + conjunto de opções (quando `escolha`) ou unidade de medição (quando `medicao`) — ver §3;
- uma lista de overrides item-a-item para os poucos casos que não seguem o padrão geral: faixas de medição (§4), grupos de replicação (§5), e a exclusão do item #351.

Artefatos obsoletos (superados pelo conteúdo novo) são deletados: `scripts/generate_checklist_seed.py`, `scripts/generate_grupo_replicacao_seed.py`, `docs/data/checklist-inspecta-v5.csv`. Seguem disponíveis no histórico do git.

## 3. Catálogo de `conjuntos_opcao`

O documento usa 29 rótulos distintos de "Tipo de Resposta" (30 contando "Ver Categoria 5", excluído). 7 não são `escolha`:

| Rótulo | Tipo estrutural | Detalhe |
|---|---|---|
| Texto Livre | `texto` | |
| Texto Livre (nº) | `texto` | |
| Data | `data` | |
| Medição (µm) | `medicao` | `unidade_medicao='µm'` — já configurado na Peça 1a (tinta) |
| Medição (mm) | `medicao` | `unidade_medicao='mm'` |
| Medição (%) | `medicao` | `unidade_medicao='%'` |
| Medição (V) | `medicao` | `unidade_medicao='V'` |

Os outros 22 rótulos consolidam em **22 conjuntos de opções únicos** (dois pares de rótulos usam exatamente as mesmas opções e reusam o mesmo conjunto: "Estado de Limpeza" = mesmas opções que "Bom/Médio/Mau"; "Códigos de Erro Ativos" e "Luzes de Aviso Ativas" = mesmo padrão "Nenhum / Indicar (Observações)").

**Correção encontrada ao construir o script de geração** (verificação item-a-item dos 51 usos de "Sim / Não"/"Sim / Não / N.A." no documento): o rótulo por si só não diz se `Sim` é a resposta boa ou má — 33 itens usam `Sim` pra sinalizar um problema (ruído, fuga, infiltração, adulteração de quilometragem...), 18 usam `Sim` pra sinalizar presença de algo bom (documento, kit, pneu suplente...). Como `exige_foto` mora na opção (compartilhada por todo item que usa o conjunto), um conjunto único não consegue carregar as duas polaridades corretamente. Correção: divide em 4 conjuntos, e a montagem do seed usa uma tabela de override por nome de item (não só pelo rótulo) pra escolher qual dos 4 cada um dos 51 itens usa:

| Conjunto | Opções | `Sim` significa |
|---|---|---|
| `sim_nao_problema` | Sim, Não | defeito/problema encontrado — `exige_foto` |
| `sim_nao_problema_na` | Sim, Não, N.A. | defeito/problema encontrado — `exige_foto` |
| `sim_nao_presenca` | Sim, Não | presença/condição boa — sem `exige_foto` |
| `sim_nao_presenca_na` | Sim, Não, N.A. | presença/condição boa — sem `exige_foto` |

| Conjunto | Opções |
|---|---|
| `estado_3` | Bom, Médio, Mau |
| `estado_3_na` | Bom, Médio, Mau, N.A. |
| `funciona_2` | Funciona, Não Funciona |
| `funciona_2_na` | Funciona, Não Funciona, N.A. |
| `grau_corrosao` | Ausente, Ligeira, Moderada, Severa |
| `estado_fluido` | Bom, Contaminado, Substituir |
| `nivel_fluido` | Adequado, Baixo, Muito Baixo |
| `nivel_desgaste` | Bom (>50%), Médio (20–50%), Substituir (<20%) |
| `nivel_saturacao` | Baixa, Média, Alta, N.A. (gasolina) |
| `estado_historico` | Completo, Parcial, Inexistente |
| `intensidade_odor` | Ausente, Leve, Forte |
| `cor_emissao` | Ausente, Azul (óleo), Branco (água), Preto (combustível) |
| `nenhum_indicar` | Nenhum, Indicar (ver observações) |
| `luz_aviso_seguranca` | Apaga após arranque, Permanece acesa, N.A. |
| `presenca_estado` | Presente (bom estado), Presente (danificado), Ausente |
| `presenca_conformidade` | Completo, Incompleto, Ausente |
| `completude_chaves` | Completo (1ª, 2ª e segredo jantes), Incompleto, Nenhuma chave |
| `temperatura_apos_conducao` | Normal, Elevada |

### `exige_foto`

No modelo antigo só a classificação universal `'ruim'` disparava a exigência de foto (RF-16). Agora cada conjunto marca sua própria opção terminal negativa: `Mau`, `Não Funciona`, `Severa`, `Substituir`, `Permanece acesa`, `Ausente` (quando o item espera presença, ex. reflectores/triângulo), `Incompleto`/`Nenhuma chave`, `Muito Baixo`, `Alta` (saturação DPF), qualquer cor de emissão ≠ `Ausente`, e `Sim` nos dois conjuntos `sim_nao_problema*`. Opções neutras ou de "não aplicável" (`Médio`, `N.A.`, `Baixa`, `Adequado`, `Sim` nos conjuntos `sim_nao_presenca*`) não exigem foto — mantém o espírito da regra antiga, só generalizado por conjunto.

## 4. Faixas de medição

Além da tinta (µm — já configurada na Peça 1a: `faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300`), o documento dá números explícitos pra 3 itens novos:

| Item | Unidade | Faixa/limiar |
|---|---|---|
| Profundidade do piso (4 itens: cada roda) | mm | `limiar_critico_inferior=1.6` (mínimo legal) |
| Teste do fluido de travões | % | `limiar_critico_superior=3` (humidade — recomenda substituição acima disso) |
| Alternador – tensão de carga | V | `faixa_min_ok=13.8, faixa_max_ok=14.4` |

Os demais itens de medição (número de ciclos de carga, degradação de bateria BEV) não têm faixa numérica no documento — ficam "medição pura" (sem interpretação automática, `resultado` sempre `null`), como a Peça 1a já previu pra esse caso.

## 5. `grupo_replicacao` (aplicar aos demais)

Recuração completa (não só reaproveitar os 101 itens já curados no v6), com **uma regra única e consistente**: agrupa itens `tipo='escolha'` que diferem só no lado esquerdo/direito, **dentro do mesmo referencial dianteiro/traseiro** — nunca mistura dianteiro com traseiro, mesmo pra itens onde o v6 antigo misturava (pneus, jantes, discos de travão, amortecedores, molas, portas — verificado na migration `00025`: lá os 4 pneus, por exemplo, dividiam um grupo só). Essa é uma decisão deliberada de tornar a regra previsível em vez de reproduzir a curadoria manual antiga, que era inconsistente entre subcategorias sem uma lógica extraível (confirmado com o usuário).

Algoritmo: dentro do mesmo `(group_id, subcategoria)`, remove do nome do item o token esquerdo/direito (`esquerdo`/`esquerda`/`direito`/`direita`/`esq.`/`dir.`); itens que sobram com o nome-base idêntico formam um grupo (nome estável em kebab-case, ex. `farois-farol-dianteiro`, `pneus-desgaste-irregular-dianteiro`, `travoes-disco-dianteiro`); se sobrar só 1 item sem par, fica sem `grupo_replicacao`. Cobre praticamente toda seção de Faróis e Luzes, Pneus e Jantes, Portas, Amortecedores/Molas, Discos de travão, Vidros/Elevadores, Cintos de segurança, Retrovisores — só que agora com grupos de 2 em vez de 4 nos casos que antes misturavam dianteiro/traseiro. Só itens `tipo='escolha'` podem ter `grupo_replicacao` (constraint já existente da Peça 1a); os itens de medição de piso (mm) não entram nesse grupo, porque medição não tem valor único replicável entre rodas (cada roda mede diferente).

## 6. Grupo 13 (Motoriz. Especial) e limpeza

Grupo 13 (Bateria BEV, Carregamento, Sistema BEV, Bateria HEV, Sistema HEV, GPL — 35 linhas no documento, 34 itens seedados após excluir o #351) segue `ativo=false` — mesmo status do antigo grupo 12, mesma justificativa (Fase 9, backlog condicionado à compra de hardware, fora do v1.0). Os outros 12 grupos ficam `ativo=true`.

Artefatos deletados: `scripts/generate_checklist_seed.py`, `scripts/generate_grupo_replicacao_seed.py`, `docs/data/checklist-inspecta-v5.csv`.

## 7. Testes

Teste SQL (`supabase/tests/00037_seed_checklist_v7.test.sql`) cobrindo:
- 13 grupos, 1 inativo (grupo 13), 12 ativos;
- 359 itens no total;
- todo item `tipo='medicao'` tem `qtd_pontos_medicao` e `unidade_medicao` preenchidos;
- todo item `tipo='escolha'` tem `conjunto_opcao_id` preenchido, apontando pra um conjunto com ≥2 opções;
- os 4 conjuntos `sim_nao_*` existem e cada opção `Sim` tem `exige_foto` correto (`true` nos `*_problema*`, `false` nos `*_presenca*`);
- nenhum item referencia o conjunto `estado_4` (prova que a limpeza dos dados órfãos da Peça 1a funcionou — o conjunto não existe mais);
- os 3 itens com faixa numérica nova (piso, fluido de travões, alternador) têm os limiares certos;
- item #351 não existe no seed (grupo 13 tem 34 itens, não 35).
