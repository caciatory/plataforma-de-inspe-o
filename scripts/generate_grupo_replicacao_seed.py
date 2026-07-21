#!/usr/bin/env python3
"""Popula/atualiza a coluna grupo_replicacao em
docs/data/checklist-inspecta-v5.csv a partir do CLUSTER_MAP curado abaixo,
e gera a migration de UPDATE correspondente.

Para mudar um cluster no futuro (juntar, separar, criar, remover item):
edite CLUSTER_MAP abaixo (ou a celula grupo_replicacao do CSV direto, se
preferir editar por planilha) e reexecute este script -- ele sempre
regrava o CSV inteiro e gera uma migration NOVA (nunca edite uma
migration ja aplicada)."""
import csv
import re
import sys
from pathlib import Path

CSV_PATH = Path("docs/data/checklist-inspecta-v5.csv")
MIGRATION_PATH = Path("supabase/migrations/00025_seed_grupo_replicacao.sql")
CATEGORIA_RE = re.compile(r"^(\d+)\.\s*(.+)$")

# (subcategoria, item) -> slug do cluster. So itens tipo='padrao' -- nenhum
# item de medicao entra aqui (constraint da migration 00024 bloquearia).
CLUSTER_MAP: dict[tuple[str, str], str] = {
    ("Carroçaria", "Lateral esquerda - estado geral"): "carrocaria-lateral-estado",
    ("Carroçaria", "Lateral direita - estado geral"): "carrocaria-lateral-estado",
    ("Carroçaria", "Para-lamas dianteiro esquerdo - estado"): "carrocaria-paralama-estado",
    ("Carroçaria", "Para-lamas dianteiro direito - estado"): "carrocaria-paralama-estado",
    ("Para-choques", "Para-choques dianteiro - estado geral"): "parachoques-estado-geral",
    ("Para-choques", "Para-choques traseiro - estado geral"): "parachoques-estado-geral",
    ("Para-choques", "Para-choques dianteiro - alinhamento"): "parachoques-alinhamento",
    ("Para-choques", "Para-choques traseiro - alinhamento"): "parachoques-alinhamento",
    ("Para-choques", "Para-choques dianteiro - fixações"): "parachoques-fixacoes",
    ("Para-choques", "Para-choques traseiro - fixações"): "parachoques-fixacoes",
    ("Portas", "Porta dianteira esquerda - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta dianteira direita - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta traseira esquerda - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta traseira direita - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta dianteira esquerda - fechadura"): "portas-fechadura",
    ("Portas", "Porta dianteira direita - fechadura"): "portas-fechadura",
    ("Portas", "Porta traseira esquerda - fechadura"): "portas-fechadura",
    ("Portas", "Porta traseira direita - fechadura"): "portas-fechadura",
    ("Faróis e Luzes", "Farol dianteiro esquerdo - estado"): "farois-farol-dianteiro",
    ("Faróis e Luzes", "Farol dianteiro direito - estado"): "farois-farol-dianteiro",
    ("Faróis e Luzes", "Farol traseiro esquerdo - estado"): "farois-farol-traseiro",
    ("Faróis e Luzes", "Farol traseiro direito - estado"): "farois-farol-traseiro",
    ("Faróis e Luzes", "Luz média (cruzamento) esquerda"): "farois-luz-media",
    ("Faróis e Luzes", "Luz média (cruzamento) direita"): "farois-luz-media",
    ("Faróis e Luzes", "Luz máxima (estrada) esquerda"): "farois-luz-maxima",
    ("Faróis e Luzes", "Luz máxima (estrada) direita"): "farois-luz-maxima",
    ("Faróis e Luzes", "Luz de travagem esquerda"): "farois-luz-travagem",
    ("Faróis e Luzes", "Luz de travagem direita"): "farois-luz-travagem",
    ("Faróis e Luzes", "Pisca dianteiro esquerdo"): "farois-pisca-dianteiro",
    ("Faróis e Luzes", "Pisca dianteiro direito"): "farois-pisca-dianteiro",
    ("Faróis e Luzes", "Pisca traseiro esquerdo"): "farois-pisca-traseiro",
    ("Faróis e Luzes", "Pisca traseiro direito"): "farois-pisca-traseiro",
    ("Faróis e Luzes", "Luz de nevoeiro dianteira esquerda"): "farois-nevoeiro-dianteiro",
    ("Faróis e Luzes", "Luz de nevoeiro dianteira direita"): "farois-nevoeiro-dianteiro",
    ("Faróis e Luzes", "Luz de nevoeiro traseira esquerda"): "farois-nevoeiro-traseiro",
    ("Faróis e Luzes", "Luz de nevoeiro traseira direita"): "farois-nevoeiro-traseiro",
    ("Faróis e Luzes", "Luz de marcha-atrás esquerda"): "farois-marcha-atras",
    ("Faróis e Luzes", "Luz de marcha-atrás direita"): "farois-marcha-atras",
    ("Faróis e Luzes", "Luzes de condução diurna (DRL) esquerda"): "farois-drl",
    ("Faróis e Luzes", "Luzes de condução diurna (DRL) direita"): "farois-drl",
    ("Vidros", "Vidro lateral dianteiro esquerdo - estado"): "vidros-lateral-dianteiro",
    ("Vidros", "Vidro lateral dianteiro direito - estado"): "vidros-lateral-dianteiro",
    ("Vidros", "Vidro lateral traseiro esquerdo - estado"): "vidros-lateral-traseiro",
    ("Vidros", "Vidro lateral traseiro direito - estado"): "vidros-lateral-traseiro",
    ("Vidros", "Elevador vidro dianteiro esquerdo"): "vidros-elevador-dianteiro",
    ("Vidros", "Elevador vidro dianteiro direito"): "vidros-elevador-dianteiro",
    ("Vidros", "Elevador vidro traseiro esquerdo"): "vidros-elevador-traseiro",
    ("Vidros", "Elevador vidro traseiro direito"): "vidros-elevador-traseiro",
    ("Espelhos", "Retrovisor esquerdo - estado"): "espelhos-estado",
    ("Espelhos", "Retrovisor direito - estado"): "espelhos-estado",
    ("Espelhos", "Retrovisor esquerdo - ajuste elétrico"): "espelhos-ajuste-eletrico",
    ("Espelhos", "Retrovisor direito - ajuste elétrico"): "espelhos-ajuste-eletrico",
    ("Espelhos", "Retrovisor esquerdo - aquecimento"): "espelhos-aquecimento",
    ("Espelhos", "Retrovisor direito - aquecimento"): "espelhos-aquecimento",
    ("Bancos", "Banco do condutor - estado"): "bancos-estado",
    ("Bancos", "Banco passageiro dianteiro - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro esquerdo - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro central - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro direito - estado"): "bancos-estado",
    ("Bancos", "Cinto de segurança dianteiro condutor"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança dianteiro passageiro"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro esquerdo"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro central"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro direito"): "bancos-cinto-seguranca",
    ("Pneus", "Pneu dianteiro esquerdo - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu dianteiro direito - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu traseiro esquerdo - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu traseiro direito - estado geral"): "pneus-estado-geral",
    ("Pneus", "Profundidade do piso - dianteiro esq."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - dianteiro dir."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - traseiro esq."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - traseiro dir."): "pneus-profundidade-piso",
    ("Pneus", "Desgaste irregular - dianteiro esq."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - dianteiro dir."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - traseiro esq."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - traseiro dir."): "pneus-desgaste-irregular",
    ("Pneus", "Cortes/bolhas - dianteiro esq."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - dianteiro dir."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - traseiro esq."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - traseiro dir."): "pneus-cortes-bolhas",
    ("Jantes", "Jante dianteira esquerda - estado"): "jantes-estado",
    ("Jantes", "Jante dianteira direita - estado"): "jantes-estado",
    ("Jantes", "Jante traseira esquerda - estado"): "jantes-estado",
    ("Jantes", "Jante traseira direita - estado"): "jantes-estado",
    ("Travões", "Pastilhas dianteiras - desgaste"): "travoes-pastilhas",
    ("Travões", "Pastilhas traseiras - desgaste"): "travoes-pastilhas",
    ("Travões", "Disco dianteiro esquerdo - estado"): "travoes-disco-estado",
    ("Travões", "Disco dianteiro direito - estado"): "travoes-disco-estado",
    ("Travões", "Disco traseiro esquerdo - estado"): "travoes-disco-estado",
    ("Travões", "Disco traseiro direito - estado"): "travoes-disco-estado",
    ("Suspensão", "Amortecedor dianteiro esquerdo - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor dianteiro direito - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor traseiro esquerdo - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor traseiro direito - estado"): "suspensao-amortecedor",
    ("Suspensão", "Mola dianteira esquerda - estado"): "suspensao-mola",
    ("Suspensão", "Mola dianteira direita - estado"): "suspensao-mola",
    ("Suspensão", "Mola traseira esquerda - estado"): "suspensao-mola",
    ("Suspensão", "Mola traseira direita - estado"): "suspensao-mola",
    ("Segurança", "Airbags frontais - luz painel OK"): "seguranca-airbag-luz-painel",
    ("Segurança", "Airbags laterais - luz painel OK"): "seguranca-airbag-luz-painel",
    ("Segurança", "Airbags de cortina - luz painel OK"): "seguranca-airbag-luz-painel",
}


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_categoria_ordem(categoria: str) -> int:
    m = CATEGORIA_RE.match(categoria.strip())
    if not m:
        sys.exit(f"categoria fora do padrao 'N. Nome': {categoria!r}")
    return int(m.group(1))


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    assert len(rows) == 320, f"esperava 320 itens no CSV, achei {len(rows)}"

    if "grupo_replicacao" not in fieldnames:
        fieldnames.append("grupo_replicacao")

    updates = []
    matched_keys = set()
    for r in rows:
        key = (r["subcategoria"].strip(), r["item"].strip())
        slug = CLUSTER_MAP.get(key, "")
        r["grupo_replicacao"] = slug
        if slug:
            matched_keys.add(key)
            ordem = parse_categoria_ordem(r["categoria"])
            updates.append(
                "update public.checklist_item_templates set grupo_replicacao = "
                f"{sql_str(slug)} where group_id = (select id from public.checklist_group_templates "
                f"where ordem = {ordem}) and subcategoria = {sql_str(r['subcategoria'])} "
                f"and nome = {sql_str(r['item'])};"
            )

    missing = set(CLUSTER_MAP) - matched_keys
    assert not missing, f"CLUSTER_MAP tem chave(s) que nao bateram com nenhuma linha do CSV: {missing}"
    assert len(updates) == 101, f"esperava 101 UPDATEs, gerei {len(updates)}"

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    lines = [
        "-- supabase/migrations/00025_seed_grupo_replicacao.sql",
        "-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md",
        "-- secao 2. Gerado por scripts/generate_grupo_replicacao_seed.py a partir",
        "-- de docs/data/checklist-inspecta-v5.csv (coluna grupo_replicacao). Nao",
        "-- editar este arquivo a mao -- reexecute o script se o CSV mudar; isso",
        "-- gera uma migration NOVA, nunca edite uma ja aplicada.",
        "",
    ]
    lines.extend(updates)
    lines.append("")

    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(updates)} itens marcados em {len(set(CLUSTER_MAP.values()))} clusters -> {MIGRATION_PATH}, CSV atualizado")


if __name__ == "__main__":
    main()
