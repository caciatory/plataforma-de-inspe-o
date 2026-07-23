# Re-seed do checklist v7 (Peça 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o seed atual do checklist (320 itens/12 grupos) pelo conteúdo real de 360 itens/13 categorias (`docs/data/checklist-inspecta-v7.md`), usando o schema genérico de tipos de resposta já pronto (Peças 1a/1b).

**Architecture:** Um script Python (`scripts/generate_checklist_seed_v7.py`) parseia o `.md` diretamente e gera uma migration SQL (`supabase/migrations/00037_seed_checklist_v7.sql`) que apaga o seed antigo e insere o novo: 13 grupos, 22 conjuntos de opções compartilhados, 359 itens (`checklist_item_templates`), e 40 grupos de "aplicar aos demais" (`grupo_replicacao`). Sem CSV intermediário — o `.md` é a fonte única.

**Tech Stack:** Python 3.9+ (stdlib só — `re`, `unicodedata`, `pathlib`, `collections`), Postgres/Supabase (migrations `.sql`, testes `.test.sql` no estilo `do $$ ... raise exception/notice ... end $$` já usado no repo).

## Global Constraints

- Fonte única de dados: `docs/data/checklist-inspecta-v7.md` (já commitado, corrigido de mojibake). Nunca editar o SQL gerado à mão — reexecutar o script se o `.md` mudar.
- Migrations aplicadas direto no banco remoto via `supabase db push --db-url "$DATABASE_URL"` (sem Docker local). Testes SQL rodados via `psql "$DATABASE_URL" -f arquivo.test.sql`. Conectar antes com: `export PATH="/opt/homebrew/opt/libpq/bin:$PATH" && set -a && source .env.local && set +a` (na raiz do worktree).
- Working directory correto: `~/Desktop/bild app` (nunca `/Volumes/KINGSTON/...` — deprecated).
- Design aprovado: `docs/superpowers/specs/2026-07-24-reseed-checklist-v7-design.md`.
- `grupo_replicacao` regra: agrupa só itens `tipo='escolha'` que diferem no lado esquerdo/direito, nunca misturando dianteiro/traseiro — mesmo nos casos em que o v6 antigo misturava (decisão deliberada do usuário, ver design §5).
- `Sim/Não` e `Sim/Não/N.A.` têm polaridade ambígua por item — resolvida por uma lista de overrides por nome, não pelo rótulo (ver design §3).

---

### Task 1: Script gerador — parsing, mapeamento de tipos, grupo_replicacao, faixas de medição

**Files:**
- Create: `scripts/generate_checklist_seed_v7.py`
- Create: `scripts/test_generate_checklist_seed_v7.py`

**Interfaces:**
- Consumes: `docs/data/checklist-inspecta-v7.md` (360 linhas de item, formato `## N. Grupo` / `### Subcategoria` / tabela markdown `| # | Item | Tipo | Opções | Regra | Observações |`).
- Produces (usado pela Task 2): `generate_checklist_seed_v7.build(rows: list[dict]) -> str` (retorna o SQL completo da migration); `generate_checklist_seed_v7.main()` (escreve em `supabase/migrations/00037_seed_checklist_v7.sql`).

- [ ] **Step 1: Escrever o script gerador completo**

