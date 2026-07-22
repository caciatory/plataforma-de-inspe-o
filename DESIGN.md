---
version: alpha
name: Check Auto Design System
description: Product design system for the Check Auto vehicle pre-purchase inspection app — técnico field checklist, admin review, client report.
colors:
  # Brand green ramp — anchored to the official Check Auto brand color (#11C685 = green.500)
  green.50: oklch(0.97 0.02 160)
  green.100: oklch(0.93 0.045 160)
  green.200: oklch(0.87 0.075 160)
  green.300: oklch(0.80 0.11 160)
  green.400: oklch(0.76 0.14 160)
  green.500: oklch(0.73 0.161 160.5)
  green.600: oklch(0.68 0.155 159)
  green.700: oklch(0.60 0.145 158)
  green.800: oklch(0.48 0.125 156)
  green.900: oklch(0.36 0.10 155)

  # Semantic status colors — the app's core domain (classificação: ótimo/médio/ruim/NF)
  amber.100: oklch(0.94 0.05 78)
  amber.500: oklch(0.78 0.15 75)
  amber.600: oklch(0.70 0.15 72)
  red.100: oklch(0.93 0.04 25)
  red.500: oklch(0.63 0.19 25)
  red.600: oklch(0.55 0.19 24)

  # Neutrals — light mode (working canvas, tinted 0.005-0.015 chroma toward brand hue)
  bg: oklch(0.98 0.006 160)
  surface: oklch(0.995 0.004 160)
  border: oklch(0.88 0.01 160)
  ink: oklch(0.20 0.02 160)
  ink-muted: oklch(0.45 0.015 160)

  # Neutrals — dark mode (used for identity touchpoints: header, nav, splash, primary CTAs)
  bg-dark: oklch(0.16 0.01 160)
  surface-dark: oklch(0.21 0.012 160)
  border-dark: oklch(0.32 0.015 160)
  ink-dark: oklch(0.96 0.006 160)
  ink-muted-dark: oklch(0.72 0.01 160)

  # Identity anchors (exact brand hex, used at chrome/logo touchpoints)
  identity-black: '#000000'
  identity-white: '#FFFFFF'

  # Semantic roles
  status.otimo: '{colors.green.500}'
  status.medio: '{colors.amber.500}'
  status.ruim: '{colors.red.500}'
  status.nf: '{colors.ink-muted}'
  primary: '{colors.green.500}'
  primary-hover: '{colors.green.600}'
  danger: '{colors.red.500}'
  danger-hover: '{colors.red.600}'

typography:
  display:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: clamp(1.75rem, 1.5rem + 1vw, 2.25rem)
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  h1:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.25
  h2:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: Inter, sans-serif
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Inter, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter, sans-serif
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter, sans-serif
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: Inter, sans-serif
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4

rounded:
  sm: 0.25rem
  md: 0.5rem
  lg: 0.75rem
  full: 9999px

spacing:
  0: 0
  1: 0.25rem
  2: 0.5rem
  3: 0.75rem
  4: 1rem
  5: 1.5rem
  6: 2rem
  7: 3rem
  8: 4rem

components:
  button-primary:
    background: '{colors.primary}'
    color: '{colors.identity-black}'
    backgroundHover: '{colors.primary-hover}'
    rounded: '{rounded.md}'
  button-danger:
    background: '{colors.danger}'
    color: '{colors.identity-white}'
    backgroundHover: '{colors.danger-hover}'
    rounded: '{rounded.md}'
  status-badge-otimo:
    background: '{colors.green.100}'
    color: '{colors.green.800}'
    rounded: '{rounded.full}'
  status-badge-medio:
    background: '{colors.amber.100}'
    color: '{colors.amber.600}'
    rounded: '{rounded.full}'
  status-badge-ruim:
    background: '{colors.red.100}'
    color: '{colors.red.600}'
    rounded: '{rounded.full}'
  input:
    background: '{colors.surface}'
    border: '{colors.border}'
    color: '{colors.ink}'
    rounded: '{rounded.sm}'
  header:
    background: '{colors.identity-black}'
    color: '{colors.identity-white}'
---

# Check Auto — Design System

## Overview

Check Auto é uma ferramenta de trabalho (registro **product**, não brand/marketing): técnico preenche uma checklist de vistoria veicular em tablet, admin revisa em desktop, cliente lê o relatório final. O design serve a tarefa — clareza e velocidade acima de decoração — sem abrir mão da identidade visual da marca (verde `#11C685`, preto, tipografia geométrica bold).

**Decisão de tema:** preto (`identity-black`) é reservado aos **pontos de identidade** — cabeçalho, navegação, splash, botões primários — não é o fundo de toda a interface. As telas de trabalho (formulários longos, checklist de 320 itens, relatório) usam um canvas neutro claro (`bg`/`surface`), porque preto sólido em sessões longas de leitura/preenchimento cansa mais do que ajuda. Um tema escuro completo (`bg-dark`/`surface-dark`) existe como alternativa consistente, não como padrão.

