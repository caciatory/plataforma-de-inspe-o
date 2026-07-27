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
    assert piso == dict(limiar_critico_inferior=1.6)
    fluido = faixa_para("Teste do fluido de travões")
    assert fluido == dict(limiar_critico_superior=3)
    alternador = faixa_para("Alternador – tensão de carga")
    assert alternador == dict(faixa_min_ok=13.8, faixa_max_ok=14.4)
    tinta = faixa_para("Espessura de pintura – Capô")
    assert tinta == dict(faixa_min_ok=70, faixa_max_ok=160, limiar_critico_superior=300)
    sem_faixa = faixa_para("Degradação da bateria – capacidade real vs. nominal (%)")
    assert sem_faixa == {}, (
        "bateria BEV nao tem faixa/limiar no documento (medicao pura) e nao "
        "precisa de entrada em FAIXA_OVERRIDE_POR_NOME -- a unidade vem de TIPO_MAP"
    )


def test_todo_item_medicao_tem_unidade_medicao():
    # Guarda estrutural: toda entrada 'medicao' em TIPO_MAP tem que ter uma
    # unidade nao-vazia, senao um item de medicao acaba com unidade_medicao
    # nulo (a unidade agora vem sempre de TIPO_MAP, nunca de faixa_para()).
    rows = [r for r in parse_markdown(SRC) if r["num"] != ITEM_NOTA_EXCLUIDA]
    sem_unidade = [
        r["nome"] for r in rows
        if resolve_tipo(r)[0] == "medicao" and not resolve_tipo(r)[1]
    ]
    assert not sem_unidade, f"itens de medicao sem unidade_medicao: {sem_unidade}"


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