```python
#!/usr/bin/env python3
"""Gera supabase/migrations/00037_seed_checklist_v7.sql a partir de
docs/data/checklist-inspecta-v7.md. Nao editar o SQL gerado a mao --
reexecute este script se o .md mudar."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


def slugify(text: str) -> str:
    ascii_text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")

SRC = Path("docs/data/checklist-inspecta-v7.md")
OUT = Path("supabase/migrations/00037_seed_checklist_v7.sql")

GROUP_RE = re.compile(r"^## (\d+)\.\s*(.+)$")
SUBCAT_RE = re.compile(r"^### (.+)$")
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|(.*)\|$")
GRUPOS_INATIVOS = {13}  # Motoriz. Especial (F2) — Fase 9, fora do v1.0

ITEM_NOTA_EXCLUIDA = 351  # "Itens motor termico aplicam-se - ver Seccao 5": nota, nao e' item de verificacao

TIPO_MAP: dict[str, tuple[str, str | None]] = {
    "Texto Livre": ("texto", None),
    "Texto Livre (nº)": ("texto", None),
    "Data": ("data", None),
    "Medição (µm)": ("medicao", "µm"),
    "Medição (mm)": ("medicao", "mm"),
    "Medição (%)": ("medicao", "%"),
    "Medição (V)": ("medicao", "V"),
    "Bom / Médio / Mau": ("escolha", "estado_3"),
    "Estado de Limpeza": ("escolha", "estado_3"),
    "Bom / Médio / Mau / N.A.": ("escolha", "estado_3_na"),
    "Funciona / Não Funciona": ("escolha", "funciona_2"),
    "Funciona / Não Funciona / N.A.": ("escolha", "funciona_2_na"),
    "Grau de Corrosão": ("escolha", "grau_corrosao"),
    "Estado do Fluido": ("escolha", "estado_fluido"),
    "Nível de Fluido": ("escolha", "nivel_fluido"),
    "Nível de Desgaste": ("escolha", "nivel_desgaste"),
    "Nível de Saturação": ("escolha", "nivel_saturacao"),
    "Estado do Histórico": ("escolha", "estado_historico"),
    "Intensidade de Odor": ("escolha", "intensidade_odor"),
    "Cor da Emissão": ("escolha", "cor_emissao"),
    "Códigos de Erro Ativos": ("escolha", "nenhum_indicar"),
    "Luzes de Aviso Ativas": ("escolha", "nenhum_indicar"),
    "Luz de Aviso (Segurança)": ("escolha", "luz_aviso_seguranca"),
    "Presença e Estado": ("escolha", "presenca_estado"),
    "Presença e Conformidade": ("escolha", "presenca_conformidade"),
    "Completude de Chaves": ("escolha", "completude_chaves"),
    "Temperatura Após Condução": ("escolha", "temperatura_apos_conducao"),
    "Ver Categoria 5": (None, None),
    "Sim / Não": ("escolha", "__SIM_NAO__"),
    "Sim / Não / N.A.": ("escolha", "__SIM_NAO_NA__"),
}

# Sim/Nao e Sim/Nao/N.A. tem polaridade ambigua no rotulo -- resolvida por
# nome de item. Todo item nesta lista usa Sim = problema (exige_foto).
# Todo item Sim/Nao fora desta lista usa Sim = presenca boa (sem exige_foto).
SIM_NAO_PROBLEMA = {
    "Indícios de adulteração de quilometragem",
    "Registo de acidentes anteriores",
    "Ruídos nas portas ao abrir/fechar",
    "Porta-bagagens – sinais de infiltração de água",
    "Presença de humidade nos faróis",
    "Sinais de infiltração no teto",
    "Desgaste irregular – dianteiro esq.",
    "Desgaste irregular – dianteiro dir.",
    "Desgaste irregular – traseiro esq.",
    "Desgaste irregular – traseiro dir.",
    "Cortes/bolhas – dianteiro esq.",
    "Cortes/bolhas – dianteiro dir.",
    "Cortes/bolhas – traseiro esq.",
    "Cortes/bolhas – traseiro dir.",
    "Fugas de óleo visíveis",
    "Fugas de líquido de arrefecimento",
    "Sinais de reparação de colisão – longarinas",
    "Sinais de reparação de colisão – travessas",
    "Deformação do chassis visível",
    "Tubagem de travão – fugas visíveis",
    "Ruídos na suspensão (estática)",
    "Vibração ao acelerar",
    "Ruídos anormais ao acelerar",
    "Vibração ao travar",
    "Ruídos anormais ao travar",
    "Fugas após estacionamento",
    "Sinais de infiltração de água",  # teto solar
    "Rasgos/furos na lona",
    "Infiltrações pela capota",
    "Ruídos anormais na operação",
    "Alertas ou células danificadas na bateria",
    "Alertas do sistema híbrido no painel",
    "Tubagens e ligações GPL – fugas (detetor de gás)",
}

CONJUNTO_OPCOES: dict[str, list[str]] = {
    "estado_3": ["Bom", "Médio", "Mau"],
    "estado_3_na": ["Bom", "Médio", "Mau", "N.A."],
    "funciona_2": ["Funciona", "Não Funciona"],
    "funciona_2_na": ["Funciona", "Não Funciona", "N.A."],
    "sim_nao_problema": ["Sim", "Não"],
    "sim_nao_problema_na": ["Sim", "Não", "N.A."],
    "sim_nao_presenca": ["Sim", "Não"],
    "sim_nao_presenca_na": ["Sim", "Não", "N.A."],
    "grau_corrosao": ["Ausente", "Ligeira", "Moderada", "Severa"],
    "estado_fluido": ["Bom", "Contaminado", "Substituir"],
    "nivel_fluido": ["Adequado", "Baixo", "Muito Baixo"],
    "nivel_desgaste": ["Bom (>50%)", "Médio (20–50%)", "Substituir (<20%)"],
    "nivel_saturacao": ["Baixa", "Média", "Alta", "N.A. (gasolina)"],
    "estado_historico": ["Completo", "Parcial", "Inexistente"],
    "intensidade_odor": ["Ausente", "Leve", "Forte"],
    "cor_emissao": ["Ausente", "Azul (óleo)", "Branco (água)", "Preto (combustível)"],
    "nenhum_indicar": ["Nenhum", "Indicar (ver observações)"],
    "luz_aviso_seguranca": ["Apaga após arranque", "Permanece acesa", "N.A."],
    "presenca_estado": ["Presente (bom estado)", "Presente (danificado)", "Ausente"],
    "presenca_conformidade": ["Completo", "Incompleto", "Ausente"],
    "completude_chaves": ["Completo (1ª, 2ª e segredo jantes)", "Incompleto", "Nenhuma chave"],
    "temperatura_apos_conducao": ["Normal", "Elevada"],
}

# conjunto -> conjunto de opcoes (labels) que exigem foto (RF-16)
EXIGE_FOTO: dict[str, set[str]] = {
    "estado_3": {"Mau"},
    "estado_3_na": {"Mau"},
    "funciona_2": {"Não Funciona"},
    "funciona_2_na": {"Não Funciona"},
    "sim_nao_problema": {"Sim"},
    "sim_nao_problema_na": {"Sim"},
    "sim_nao_presenca": set(),
    "sim_nao_presenca_na": set(),
    "grau_corrosao": {"Severa"},
    "estado_fluido": {"Substituir"},
    "nivel_fluido": {"Muito Baixo"},
    "nivel_desgaste": {"Substituir (<20%)"},
    "nivel_saturacao": {"Alta"},
    "estado_historico": {"Inexistente"},
    "intensidade_odor": {"Forte"},
    "cor_emissao": {"Azul (óleo)", "Branco (água)", "Preto (combustível)"},
    "nenhum_indicar": {"Indicar (ver observações)"},
    "luz_aviso_seguranca": {"Permanece acesa"},
    "presenca_estado": {"Presente (danificado)", "Ausente"},
    "presenca_conformidade": {"Incompleto", "Ausente"},
    "completude_chaves": {"Incompleto", "Nenhuma chave"},
    "temperatura_apos_conducao": {"Elevada"},
}

# Item (por nome exato) -> overrides de faixa de medicao. Tinta reusa os
# valores ja em producao (Peca 1a); piso/fluido de travoes/alternador vem
# dos numeros explicitos no proprio documento v7 (ver design §4).
FAIXA_OVERRIDE_POR_PREFIXO = {
    "Espessura de pintura": dict(unidade_medicao="µm", faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300),
    "Profundidade do piso": dict(unidade_medicao="mm", limiar_critico_inferior=1.6),
}
FAIXA_OVERRIDE_POR_NOME = {
    "Teste do fluido de travões": dict(unidade_medicao="%", limiar_critico_superior=3),
    "Alternador – tensão de carga": dict(unidade_medicao="V", faixa_min_ok=13.8, faixa_max_ok=14.4),
}

PTS_RE = re.compile(r"(\d+)\s*pts")
LR_RE = re.compile(r"\s*[–\-]?\s*\b(esquerdo|esquerda|direito|direita|esq\.|dir\.)", re.IGNORECASE)


def parse_markdown(path: Path) -> list[dict]:
    rows = []
    grupo_ordem = grupo_nome = subcategoria = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = GROUP_RE.match(line)
        if m:
            grupo_ordem, grupo_nome = int(m.group(1)), m.group(2).strip()
            continue
        m = SUBCAT_RE.match(line)
        if m:
            subcategoria = m.group(1).strip()
            continue
        m = ROW_RE.match(line)
        if m:
            num = int(m.group(1))
            cells = [c.strip() for c in m.group(2).split("|")]
            if len(cells) != 5:
                raise SystemExit(f"linha #{num}: esperava 5 celulas, achei {len(cells)}")
            nome, tipo_resposta, opcoes, regra, observacoes = cells
            rows.append(dict(
                num=num, grupo_ordem=grupo_ordem, grupo_nome=grupo_nome,
                subcategoria=subcategoria, nome=nome, tipo_resposta=tipo_resposta,
                opcoes=opcoes, regra=regra, observacoes=observacoes,
            ))
    return rows


def resolve_tipo(row: dict) -> tuple[str | None, str | None]:
    tipo, extra = TIPO_MAP[row["tipo_resposta"]]
    if tipo != "escolha" or extra not in ("__SIM_NAO__", "__SIM_NAO_NA__"):
        return tipo, extra
    is_na = extra == "__SIM_NAO_NA__"
    is_problema = row["nome"] in SIM_NAO_PROBLEMA
    if is_problema:
        return "escolha", "sim_nao_problema_na" if is_na else "sim_nao_problema"
    return "escolha", "sim_nao_presenca_na" if is_na else "sim_nao_presenca"


def base_name_sans_lr(nome: str) -> str | None:
    new = LR_RE.sub(" ", nome)
    new = re.sub(r"\s+", " ", new).strip()
    new = re.sub(r"\s*-\s*$", "", new).strip()
    return new if new != nome else None


def qtd_pontos_medicao(row: dict) -> int:
    m = PTS_RE.search(row["observacoes"])
    return int(m.group(1)) if m else 1


def faixa_para(nome: str) -> dict:
    for prefixo, faixa in FAIXA_OVERRIDE_POR_PREFIXO.items():
        if nome.startswith(prefixo):
            return faixa
    return FAIXA_OVERRIDE_POR_NOME.get(nome, {})


def sql_str(value) -> str:
    if value is None:
        return "null"
    value = str(value).strip()
    if not value:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_num(value) -> str:
    return "null" if value is None else str(value)


def build(rows: list[dict]) -> str:
    rows = [r for r in rows if r["num"] != ITEM_NOTA_EXCLUIDA]

    grupos = sorted({(r["grupo_ordem"], r["grupo_nome"]) for r in rows})

    # grupo_replicacao: so' tipo='escolha', dentro do mesmo (grupo, subcategoria),
    # nunca mistura dianteiro/traseiro (decisao do usuario, ver design §5).
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        tipo, _ = resolve_tipo(r)
        if tipo != "escolha":
            continue
        bn = base_name_sans_lr(r["nome"])
        if bn is None:
            continue
        buckets[(r["grupo_ordem"], r["subcategoria"], bn)].append(r)

    grupo_replicacao_por_item: dict[int, str] = {}
    slug_seen: Counter = Counter()
    for (grupo_ordem, subcat, base), members in buckets.items():
        if len(members) < 2:
            continue
        slug = f"{slugify(subcat)}-{slugify(base)}"
        slug_seen[slug] += 1
        for r in members:
            grupo_replicacao_por_item[r["num"]] = slug

    lines = [
        "-- supabase/migrations/00037_seed_checklist_v7.sql",
        "-- Peca 2: docs/superpowers/specs/2026-07-24-reseed-checklist-v7-design.md",
        "-- Gerado por scripts/generate_checklist_seed_v7.py a partir de",
        "-- docs/data/checklist-inspecta-v7.md. Nao editar a mao -- reexecute",
        "-- o script se o .md mudar.",
        "",
        "-- Limpa o seed antigo (320 itens/12 grupos) e os conjuntos de opcoes",
        "-- orfaos da Peca 1a (estado_4, so' existia pro backfill temporario).",
        "delete from public.checklist_item_templates;",
        "delete from public.checklist_group_templates;",
        "delete from public.opcoes where conjunto_id in (select id from public.conjuntos_opcao where nome = 'estado_4');",
        "delete from public.conjuntos_opcao where nome = 'estado_4';",
        "",
        "insert into public.checklist_group_templates (ordem, nome, ativo) values",
    ]
    group_values = []
    for ordem, nome in grupos:
        ativo = "false" if ordem in GRUPOS_INATIVOS else "true"
        group_values.append(f"  ({ordem}, {sql_str(nome)}, {ativo})")
    lines.append(",\n".join(group_values) + ";")
    lines.append("")

    lines.append("insert into public.conjuntos_opcao (nome) values")
    lines.append(",\n".join(f"  ({sql_str(nome)})" for nome in CONJUNTO_OPCOES) + ";")
    lines.append("")

    lines.append("insert into public.opcoes (conjunto_id, label, ordem, exige_foto) values")
    opcao_values = []
    for conjunto, labels in CONJUNTO_OPCOES.items():
        exige = EXIGE_FOTO[conjunto]
        for i, label in enumerate(labels, start=1):
            opcao_values.append(
                f"  ((select id from public.conjuntos_opcao where nome = {sql_str(conjunto)}), "
                f"{sql_str(label)}, {i}, {'true' if label in exige else 'false'})"
            )
    lines.append(",\n".join(opcao_values) + ";")
    lines.append("")

    lines.append(
        "insert into public.checklist_item_templates "
        "(group_id, subcategoria, nome, tipo, qtd_pontos_medicao, aplica_stand, "
        "observacoes, conjunto_opcao_id, unidade_medicao, faixa_min_ok, faixa_max_ok, "
        "limiar_critico_inferior, limiar_critico_superior, grupo_replicacao) values"
    )
    item_values = []
    for r in rows:
        tipo, extra = resolve_tipo(r)
        group_sub = f"(select id from public.checklist_group_templates where ordem = {r['grupo_ordem']})"
        conjunto_id_sql = "null"
        unidade = faixa_min = faixa_max = limiar_inf = limiar_sup = "null"
        qtd = "null"
        grupo_rep = sql_str(grupo_replicacao_por_item.get(r["num"]))

        if tipo == "escolha":
            conjunto_id_sql = f"(select id from public.conjuntos_opcao where nome = {sql_str(extra)})"
        elif tipo == "medicao":
            qtd = str(qtd_pontos_medicao(r))
            faixa = faixa_para(r["nome"])
            unidade = sql_str(faixa.get("unidade_medicao"))
            faixa_min = sql_num(faixa.get("faixa_min_ok"))
            faixa_max = sql_num(faixa.get("faixa_max_ok"))
            limiar_inf = sql_num(faixa.get("limiar_critico_inferior"))
            limiar_sup = sql_num(faixa.get("limiar_critico_superior"))
            grupo_rep = "null"  # medicao nao pode ter grupo_replicacao (constraint)

        item_values.append(
            f"  ({group_sub}, {sql_str(r['subcategoria'])}, {sql_str(r['nome'])}, "
            f"{sql_str(tipo)}, {qtd}, false, {sql_str(r['observacoes'])}, "
            f"{conjunto_id_sql}, {unidade}, {faixa_min}, {faixa_max}, {limiar_inf}, {limiar_sup}, {grupo_rep})"
        )
    lines.append(",\n".join(item_values) + ";")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    rows = parse_markdown(SRC)
    sql = build(rows)
    OUT.write_text(sql, encoding="utf-8")
    print(f"escrito {OUT} ({len(sql.splitlines())} linhas)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Escrever o self-check do script**

```python
#!/usr/bin/env python3
"""Self-check pra scripts/generate_checklist_seed_v7.py -- roda sem pytest,
so' assert. `python3 scripts/test_generate_checklist_seed_v7.py`."""
from collections import Counter

