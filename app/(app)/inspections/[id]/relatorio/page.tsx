// app/(app)/inspections/[id]/relatorio/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDataInspecao } from "@/lib/report/build-relatorio";
import { RelatorioConteudo, type RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const supabase = await createClient();

  // Select amplo (`*`) na tabela base por necessidade: sem um Database type
  // gerado, um column-list explicito na tabela base faz o postgrest-js
  // inferir os embeds vehicle_data/users como array em vez de objeto unico
  // (~24 erros TS2339) -- mesmo padrao ja usado em
  // app/(app)/inspections/[id]/page.tsx:40. RF-50 continua garantido porque
  // client_data e uma tabela fisicamente separada, nunca embutida aqui.
  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, vehicle_data(*), users(nome, credencial_interna)")
    .eq("id", id)
    .single();

  if (!inspection || inspection.status !== "aprovada") notFound();

  const [
    { data: score },
    { data: fotosCapa },
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
    { data: equipamentos, error: equipamentosError },
  ] = await Promise.all([
    supabase.from("inspection_score").select("nota_geral, classificacao").eq("inspection_id", id).maybeSingle(),
    supabase
      .from("photos")
      .select("id, url, ordem")
      .eq("inspection_id", id)
      .eq("contexto", "capa")
      .order("ordem")
      .order("criado_em"),
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase
      .from("checklist_item_templates")
      .select("id, group_id, subcategoria, nome, tipo, conjunto_opcao_id"),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
    supabase
      .from("equipamento_inspecao")
      .select("id, categoria, nome_equipamento, condicao, comentario, ordem")
      .eq("inspection_id", id)
      .order("ordem"),
  ]);

  // Falha silenciosa aqui renderizaria um certificado com "0 pontos
  // verificados" -- pior que uma pagina de erro, porque parece valido.
  // score/fotosCapa ficam de fora de proposito: ja degradam bem (sem nota ->
  // UI de fallback; sem foto de capa -> hero sem carrossel).
  if (groupsError || itemsError || responsesError || equipamentosError) {
    console.error("relatorio checklist fetch failed", {
      groupsError,
      itemsError,
      responsesError,
      equipamentosError,
    });
    throw new Error("Não foi possível carregar os dados do relatório.");
  }

  const conjuntoIds = Array.from(
    new Set((items ?? []).map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const responseIds = (responses ?? []).map((r) => r.id);
  const equipamentoIds = (equipamentos ?? []).map((e) => e.id);

  const [
    { data: opcoes, error: opcoesError },
    { data: medicaoResultados, error: medicaoResultadosError },
    { data: photos, error: photosError },
    { data: equipamentoFotos, error: equipamentoFotosError },
  ] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase.from("opcoes").select("id, conjunto_id, label, ordem, exige_foto").in("conjunto_id", conjuntoIds)
      : Promise.resolve({ data: [], error: null }),
    responseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", responseIds)
      : Promise.resolve({ data: [], error: null }),
    responseIds.length > 0
      ? supabase
          .from("photos")
          .select("id, url, item_response_id")
          .eq("contexto", "item")
          .in("item_response_id", responseIds)
      : Promise.resolve({ data: [], error: null }),
    equipamentoIds.length > 0
      ? supabase
          .from("equipamento_fotos")
          .select("id, url, equipamento_inspecao_id")
          .in("equipamento_inspecao_id", equipamentoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (opcoesError || medicaoResultadosError || photosError || equipamentoFotosError) {
    console.error("relatorio checklist detail fetch failed", {
      opcoesError,
      medicaoResultadosError,
      photosError,
      equipamentoFotosError,
    });
    throw new Error("Não foi possível carregar os dados do relatório.");
  }

  const dados: RelatorioDados = {
    vehicle: inspection.vehicle_data,
    score: score ?? null,
    fotosCapa: fotosCapa ?? [],
    codigoCertificado: inspection.codigo_certificado,
    certificadoEmitidoEm: inspection.certificado_emitido_em,
    parceiroNome: inspection.parceiro_nome,
    parceiroLogoUrl: inspection.parceiro_logo_url,
    parceiroTelefone: inspection.parceiro_telefone,
    dataInspecao: formatDataInspecao(inspection.data_finalizacao, inspection.data_abertura),
    tecnicoNome: inspection.users?.nome ?? null,
    tecnicoCredencial: inspection.users?.credencial_interna ?? null,
    groups: groups ?? [],
    items: items ?? [],
    responses: responses ?? [],
    opcoes: opcoes ?? [],
    medicaoResultados: medicaoResultados ?? [],
    photos: photos ?? [],
    equipamentos: equipamentos ?? [],
    equipamentoFotos: equipamentoFotos ?? [],
  };

  return <RelatorioConteudo dados={dados} />;
}
