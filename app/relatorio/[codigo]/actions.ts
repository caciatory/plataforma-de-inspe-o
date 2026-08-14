"use server";

import { createClient } from "@/lib/supabase/server";
import { formatDataInspecao } from "@/lib/report/build-relatorio";
import type { RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

export type OrigemAcesso = "whatsapp" | "stand" | "indicacao" | "redes_sociais" | "outro";

type RpcRelatorio = {
  inspection_id: string;
  inspection: {
    codigo_certificado: string | null;
    certificado_emitido_em: string | null;
    parceiro_nome: string | null;
    parceiro_logo_url: string | null;
    parceiro_telefone: string | null;
    data_finalizacao: string | null;
    data_abertura: string;
    tecnico_nome: string | null;
    tecnico_credencial: string | null;
  };
  vehicle: RelatorioDados["vehicle"];
  score: RelatorioDados["score"];
  fotos_capa: RelatorioDados["fotosCapa"];
  groups: RelatorioDados["groups"];
  items: RelatorioDados["items"];
  responses: RelatorioDados["responses"];
  opcoes: RelatorioDados["opcoes"];
  medicao_resultados: RelatorioDados["medicaoResultados"];
  photos: RelatorioDados["photos"];
  equipamentos: RelatorioDados["equipamentos"];
  equipamento_fotos: RelatorioDados["equipamentoFotos"];
};

function mapRpcToRelatorioDados(rpc: RpcRelatorio): RelatorioDados {
  return {
    vehicle: rpc.vehicle,
    score: rpc.score,
    fotosCapa: rpc.fotos_capa,
    codigoCertificado: rpc.inspection.codigo_certificado,
    certificadoEmitidoEm: rpc.inspection.certificado_emitido_em,
    parceiroNome: rpc.inspection.parceiro_nome,
    parceiroLogoUrl: rpc.inspection.parceiro_logo_url,
    parceiroTelefone: rpc.inspection.parceiro_telefone,
    dataInspecao: formatDataInspecao(rpc.inspection.data_finalizacao, rpc.inspection.data_abertura),
    tecnicoNome: rpc.inspection.tecnico_nome,
    tecnicoCredencial: rpc.inspection.tecnico_credencial,
    groups: rpc.groups,
    items: rpc.items,
    responses: rpc.responses,
    opcoes: rpc.opcoes,
    medicaoResultados: rpc.medicao_resultados,
    photos: rpc.photos,
    equipamentos: rpc.equipamentos,
    equipamentoFotos: rpc.equipamento_fotos,
  };
}

export async function registrarAcessoAction(
  codigo: string,
  origem: OrigemAcesso
): Promise<{ status: "ok"; dados: RelatorioDados } | { status: "erro" }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_relatorio_publico", { p_codigo: codigo });
  if (error || !data) return { status: "erro" };

  const rpc = data as unknown as RpcRelatorio;

  // Best-effort: uma falha aqui nao deve impedir o cliente de ver o
  // relatorio que ele veio buscar -- mesmo criterio ja usado pra
  // score/fotosCapa na rota interna (Task 1), so registrado no log do
  // servidor.
  const { error: logError } = await supabase
    .from("client_access_logs")
    .insert({ inspection_id: rpc.inspection_id, origem });
  if (logError) {
    console.error("client_access_logs insert failed", logError);
  }

  return { status: "ok", dados: mapRpcToRelatorioDados(rpc) };
}