from generate_checklist_seed_v7 import (
    CONJUNTO_OPCOES,
    EXIGE_FOTO,
    GRUPOS_INATIVOS,
    ITEM_NOTA_EXCLUIDA,
    SIM_NAO_PROBLEMA,
    SRC,
    TIPO_MAP,
    base_name_sans_lr,
    parse_markdown,
    qtd_pontos_medicao,
    resolve_tipo,
)


def test_parse_360_rows_13_grupos():
    rows = parse_markdown(SRC)
    assert len(rows) == 360, f"esperava 360 linhas, achei {len(rows)}"
    assert [r["num"] for r in rows] == list(range(1, 361))
    grupos = sorted({r["grupo_ordem"] for r in rows})
    assert grupos == list(range(1, 14)), f"esperava grupos 1..13, achei {grupos}"


def test_todos_rotulos_mapeados():
    rows = parse_markdown(SRC)
    labels = {r["tipo_resposta"] for r in rows}
    unmapped = labels - set(TIPO_MAP)
    assert not unmapped, f"rotulos sem mapeamento: {unmapped}"


def test_contagem_por_tipo_e_exclusao_351():
    rows = [r for r in parse_markdown(SRC) if r["num"] != ITEM_NOTA_EXCLUIDA]
    assert len(rows) == 359
    tipo_count = Counter()
    for r in rows:
        tipo, _ = resolve_tipo(r)
        tipo_count[tipo] += 1
    assert tipo_count == Counter(texto=20, escolha=315, data=4, medicao=20), dict(tipo_count)


