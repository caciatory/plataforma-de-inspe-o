#!/usr/bin/env python3
"""Gera supabase/migrations/00016_seed_checklist_groups_and_items.sql
a partir de docs/data/checklist-inspecta-v5.csv. Reexecute se o CSV mudar
— nao edite o SQL gerado a mao."""
import csv
import re
import sys
from pathlib import Path

CSV_PATH = Path("docs/data/checklist-inspecta-v5.csv")
OUT_PATH = Path("supabase/migrations/00016_seed_checklist_groups_and_items.sql")
CATEGORIA_RE = re.compile(r"^(\d+)\.\s*(.+)$")
GRUPOS_INATIVOS = {12}  # Motoriz. Especial (F2) — Fase 9, fora do v1.0 (roadmap §5)


def sql_str(value: str) -> str:
    value = value.strip()
    if not value:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_int(value: str) -> str:
    value = value.strip()
    return value if value else "null"


def parse_categoria(categoria: str) -> tuple[int, str]:
    m = CATEGORIA_RE.match(categoria.strip())
    if not m:
        sys.exit(f"categoria fora do padrao 'N. Nome': {categoria!r}")
    return int(m.group(1)), m.group(2).strip()


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    groups: dict[int, str] = {}
    for r in rows:
        ordem, nome = parse_categoria(r["categoria"])
        groups.setdefault(ordem, nome)

    assert len(groups) == 12, f"esperava 12 grupos, achei {len(groups)}"
    assert len(rows) == 320, f"esperava 320 itens, achei {len(rows)}"

    lines = [
        "-- supabase/migrations/00016_seed_checklist_groups_and_items.sql",
        "-- Gerado por scripts/generate_checklist_seed.py a partir de",
        "-- docs/data/checklist-inspecta-v5.csv. Nao editar a mao:",
        "-- reexecute o script se o CSV mudar.",
        "",
        "insert into public.checklist_group_templates (ordem, nome, ativo) values",
    ]
    group_values = []
    for ordem in sorted(groups):
        nome = groups[ordem]
        ativo = "false" if ordem in GRUPOS_INATIVOS else "true"
        group_values.append(f"  ({ordem}, {sql_str(nome)}, {ativo})")
    lines.append(",\n".join(group_values) + ";")
    lines.append("")

    lines.append(
        "insert into public.checklist_item_templates "
        "(group_id, subcategoria, nome, tipo, qtd_pontos_medicao, aplica_stand, observacoes) values"
    )
    item_values = []
    for r in rows:
        ordem, _ = parse_categoria(r["categoria"])
        subcategoria = sql_str(r["subcategoria"])
        nome = sql_str(r["item"])
        tipo = sql_str(r["tipo"])
        qtd = sql_int(r["qtd_pontos_medicao"])
        aplica_stand = "true" if r["aplica_stand"].strip().lower() == "true" else "false"
        observacoes = sql_str(r["observacoes"])
        item_values.append(
            f"  ((select id from public.checklist_group_templates where ordem = {ordem}), "
            f"{subcategoria}, {nome}, {tipo}, {qtd}, {aplica_stand}, {observacoes})"
        )
    lines.append(",\n".join(item_values) + ";")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(groups)} grupos, {len(rows)} itens -> {OUT_PATH}")


if __name__ == "__main__":
    main()
