# Acesso do cliente ao relatório — Design

**Fase 7 do roadmap** (`docs/ROADMAP.md`). Cobre RF-54 a RF-56.

## Contexto

O relatório final (Fase 6, mesclada em `main` em 2026-08-14) hoje só existe em
`/inspections/[id]/relatorio`, uma rota interna: exige login (o
`middleware.ts` redireciona qualquer visitante sem sessão que tente acessar
`/inspections/*` pro `/login`), e a RLS de todas as tabelas que o relatório lê
(`inspections`, `vehicle_data`, `checklist_item_responses`, `photos`, etc.) é
`to authenticated` — um visitante anônimo não consegue ler nenhuma delas hoje.

RF-54 a RF-56 pedem um jeito do **cliente final** (que nunca teve conta no
sistema) ver esse mesmo relatório a partir de um link que o admin compartilha
manualmente (WhatsApp/email), passando antes por uma barreira que registra de
onde ele veio.

A tabela `client_access_logs` já existe desde a migration `00005` mas tem RLS
ligada sem nenhuma policy — bloqueio total, inclusive pra admin — com um
comentário explícito na migration `00010` dizendo que isso ficaria pra
"uma function/service-role futura". Esta fase é essa peça futura.

**Fora de escopo desta fase, por decisão explícita do usuário:** RF-52 (busca
pública de certificado por código, ex. digitar um código num campo e ver se é
válido) não entra aqui nem em nenhuma fase futura deste código. Vai ser
construída como projeto totalmente separado — o usuário vai exportar a base
de códigos de certificado pro site `checkauto.pt` (fora deste repositório), e
a consulta acontece lá. O texto do `CertificadoInfoButton`
(`app/(app)/inspections/[id]/relatorio/certificado-info.tsx`), que já promete
essa consulta em checkauto.pt, permanece como está — vai deixar de ser
"aspiracional" quando esse outro projeto existir, mas isso está fora do
controle/escopo deste repositório.

**Desvio deliberado do texto literal de RF-55/56:** a especificação técnica
pede a captura de **email + origem** antes de liberar o relatório. Por
decisão explícita do usuário nesta sessão, o campo email foi removido —
captura-se **só a origem**, e a barreira aparece em **todo** acesso (sem
"lembrar" o visitante entre sessões, ao contrário do que RF-56 sugere ao
dizer que o relatório "é liberado" — aqui ele é liberado a cada carregamento
de página, não uma vez por visitante). Ver seção "Requisitos formais" abaixo
pra como isso reflete nos RFs.

## Requisitos formais (RF-54 a RF-56, como implementados)

- **RF-54** — Link gerado automaticamente na aprovação (reaproveita
  `codigo_certificado`, já existe desde a Fase 6). Botão "Copiar link do
  relatório" na tela de resumo da inspeção, visível só pro admin quando
  `status === 'aprovada'`. Compartilhamento continua 100% manual (sem envio
  automático de email/WhatsApp).
- **RF-55 (adaptado)** — Antes de exibir o relatório, captura a **origem** do
  acesso (lista fixa de opções, ver "Fluxo" abaixo). Email não é mais
  coletado — decisão explícita do usuário, documentada acima.
- **RF-56 (adaptado)** — Após escolher a origem, o relatório é liberado
  **naquele carregamento de página**. A origem fica armazenada em
  `client_access_logs`, separada do conteúdo do relatório, pra fins de
  rastreio (RNF-08). Recarregar a página ou reabrir o link mais tarde pede a
  origem de novo — não há persistência entre visitas.

## Arquitetura

### Rota pública nova

`app/relatorio/[codigo]/page.tsx` — rota top-level, **fora** de
`app/(app)/` e fora do matcher de `middleware.ts` (que hoje só cobre
`/inspections/:path*` e `/admin/:path*`), então não precisa de nenhum
carve-out: já nasce acessível sem login.

A rota interna `/inspections/[id]/relatorio` **não muda** — continua exigindo
login, continua sendo o que técnico/admin usam pra ver o relatório de dentro
do app.

### Reaproveitamento visual

A renderização do relatório (hero, especificações, `AnaliseTecnica`,
`OutrosEquipamentos`, veredito/selo, rodapé) é extraída do atual
`app/(app)/inspections/[id]/relatorio/page.tsx` (hoje um Server Component
gigante que busca dados E renderiza) pra um componente de apresentação
compartilhado, que recebe um formato de dados já normalizado e não sabe de
onde esses dados vieram.

- A rota interna continua buscando os dados como hoje (queries diretas via
  RLS de `authenticated`), monta o mesmo formato normalizado, e passa pro
  componente compartilhado.
- A rota pública busca os dados via a função RPC (abaixo), já recebe algo
  perto desse formato, e passa pro mesmo componente compartilhado.

Isso evita duplicar a página inteira (que cresceu bastante na Fase 6) numa
segunda rota — só a camada de busca/segurança de dados diverge.

### Busca de dados — função única no banco (security-definer)

Nova função `get_relatorio_publico(p_codigo text)`, `security definer`,
concedida a `anon` (mesmo padrão de outras funções do projeto, ex.
`apply_opcoes_batch`). Internamente:

- Localiza a inspeção por `codigo_certificado = p_codigo`.
- Retorna vazio/erro se não encontrar, ou se `status <> 'aprovada'` — sem
  distinguir os dois casos na mensagem de erro (evita enumeração de códigos
  válidos, mesmo espírito do RNF-13).