def test_sim_nao_problema_so_cita_itens_reais():
    rows = parse_markdown(SRC)
    sim_nao_names = {
        r["nome"] for r in rows
        if TIPO_MAP[r["tipo_resposta"]][0] == "escolha"
        and TIPO_MAP[r["tipo_resposta"]][1] in ("__SIM_NAO__", "__SIM_NAO_NA__")
    }
    unknown = SIM_NAO_PROBLEMA - sim_nao_names
    assert not unknown, f"SIM_NAO_PROBLEMA cita item(ns) inexistentes: {unknown}"


def test_conjuntos_usados_tem_opcoes_e_exige_foto():
    rows = [r for r in parse_markdown(SRC) if r["num"] != ITEM_NOTA_EXCLUIDA]
    usados = set()
    for r in rows:
        tipo, extra = resolve_tipo(r)
        if tipo == "escolha":
            usados.add(extra)
    assert len(usados) == 22, f"esperava 22 conjuntos usados, achei {len(usados)}: {sorted(usados)}"
    assert not (usados - set(CONJUNTO_OPCOES)), "conjunto usado sem opcoes definidas"
    assert not (usados - set(EXIGE_FOTO)), "conjunto usado sem exige_foto definido"
    for c in usados:
        assert len(CONJUNTO_OPCOES[c]) >= 2, f"{c} tem menos de 2 opcoes"
        assert EXIGE_FOTO[c] <= set(CONJUNTO_OPCOES[c]), f"{c}: exige_foto cita label fora do conjunto"


