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

ITEM_NOTA_EXCLUIDA = 310  # "Itens motor termico aplicam-se - ver Seccao 5": nota, nao e' item de verificacao

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
    "Tubagens de admissão – estado e fugas",
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

# Item (por nome exato) -> overrides de faixa de medicao (so' os limiares
# numericos -- a unidade vem sempre de TIPO_MAP via resolve_tipo(), nunca
# daqui, pra nao ter duas fontes de verdade pra unidade). Tinta reusa os
# valores ja em producao (Peca 1a); piso/fluido de travoes/alternador vem
# dos numeros explicitos no proprio documento v7 (ver design §4).
FAIXA_OVERRIDE_POR_PREFIXO = {
    # Estes numeros (70/160/300) sao os ja em producao (de uma migracao
    # anterior), NAO os do item #33 do documento fonte ("Ref: 80-180µm /
    # >200µm repintura / >400µm rechape"). Intencional -- nao "corrigir"
    # pra bater com o documento sem uma decisao em separado, ja que isso
    # mudaria a pontuacao de inspecoes ja ao vivo.
    "Espessura de pintura": dict(faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300),
    "Profundidade do piso": dict(limiar_critico_inferior=1.6),
}
FAIXA_OVERRIDE_POR_NOME = {
    "Teste do fluido de travões": dict(limiar_critico_superior=3),
    "Alternador – tensão de carga": dict(faixa_min_ok=13.8, faixa_max_ok=14.4),
    # Sem faixa numerica no documento (so' "Scanner BEV") -- medicao pura;
    # nao precisa de entrada aqui, a unidade ja vem de TIPO_MAP.
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
        "-- Limpa o seed antigo (grupos/itens) e os conjuntos de opcoes antes",
        "-- de reinserir. checklist_item_responses e dado de resposta de",
        "-- teste (sem inspecoes reais ainda) que referencia",
        "-- checklist_item_templates sem ON DELETE proprio -- bloqueia o",
        "-- delete de templates abaixo se nao for limpo primeiro; a limpeza",
        "-- cascateia pra medicoes/photos via o ON DELETE CASCADE que ja",
        "-- existe a partir de checklist_item_responses. O delete de",
        "-- conjuntos_opcao sem filtro (idempotencia do reseed: a 1a",
        "-- aplicacao deste script nao pegou esse caso pq a tabela ainda nao",
        "-- tinha os conjuntos do v7) e seguro pq checklist_item_templates",
        "-- -- unica outra tabela que referencia conjuntos_opcao -- ja foi",
        "-- limpa na linha acima, e opcoes.conjunto_id tem ON DELETE CASCADE.",
        "delete from public.checklist_item_responses;",
        "delete from public.checklist_item_templates;",
        "delete from public.checklist_group_templates;",
        "delete from public.conjuntos_opcao;",
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
            unidade = sql_str(extra)
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
