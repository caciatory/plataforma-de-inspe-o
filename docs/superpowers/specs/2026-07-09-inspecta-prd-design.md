# PRD — Inspecta v1.0 (Sistema de Vistoria Veicular)

> Derivado da especificação técnica (`docs/especificacao-tecnica-v1.md`) e da sessão de brainstorming de 2026-07-09. Este documento é o PRD de produto: define problema, jornada e escopo. Detalhe de implementação (RF/RNF, modelo de dados) vive na especificação técnica, que será atualizada para refletir os cortes deste PRD.

## 1. Problema & Objetivo

**Problema:** a empresa não tem hoje nenhum processo formal de vistoria veicular. Avaliação, comunicação com o cliente e emissão de laudo acontecem de forma ad-hoc, sem registro estruturado nem consistência entre técnicos. Não existe ferramenta legada a substituir — o Inspecta nasce do zero.

**Objetivo do v1.0:** dar ao técnico uma ferramenta em tablet que estrutura a vistoria (285 itens de checklist, 11 grupos) e gera automaticamente um relatório profissional e verificável para o cliente, com o mínimo de fricção possível no preenchimento em campo.

## 2. Persona & Jornada do usuário

- **Técnico de campo** — usa tablet em oficina/garagem/stand, com internet disponível (não trabalha em locais sem sinal). Precisa preencher rapidamente uma checklist longa sem retrabalho.
- **Admin** (1 pessoa no v1.0) — revisa, aprova, edita e distribui os relatórios.

**Fluxo ponta a ponta:**
1. Técnico faz login → cria inspeção → preenche dados do veículo/cliente.
2. Percorre os 11 grupos / 285 itens (ou o subconjunto marcado `aplica_stand` quando o cliente é stand — ver §3): classifica cada item (ótimo/médio/ruim/NF), adiciona foto+observação quando aplicável. Para itens repetidos (vidros, pneus, jantes, faróis...) preenche um e usa "aplicar aos demais", podendo ajustar individualmente depois. Indicador ✅/⚠️ mostra progresso por grupo.
3. Finaliza (só permitido com 100% dos grupos aplicáveis respondidos) → envia para aprovação.
4. Admin aprova (gera relatório) ou devolve com motivo obrigatório — ciclo pode se repetir.
5. Na aprovação: admin adiciona fotos de capa; sistema calcula nota A/B/C e gera link único do relatório + código de certificado.
6. Admin copia o link e envia ao cliente por fora (WhatsApp/email) — não há disparo automático.
7. Cliente abre o link, informa email+origem, acessa o relatório.

## 3. Escopo v1.0

- Autenticação (Técnico/Admin).
- Dados básicos da inspeção (veículo + cliente).
- Checklist completa (285 itens, 11 grupos — grupo "Teste de Condução" descartado, não será aplicado a nenhum tipo de cliente), carregada uma vez via planilha/JSON no lançamento.
- Filtro por tipo de cliente a nível de item (não de grupo): cada item do checklist tem um flag `aplica_stand`. Quando `tipo_cliente = particular`, o técnico vê todos os 285 itens. Quando `tipo_cliente = stand`, vê só os itens com `aplica_stand = true` — subconjunto definido pelos sócios (não é uma tela de configuração, é uma decisão carregada no seed, mesmo mecanismo do checklist em si).
- Ação "aplicar aos demais" para itens repetidos (vidros, pneus, jantes, faróis etc.) — preenche um, aplica a outros selecionados, mantém edição individual depois.
- NF com confirmação explícita; foto obrigatória quando classificação = "ruim".
- Regra de finalização: só libera envio com 100% dos grupos aplicáveis respondidos.
- Autosave online simples: salva a cada alteração, mostra erro visível se falhar, permite retry manual — sem fila offline.
- Upload de foto direto e simples no momento da captura, com indicador de carregamento na própria foto — sem fila de background nem barra de progresso separada.
- Fluxo de aprovação/devolução pelo admin, sem limite de repetições.
- Edição de inspeção já registrada pelo admin, com log de auditoria simples (quem editou, o quê, quando) — sem diff de valor anterior/novo.
- Pontuação: valores por classificação e cortes de nota A/B/C fixos no código (ajustáveis por um dev quando necessário, sem tela de configuração).
- Item de medição de espessura de pintura: faixas de resultado (µm) também fixas no código, mesma lógica da pontuação.
- Relatório final: filtros (Todos / Pontos de Atenção / Com Fotos), fotos de capa, resumo do veículo e nota. Uma única versão responsiva; impressão via estilo de impressão do navegador, sem pipeline de PDF separado.
- Código de certificado (letras maiúsculas + números) gerado automaticamente em todo relatório, exibido como atributo da própria inspeção.
- Link do relatório gerado dentro da própria plataforma após finalização, protegido por captura de email+origem, compartilhado manualmente pelo admin (copiar/colar ou enviar) — sem disparo automático.
- Lista de inspeções do admin: busca livre, filtros (período/técnico/tipo de cliente), ordenação — sem paginação/virtualização (volume inicial baixo).
- Estado "atrasada" automático para inspeções abertas e não finalizadas.
- Cancelamento/arquivamento de inspeção não finalizada, com motivo obrigatório.
- Um único admin — sem desenho de suporte a múltiplos admins.