def test_grupo_replicacao_nunca_mistura_dianteiro_traseiro():
    from collections import defaultdict
    rows = [r for r in parse_markdown(SRC) if r["num"] != ITEM_NOTA_EXCLUIDA]
    buckets = defaultdict(list)
    for r in rows:
        tipo, _ = resolve_tipo(r)
        if tipo != "escolha":
            continue
        bn = base_name_sans_lr(r["nome"])
        if bn is None:
            continue
        buckets[(r["grupo_ordem"], r["subcategoria"], bn)].append(r["nome"])

    groups = {k: v for k, v in buckets.items() if len(v) >= 2}
    assert len(groups) == 40, f"esperava 40 grupos de replicacao, achei {len(groups)}"
    for key, members in groups.items():
        assert len(members) == 2, f"grupo {key} tem {len(members)} membros, esperava 2: {members}"
        tem_dianteiro = any("dianteir" in m.lower() for m in members)
        tem_traseiro = any("traseir" in m.lower() for m in members)
        assert not (tem_dianteiro and tem_traseiro), f"grupo {key} mistura dianteiro/traseiro: {members}"

    # spot checks de grupos conhecidos (nao devem mais ser 1 grupo de 4)
    farol_dianteiro = groups[(2, "Faróis e Luzes", "Farol dianteiro – estado")]
    assert set(farol_dianteiro) == {"Farol dianteiro esquerdo – estado", "Farol dianteiro direito – estado"}
    pneu_dianteiro = groups[(4, "Pneus", "Pneu dianteiro – estado geral")]
    assert set(pneu_dianteiro) == {"Pneu dianteiro esquerdo – estado geral", "Pneu dianteiro direito – estado geral"}
    pneu_traseiro = groups[(4, "Pneus", "Pneu traseiro – estado geral")]
    assert set(pneu_traseiro) == {"Pneu traseiro esquerdo – estado geral", "Pneu traseiro direito – estado geral"}


def test_faixas_de_medicao_dos_3_itens_novos_mais_tinta():
    from generate_checklist_seed_v7 import faixa_para
    piso = faixa_para("Profundidade do piso – dianteiro esq.")
    assert piso == dict(unidade_medicao="mm", limiar_critico_inferior=1.6)
    fluido = faixa_para("Teste do fluido de travões")
    assert fluido == dict(unidade_medicao="%", limiar_critico_superior=3)
    alternador = faixa_para("Alternador – tensão de carga")
    assert alternador == dict(unidade_medicao="V", faixa_min_ok=13.8, faixa_max_ok=14.4)
    tinta = faixa_para("Espessura de pintura – Capô")
    assert tinta == dict(unidade_medicao="µm", faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300)
    sem_faixa = faixa_para("Degradação da bateria – capacidade real vs. nominal (%)")
    assert sem_faixa == {}, "bateria BEV nao tem faixa numerica no documento, deve ficar medicao pura"


