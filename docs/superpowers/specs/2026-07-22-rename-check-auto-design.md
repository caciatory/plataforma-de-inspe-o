# Rename: Inspecta → Check Auto — Design

## Contexto

O produto se chamava "Inspecta" como codinome interno de desenvolvimento. O projeto perdeu o domínio `inspecta.*`; o nome real da marca agora é **Check Auto** (`checkauto.pt` já é o domínio em uso — visível na conta técnico de teste, `teste1@checkauto.pt`). Esta é a Fase 2.6 do `docs/ROADMAP.md`, antes da Fase 2.7 (aplicar o sistema de design visual — `PRODUCT.md`/`DESIGN.md`, já commitados — nas telas existentes).

## Escopo

Trocar toda menção a "Inspecta" como **nome de marca atual** por "Check Auto", nos documentos "vivos" (que refletem o estado atual do produto) e no código/UI. Documentos **históricos** (datados, registro de decisões tomadas sob o nome antigo) ficam intocados — não se reescreve história.

### Arquivos alterados

| Arquivo | Linha | De | Para |
|---|---|---|---|
| `README.md` | 1 | `# Inspecta` | `# Check Auto` |
| `CLAUDE.md` | 1 | `# bild app (Inspecta)` | `# bild app (Check Auto)` |
| `docs/ROADMAP.md` | 1 | `# Roadmap — Inspecta v1.0` | `# Roadmap — Check Auto v1.0` |
| `docs/database-schema-v1.md` | 1 | `# Inspecta — Esquema de Banco de Dados v1.0` | `# Check Auto — Esquema de Banco de Dados v1.0` |
| `package.json` | 2 | `"name": "inspecta-app"` | `"name": "check-auto-app"` |
| `app/layout.tsx` | 4 | `title: "Inspecta"` | `title: "Check Auto"` |
| `app/login/page.tsx` | 34 | `<h1>Inspecta — Login</h1>` | `<h1>Check Auto — Login</h1>` |

`package-lock.json` não é editado à mão — se atualiza sozinho no próximo `npm install` (fora do escopo desta task rodar isso).

`docs/especificacao-tecnica-v1.md` **não muda** — seu título nunca continha "Inspecta"; as únicas ocorrências no arquivo são referências de caminho a `docs/data/checklist-inspecta-v5.csv` e a specs datadas, ambas fora de escopo (ver abaixo).

### Fora de escopo (decisão explícita do usuário)

- **Nome do repositório GitHub** (`caciatory/plataforma-de-inspe-o`) — não contém "Inspecta" literalmente, é só descritivo em português. Não muda.
- **Specs e planos datados** em `docs/superpowers/specs/*` e `docs/superpowers/plans/*` (ex. `2026-07-09-inspecta-prd-design.md`) — registro histórico de decisões tomadas sob o nome antigo, análogo a uma mensagem de commit antiga. Ficam como estão, nome de arquivo incluído.
- **`journey-into-inspecta.md`** — relatório narrativo histórico já commitado numa sessão anterior. Fica como está.
- **Comentários em migrations já aplicadas** (`supabase/migrations/0000*.sql` até `00025`) — regra existente do projeto proíbe editar migration já aplicada no banco hospedado.
- **`docs/data/checklist-inspecta-v5.csv`** (nome do arquivo) e toda referência a esse caminho em scripts/migrations/docs — não é uma menção à marca, é o nome de um arquivo de dados. Renomear o arquivo é uma mudança maior (cascata em scripts geradores e comentários de migration já aplicada) e não foi pedida.
- **Design visual** (logo, favicon, cores, tipografia) — isso é a Fase 2.7, que já tem `DESIGN.md` pronto pra guiar.

## Verificação

Nenhum teste existente depende do texto "Inspecta" (confirmado via grep em todos os arquivos `*.test.*` antes de escrever este spec — zero ocorrências). A troca é puramente textual em 7 arquivos, sem lógica nova. Verificação:

1. `npm test` — confirma que nada quebrou (esperado: mesma contagem de testes/arquivos de antes).
2. `npx tsc --noEmit` — confirma que `package.json`/`app/layout.tsx`/`app/login/page.tsx` continuam válidos.
3. `grep -rli "inspecta" README.md CLAUDE.md docs/ROADMAP.md docs/database-schema-v1.md package.json app/layout.tsx app/login/page.tsx` — deve retornar vazio (nenhuma ocorrência residual nos 7 arquivos do escopo).
4. Verificação manual rápida no navegador: título da aba e `<h1>` da tela de login mostram "Check Auto".

## Testing

Sem testes novos — é uma troca de string em arquivos de config/doc/UI estática, coberta pela verificação acima (suite existente + grep residual + checagem visual). Não há comportamento novo pra testar com TDD.