## 4. Fora do escopo v1.0 (com motivo)

- **Offline-first completo** (storage local + fila de sincronização) — internet sempre disponível no lançamento; reavaliar se/quando surgir necessidade real.
- **Tela de configuração de pontuação e faixas de medição** — valores fixos no código por agora.
- **Tela de admin para editar o checklist** (itens/grupos) — carregado uma vez via planilha/JSON; ajuste manual quando necessário.
- **Auditoria com diff completo** (valor anterior/novo por campo) — versão simples (quem/o quê/quando) basta por agora.
- **Busca pública por código de certificado** — o código já é gerado e exibido; a tela de consulta pública fica para fase futura.
- **Paginação/virtualização da lista de inspeções** — volume inicial baixo (1-2 técnicos).
- **Múltiplos admins** — sem redesenho especulativo de schema para um cenário que não existe ainda.
- **Exportação de PDF dedicada** — só entra se surgir necessidade real além do CSS de impressão do navegador.
- Herdado do PRD anterior, mantido fora: portal público / Hall da Fama, catálogo de stands, templates versionáveis de checklist, relatórios analíticos.
- **Motorização Especial (BEV/HEV/GPL)** — 35 itens de checklist para veículos elétricos, híbridos e a GPL, condicionados à compra de equipamento específico (scanner de bateria de alta tensão, detetor de fugas de gás). Não é especulativo: é uma fase futura já confirmada pelos sócios, com conteúdo pronto em `docs/data/checklist-inspecta-v5.csv` — só não entra no v1.0 porque o equipamento ainda não foi adquirido.

## 5. Cortes de over-engineering aplicados (ponytail-review + ponytail-audit, 2026-07-09)

Aplicados sobre o desenho inicial (que ainda carregava premissas do PRD anterior, como offline-first):

| Corte | Antes | Depois | Motivo |
|---|---|---|---|
| Upload de foto | Fila em background com barra de progresso | Envio síncrono simples com spinner na foto | Era companheiro do offline-first, que já foi cortado — sem conexão instável, não há fila a gerenciar |
| Certificado | Entidade própria (tabela `CERTIFICATE`) | Atributo da própria inspeção (código + data) | Relação 1:1 que só existe após aprovação — não precisa de tabela e join próprios |
| Faixas de medição de pintura | Configurável pelo mesmo mecanismo da pontuação | Fixo no código | Mesma decisão já tomada para a pontuação; não havia motivo pra tratar diferente |
| Suporte a múltiplos admins | Exigência de schema "sem redesenho futuro" | Removido do documento | Requisito especulativo para cenário que o próprio negócio descartou (1 admin) |
| Versionamento de templates de checklist | Exigência de "suportar versionamento futuro" | Removido; mantém apenas a separação natural entre template e resposta | Normalização razoável não precisa virar exigência de "preparar pro futuro" |
| Log de auditoria | Valor anterior/novo por campo alterado | Quem, o quê, quando | Diff completo não foi pedido por ninguém; rastreabilidade básica já resolve |
| Fotos (item vs capa) | Duas tabelas quase idênticas | Uma estrutura, diferenciada por contexto | Mesma forma de dado, sem motivo pra duplicar |
| Relatório impresso | Pipeline de renderização separado (PDF) | Estilo de impressão do navegador sobre o mesmo relatório web | Nenhuma necessidade de arquivo exportável foi confirmada |

**O que não foi cortado (fora do escopo do ponytail — é segurança/privacidade, não complexidade):** geração não-sequencial do código de certificado, resposta de verificação sem vazar dados sensíveis, dados sensíveis do solicitante fora do relatório público, HTTPS/TLS, hashing de credenciais.

## 6. Métricas de sucesso

- Tempo médio para completar uma vistoria (meta: reduzir vs. processo manual/ad-hoc equivalente).
- % de vistorias finalizadas sem devolução/retrabalho do admin.
- Zero perda de dados reportada (nenhuma nota/foto perdida por falha de salvamento).

## 7. Riscos / perguntas em aberto

- ~~Conteúdo exato dos 300+ itens~~ resolvido em 2026-07-10: `docs/data/checklist-inspecta-v5.csv`, 285 itens v1.0.
- **Bloqueante para o seed final:** quais dos 285 itens têm `aplica_stand = true` — decisão dos sócios, ainda não tomada (coluna `aplica_stand` no CSV está `PENDENTE` em toda linha).
- Falta design de tela para dashboard/checklist do técnico e do admin (só o relatório final tem design pronto).
- Comportamento exato de "aplicar aos demais": copia só a classificação, ou também foto/observação? — a definir no detalhamento técnico.
- Formato exato do campo "origem/rastreio" no gate do relatório (select fixo vs texto livre vs UTM).

## 8. Referências

- `docs/especificacao-tecnica-v1.md` — especificação técnica (RF-01 a RF-63, RNF-01 a RNF-23).
- `docs/data/checklist-inspecta-v5.csv` — conteúdo real dos 285 itens do checklist v1.0 (+ 35 itens Fase 2).
- Sessão de brainstorming + ponytail-review/audit, 2026-07-09. Ajuste de escopo (Teste de Condução removido, `aplica_stand` por item), 2026-07-10.