def test_qtd_pontos_medicao_extrai_da_observacao():
    rows = {r["nome"]: r for r in parse_markdown(SRC)}
    assert qtd_pontos_medicao(rows["Espessura de pintura – Capô"]) == 5
    assert qtd_pontos_medicao(rows["Espessura de pintura – Para-lamas diant. esq."]) == 3
    assert qtd_pontos_medicao(rows["Profundidade do piso – dianteiro esq."]) == 1
    assert qtd_pontos_medicao(rows["Alternador – tensão de carga"]) == 1


def test_grupo_13_inativo_e_unico_inativo():
    assert GRUPOS_INATIVOS == {13}


if __name__ == "__main__":
    import sys
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"OK   {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passou")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Rodar o self-check e confirmar 9/9 passando**

Run: `cd scripts && python3 test_generate_checklist_seed_v7.py`
Expected:
```
OK   test_parse_360_rows_13_grupos
OK   test_todos_rotulos_mapeados
OK   test_contagem_por_tipo_e_exclusao_351
OK   test_sim_nao_problema_so_cita_itens_reais
OK   test_conjuntos_usados_tem_opcoes_e_exige_foto
OK   test_grupo_replicacao_nunca_mistura_dianteiro_traseiro
OK   test_faixas_de_medicao_dos_3_itens_novos_mais_tinta
OK   test_qtd_pontos_medicao_extrai_da_observacao
OK   test_grupo_13_inativo_e_unico_inativo

9/9 passou
```
(o script lê `docs/data/checklist-inspecta-v7.md` com um path relativo — rodar a partir de `scripts/` funciona porque `Path("docs/data/...")` é relativo ao cwd; se preferir rodar da raiz do repo, ajuste `SRC`/`OUT` pra `Path(__file__).parent.parent / "docs/data/..."` antes de continuar — mas **não é necessário**, `cd scripts` resolve.)

Se qualquer teste falhar, é sinal de erro de transcrição no mapeamento (rótulo, `SIM_NAO_PROBLEMA`, `CONJUNTO_OPCOES`, `EXIGE_FOTO` ou `FAIXA_OVERRIDE_*`) — não ajuste os números esperados nos testes, corrija o mapeamento até bater.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_checklist_seed_v7.py scripts/test_generate_checklist_seed_v7.py
git commit -m "feat: script gerador do seed v7 (parsing, tipos, grupo_replicacao, faixas)"
```

---

### Task 2: Gerar a migration, aplicar no banco remoto, teste SQL

**Files:**
- Create: `supabase/migrations/00037_seed_checklist_v7.sql` (gerado pelo script da Task 1, não editar à mão)
- Create: `supabase/tests/00037_seed_checklist_v7.test.sql`

**Interfaces:**
- Consumes: `scripts/generate_checklist_seed_v7.py` (Task 1) — roda via `python3 scripts/generate_checklist_seed_v7.py` a partir da raiz do repo (ajusta `SRC`/`OUT`, que são relativos ao cwd, então rode da raiz desta vez, não de dentro de `scripts/`).
- Produces: seed real no banco remoto (13 grupos, 22 conjuntos de opções, 359 itens, 40 grupos de replicação) — consumido pela Peça 3 (redesign visual) depois.

- [ ] **Step 1: Gerar a migration a partir da raiz do repo**

Run: `python3 scripts/generate_checklist_seed_v7.py`
Expected: `escrito supabase/migrations/00037_seed_checklist_v7.sql (479 linhas)` (o número exato de linhas pode variar 1-2 linhas conforme formatação, não é um contrato rígido — o que importa são as contagens verificadas no Step 2).

- [ ] **Step 2: Inspecionar a migration gerada (sanity check manual antes de aplicar)**

Run:
```bash
grep -c "^  ((select id from public.checklist_group_templates" supabase/migrations/00037_seed_checklist_v7.sql
grep "checklist_group_templates where ordem = 13)" supabase/migrations/00037_seed_checklist_v7.sql | wc -l
grep "Farol dianteiro" supabase/migrations/00037_seed_checklist_v7.sql
```
Expected: primeira linha `359` (total de itens), segunda linha `34` (itens do grupo 13), terceira linha mostra os 2 faróis dianteiros com o mesmo `grupo_replicacao` (`farois-e-luzes-farol-dianteiro-estado`), e nenhuma linha citando "ver Secção 5" (item #351).

- [ ] **Step 3: Escrever o teste SQL**

```sql
begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 13 then
    raise exception 'FALHOU: esperava 13 grupos, achei %', v_count;
  end if;
  raise notice 'OK: 13 grupos seedados';
end $$;