## Colors

A cor de marca (`green.500` = `#11C685`) é o ponto de ancoragem de uma rampa OKLCH completa — o brand guideline só definia duas variações (`#11C685`/`#10B87C`), insuficiente pra badges, hover, fundo sutil, texto sobre fundo claro etc. `green.600` aproxima o "Verde Escuro" já existente na marca.

**Cores semânticas** (o núcleo do domínio — classificação ótimo/médio/ruim/NF): `status.otimo` reusa o verde da marca; `status.medio` (âmbar) e `status.ruim` (vermelho) foram propostos com o mesmo peso visual/saturação do verde, pra formar um sistema coerente, não cores genéricas de alerta.

**Regra de contraste travada** (verificado com a fórmula de luminância relativa do WCAG, não estimado):
- Texto **preto** sobre `green.500`/`amber.500` → **9.4:1**, ótimo.
- Texto **branco** sobre `green.500` → **2.2:1**, reprova. Nunca usar.
- Texto **branco** sobre `red.500` (mais escuro) → contraste adequado, é o par correto ali.
- `ink` (`oklch(0.20 0.02 160)`) sobre `bg` — não é preto puro nem branco puro em nenhum extremo de leitura longa: reduz fadiga visual em sessões de preenchimento extensas.

## Typography

Fonte de identidade da marca é **Codec Pro** — mas o arquivo que a Check Auto tem acesso (via Canva/1001fonts) é licenciado só pra uso pessoal, **não permite `@font-face` em produção**. Até haver uma licença web comprada direto da Zetafonts (zetafonts.com, fundição original), os tokens `display`/`h1`/`h2` usam **Space Grotesk** (Google Fonts, geométrica/bold, grátis pra uso comercial, sensação próxima) como substituta — trocar a `fontFamily` desses três tokens é a única mudança necessária no dia em que a licença for resolvida.

Corpo de texto usa **Inter** — já era a sugestão do próprio manual de marca pra blocos de texto longos (relatórios, formulários), e é a fonte certa pra isso: neutra, legível em tamanho pequeno, contraste tipográfico real contra a Space Grotesk geométrica dos títulos (não são fontes "parecidas mas não idênticas" — a regra a evitar).

## Layout

- Grid de espaçamento em base 4px (`spacing.1`–`spacing.8`), suficiente pra formulários densos sem inventar valores arbitrários.
- Uma tarefa por tela é o padrão já estabelecido no código (Fase 2/2.5: "salvar e próximo") — o design reforça isso, nunca empilha múltiplos formulários na mesma view.
- Flexbox pra listas de checklist/grupos (1D); Grid só se aparecer um layout genuinamente bidimensional (ex: grade de fotos anexadas).

## Elevation & Depth

Produto de trabalho, não superfície decorativa — elevação é funcional, não estética. Cards/painéis usam `border` (1px, `colors.border`) em vez de sombra pesada; reservar sombra sutil (`0 1px 2px oklch(0 0 0 / 0.06)`) só pra elementos flutuantes reais (dropdown, modal, toast) que precisam se destacar do conteúdo por trás.

## Shapes

Cantos arredondados moderados (`rounded.sm`/`rounded.md`) em inputs/botões/cards — nada squircle exagerado, nada 100% quadrado (não combina com a identidade arredondada do próprio ícone/logo). `rounded.full` reservado a badges de status (pill shape) e avatares.

## Components

Ver bloco `components` no frontmatter. Direção geral:
- **Botão primário**: fundo `primary` (verde), texto preto — nunca branco, por causa do contraste.
- **Botão de perigo/destrutivo**: fundo `danger` (vermelho), texto branco.
- **Badge de status**: fundo do tom `.100` da cor semântica, texto do tom `.600`/`.800` da mesma família — nunca a cor `.500` pura como fundo com texto por cima (perde contraste em área pequena).
- **Header/nav**: o único lugar que usa `identity-black` como fundo sólido por padrão — aqui é onde a marca "aparece".

## Do's and Don'ts

**Faça:**
- Use `status.medio`/`status.ruim`/`status.otimo` para toda classificação — nunca uma cor de alerta genérica fora dessa paleta.
- Use texto preto sobre qualquer fundo verde ou âmbar; texto branco só sobre vermelho ou sobre `identity-black`.
- Reserve `identity-black` pra cabeçalho, navegação, botões primários e pontos de marca — não pro fundo geral das telas de trabalho.

**Não faça:**
- Não use `green.500` sozinho como fundo de texto longo — é uma cor de acento/ação, não de leitura.
- Não invente um vermelho/âmbar fora da rampa definida aqui pra "chamar mais atenção" — quebra o sistema semântico que o app inteiro depende (classificação é o core do produto).
- Não use a Codec Pro embutida via `@font-face` até a licença comercial estar resolvida — ver nota em Typography.