- Nunca faz `select` de `client_data` — a exclusão é estrutural na própria
  query da função, não uma checagem depois. Mesma garantia que a página
  interna já tem via teste de regressão (RF-50); aqui a garantia nasce uma
  camada mais abaixo, no banco.
- Devolve exatamente os campos que o relatório público precisa: dados do
  veículo, nota/classificação, fotos, respostas de checklist agrupadas,
  equipamentos, dados do parceiro, código e data do certificado, nome/
  credencial do técnico.

Nenhuma policy de RLS nova pra `anon` em `inspections`, `vehicle_data`,
`checklist_item_responses`, `photos`, `opcoes`, `medicoes_resultado`,
`equipamento_inspecao`, `equipamento_fotos` ou `inspection_score` — todas
continuam fechadas pra quem não tem login, exatamente como hoje. Só a função
em si é exposta.

### `client_access_logs` — RLS nova

Duas policies novas (a tabela já tem RLS ligada desde a migration `00010`,
sem nenhuma policy até agora):

- `insert` pra `anon`: qualquer um pode inserir uma linha (é o próprio
  registro do acesso do visitante).
- `select` pra `authenticated` com `is_admin()`: só admin lê os registros
  (RNF-08 — "controle de acesso e finalidade declarada").

Sem `update`/`delete` pra ninguém (mesmo espírito de imutabilidade do log de
auditoria, RNF-11, aplicado aqui por analogia mesmo não sendo tecnicamente
o mesmo requisito).

### Migration — `client_access_logs.email` vira opcional

```sql
alter table public.client_access_logs alter column email drop not null;
```

Mantém a coluna (não quebra nada que já exista, mantém a porta aberta se o
requisito mudar de novo no futuro), só para de exigir valor. Todo insert
novo desta fase em diante deixa `email` como `null`.

### Fluxo (visitante anônimo)

1. Visitante abre `/relatorio/[codigo]`.
2. Página mostra um formulário simples: "De onde você está vindo?" com 5
   opções fixas — WhatsApp, Stand/Loja física, Indicação, Redes sociais,
   Outro — e um botão de confirmar. Nenhum campo de texto livre, nenhum
   email.
3. Ao confirmar, uma Server Action: (a) insere a linha em
   `client_access_logs` (inspection_id resolvido a partir do código, origem
   escolhida, `acessado_em` default), (b) chama `get_relatorio_publico`.
4. Se a função devolver dados: a mesma página troca o formulário pelo
   relatório completo (componente compartilhado da seção acima) — sem
   navegação, sem novo link, sem cookie.
5. Se a função não devolver nada (código inválido ou inspeção não aprovada):
   mensagem genérica de erro, sem revelar qual dos dois casos ocorreu.
6. Recarregar a página ou reabrir o link depois volta ao passo 1 — a origem
   é pedida de novo a cada carregamento (comportamento pedido
   explicitamente pelo usuário, ver "Desvio deliberado" acima).

### UI do admin

Na tela de resumo da inspeção (`app/(app)/inspections/[id]/page.tsx`), ao
lado do botão "Ver relatório" já existente (linha ~217, visível quando
`status === 'aprovada'`), um botão novo "Copiar link do relatório" —
visível **só pra admin** (RF-54: "o admin copia e compartilha manualmente").
Copia `https://<domínio>/relatorio/<codigo_certificado>` pra área de
transferência via `navigator.clipboard.writeText`, com feedback visual
(ex. texto do botão muda pra "Copiado!" por 2 segundos).

## Testes

- Teste SQL da função `get_relatorio_publico` (mesmo padrão dos outros
  arquivos em `supabase/tests/`): código inválido devolve vazio; inspeção
  não aprovada devolve vazio; inspeção aprovada devolve os campos certos;
  `client_data` nunca aparece no resultado (mesmo tipo de regressão que já
  existe pro relatório interno, RF-50).
- Teste SQL de RLS pra `client_access_logs`: `anon` consegue inserir mas não
  consegue ler (nem a própria linha); `admin` autenticado lê tudo; `tecnico`
  autenticado não lê.
- Teste de componente pro formulário de origem: mostra as 5 opções; ao
  confirmar, chama a Server Action e troca pro conteúdo do relatório;
  mostra erro genérico se a Server Action não devolver dados.
- Teste do componente compartilhado de renderização do relatório: garante
  que os dois pontos de entrada (rota interna, rota pública) produzem o
  mesmo HTML pro mesmo conjunto de dados normalizado.
- Teste do botão "Copiar link do relatório": só aparece pra admin, só
  quando `status === 'aprovada'`, usa o `codigo_certificado` certo.

**Verificação ao vivo obrigatória** (padrão do projeto pra qualquer fase com
UI): abrir `/relatorio/[codigo]` sem estar logado, num navegador anônimo,
confirmar que o gate aparece, que escolher uma origem libera o relatório, que
um F5 depois pede a origem de novo, e que um código inválido mostra erro sem
vazar informação.

## Fora de escopo (YAGNI, decisões explícitas)

- Rate-limiting/CAPTCHA no gate de origem — volume baixo, mesmo critério já
  usado noutras partes do projeto; revisar se abuso real acontecer.
- Persistência da liberação entre visitas (cookie/sessão) — decisão
  explícita do usuário de sempre pedir a origem de novo.
- RF-52 (busca pública por código de certificado) — projeto externo
  separado, fora deste repositório.
- Qualquer analytics/dashboard sobre os dados de `client_access_logs` além
  do admin conseguir ler a tabela via SQL/Supabase Studio — sem tela nova no
  app pra visualizar isso.