do $$
declare v_ativo boolean;
declare v_inativos int;
begin
  select ativo into v_ativo from public.checklist_group_templates where ordem = 13;
  if v_ativo is not false then
    raise exception 'FALHOU: grupo 13 (Motoriz. Especial) deveria estar ativo=false (foi %)', v_ativo;
  end if;
  select count(*) into v_inativos from public.checklist_group_templates where ativo = false;
  if v_inativos <> 1 then
    raise exception 'FALHOU: so o grupo 13 deveria estar inativo (achei % grupos inativos)', v_inativos;
  end if;
  raise notice 'OK: apenas o grupo 13 esta inativo, os outros 12 estao ativos';
end $$;

do $$
declare v_count int;
declare v_grupo13 int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 359 then
    raise exception 'FALHOU: esperava 359 itens, achei % (item #351 e nota, nao deveria ter sido seedado)', v_count;
  end if;

  select count(*) into v_grupo13 from public.checklist_item_templates cit
    join public.checklist_group_templates cgt on cgt.id = cit.group_id
    where cgt.ordem = 13;
  if v_grupo13 <> 34 then
    raise exception 'FALHOU: grupo 13 deveria ter 34 itens (35 linhas - item #351 excluido), achei %', v_grupo13;
  end if;
  raise notice 'OK: 359 itens no total, grupo 13 com 34 (item #351 excluido)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao' and (qtd_pontos_medicao is null or unidade_medicao is null);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens medicao sem qtd_pontos_medicao/unidade_medicao', v_count;
  end if;
  raise notice 'OK: todo item medicao tem qtd_pontos_medicao e unidade_medicao';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates cit
    where cit.tipo = 'escolha'
      and (cit.conjunto_opcao_id is null
        or (select count(*) from public.opcoes o where o.conjunto_id = cit.conjunto_opcao_id) < 2);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens escolha sem conjunto_opcao_id valido (>=2 opcoes)', v_count;
  end if;
  raise notice 'OK: todo item escolha aponta pra um conjunto com >=2 opcoes';
end $$;

do $$
declare v_conjuntos int;
declare v_problema_sim_foto int;
declare v_presenca_sim_foto int;
begin
  select count(*) into v_conjuntos from public.conjuntos_opcao
    where nome in ('sim_nao_problema', 'sim_nao_problema_na', 'sim_nao_presenca', 'sim_nao_presenca_na');
  if v_conjuntos <> 4 then
    raise exception 'FALHOU: esperava os 4 conjuntos sim_nao_*, achei %', v_conjuntos;
  end if;

  select count(*) into v_problema_sim_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome in ('sim_nao_problema', 'sim_nao_problema_na') and o.label = 'Sim' and o.exige_foto = true;
  if v_problema_sim_foto <> 2 then
    raise exception 'FALHOU: opcao Sim de sim_nao_problema(_na) deveria ter exige_foto=true (achei % com esse estado)', v_problema_sim_foto;
  end if;

  select count(*) into v_presenca_sim_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome in ('sim_nao_presenca', 'sim_nao_presenca_na') and o.label = 'Sim' and o.exige_foto = true;
  if v_presenca_sim_foto <> 0 then
    raise exception 'FALHOU: opcao Sim de sim_nao_presenca(_na) NAO deveria exigir foto (achei % marcadas true)', v_presenca_sim_foto;
  end if;
  raise notice 'OK: 4 conjuntos sim_nao_*, exige_foto correto em cada polaridade';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.conjuntos_opcao where nome = 'estado_4';
  if v_count <> 0 then
    raise exception 'FALHOU: conjunto orfao estado_4 (backfill da Peca 1a) ainda existe, deveria ter sido limpo';
  end if;
  raise notice 'OK: conjunto orfao estado_4 foi removido';
end $$;

do $$
declare v_piso record;
declare v_fluido record;
declare v_alternador record;
begin
  select limiar_critico_inferior, faixa_min_ok, faixa_max_ok, limiar_critico_superior into v_piso
    from public.checklist_item_templates where nome = 'Profundidade do piso – dianteiro esq.';
  if v_piso.limiar_critico_inferior is distinct from 1.6 then
    raise exception 'FALHOU: profundidade do piso deveria ter limiar_critico_inferior=1.6, achei %', v_piso.limiar_critico_inferior;
  end if;

  select limiar_critico_superior into v_fluido
    from public.checklist_item_templates where nome = 'Teste do fluido de travões';
  if v_fluido.limiar_critico_superior is distinct from 3 then
    raise exception 'FALHOU: fluido de travoes deveria ter limiar_critico_superior=3, achei %', v_fluido.limiar_critico_superior;
  end if;

  select faixa_min_ok, faixa_max_ok into v_alternador
    from public.checklist_item_templates where nome = 'Alternador – tensão de carga';
  if v_alternador.faixa_min_ok is distinct from 13.8 or v_alternador.faixa_max_ok is distinct from 14.4 then
    raise exception 'FALHOU: alternador deveria ter faixa 13.8-14.4V, achei %-%', v_alternador.faixa_min_ok, v_alternador.faixa_max_ok;
  end if;
  raise notice 'OK: faixas de piso/fluido de travoes/alternador corretas';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where nome ilike '%ver Secção 5%' or nome ilike '%Itens motor térmico aplicam-se%';
  if v_count <> 0 then
    raise exception 'FALHOU: item #351 (nota, nao e item de verificacao) foi seedado por engano';
  end if;
  raise notice 'OK: item #351 nao foi seedado';
end $$;

do $$
declare v_grupos int;
begin
  select count(*) into v_grupos from (
    select grupo_replicacao from public.checklist_item_templates
      where grupo_replicacao is not null
      group by grupo_replicacao
      having count(*) <> 2
  ) sub;
  if v_grupos <> 0 then
    raise exception 'FALHOU: % grupo(s) de replicacao nao tem exatamente 2 membros', v_grupos;
  end if;
  raise notice 'OK: todo grupo_replicacao no seed tem exatamente 2 membros';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao' and grupo_replicacao is not null;
  if v_count <> 0 then
    raise exception 'FALHOU: % itens de medicao tem grupo_replicacao (deveria ser bloqueado pela constraint)', v_count;
  end if;
  raise notice 'OK: nenhum item de medicao tem grupo_replicacao';
end $$;

rollback;
```

- [ ] **Step 4: Conectar ao banco e aplicar a migration**

Run:
```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source .env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```
Expected: a CLI lista `00037_seed_checklist_v7.sql` como pendente e aplica sem erro. Se `.env.local` não existir no worktree atual, recriar (ver memória `reference_env_local_inspecta`) antes de continuar — **este passo apaga e reescreve `checklist_group_templates`/`checklist_item_templates` no banco remoto real; confirmar com o usuário antes de rodar se houver qualquer dúvida sobre dados em produção** (nesta data só há dados de teste, confirmado no design §1, mas é uma ação destrutiva e deve ser tratada como tal).

- [ ] **Step 5: Rodar o teste SQL**

Run: `psql "$DATABASE_URL" -f supabase/tests/00037_seed_checklist_v7.test.sql`
Expected: 11 linhas `NOTICE: OK: ...`, sem nenhuma `ERROR`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00037_seed_checklist_v7.sql supabase/tests/00037_seed_checklist_v7.test.sql
git commit -m "feat: re-seed do checklist real v7 (359 itens/13 grupos)"
```

---

### Task 3: Remover artefatos obsoletos e regressão final

**Files:**
- Delete: `scripts/generate_checklist_seed.py`
- Delete: `scripts/generate_grupo_replicacao_seed.py`
- Delete: `docs/data/checklist-inspecta-v5.csv`

**Interfaces:**
- Consumes: nada (task de limpeza + verificação, sem código novo).
- Produces: repo limpo, pronto pra Peça 3 (redesign visual) partir do seed novo.

- [ ] **Step 1: Confirmar que nada mais referencia os artefatos antigos**

Run: `grep -rln "generate_checklist_seed\.py\|generate_grupo_replicacao_seed\.py\|checklist-inspecta-v5\.csv" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.py" . | grep -v node_modules | grep -v "/.git/"`
Expected: só arquivos de plano/spec **já commitados no passado** (ex. `docs/superpowers/plans/2026-07-11-checklist-seed-300-itens.md`, `2026-07-21-aplicar-aos-demais.md`) — são registro histórico, não precisam mudar. Nenhum arquivo de código ativo (`scripts/`, `app/`, `lib/`) deve depender deles além dos 3 arquivos sendo removidos aqui.

- [ ] **Step 2: Deletar os artefatos obsoletos**

```bash
git rm scripts/generate_checklist_seed.py scripts/generate_grupo_replicacao_seed.py docs/data/checklist-inspecta-v5.csv
```

- [ ] **Step 3: Rodar a suíte de testes JS/TS completa (regressão)**

Run: `npm test`
Expected: todos os testes passando, mesma contagem de antes (o app não referencia nomes de item específicos — confirmado por busca antes do design, ver spec §1 — então trocar o conteúdo do checklist não deveria quebrar nada em `app/`/`lib/`).

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove artefatos de seed obsoletos (superados pelo checklist v7)"
```

---

## Self-Review

**Spec coverage:** design §2 (fonte/script) → Task 1. §3 (catálogo de conjuntos + correção sim/não) → Task 1 (`CONJUNTO_OPCOES`/`EXIGE_FOTO`/`SIM_NAO_PROBLEMA`). §4 (faixas de medição) → Task 1 (`FAIXA_OVERRIDE_*`) + Task 2 Step 3 (teste). §5 (grupo_replicacao) → Task 1 (`base_name_sans_lr`/`buckets`) + Task 1 Step 2 teste + Task 2 Step 3 teste. §6 (grupo 13 inativo + limpeza) → Task 1 (`GRUPOS_INATIVOS`) + Task 3. §7 (testes) → Task 2 Step 3 (todas as 8 asserções do design cobertas no `.test.sql`, mais 2 extras descobertas durante a implementação: grupos sempre com exatamente 2 membros, nenhum item de medição com `grupo_replicacao`).

**Placeholder scan:** nenhum "TBD"/"similar to Task N" — todo código é completo e foi de fato executado e verificado (9/9 no self-check Python) antes de entrar neste plano.

**Type consistency:** `resolve_tipo` (Task 1) é a única função que decide `tipo`/`conjunto` — usada identicamente em `build()` e nos testes, sem duplicar a lógica de polaridade Sim/Não em dois lugares.
