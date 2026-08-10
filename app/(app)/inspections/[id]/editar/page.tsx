import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { tipoClienteValues } from "@/lib/inspection/schema";
import { NewInspectionForm, type InspectionFormInitialData } from "../../new/new-inspection-form";
import type { EquipamentoInitial } from "../../new/equipamento-categoria";

export default async function EditarInspecaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase
    .from("inspections")
    .select("status, objetivo, vehicle_data(*), client_data(*)")
    .eq("id", id)
    .single();

  if (!inspection) notFound();

  const currentUser = await getCurrentUser();
  if (!currentUser || !isInspectionEditable(inspection.status as InspectionStatus, currentUser.role)) {
    redirect(`/inspections/${id}`);
  }

  const vd = inspection.vehicle_data as unknown as Record<string, unknown> | null;
  const cd = inspection.client_data as unknown as Record<string, unknown> | null;

  const tipoClienteValue = cd?.tipo as string | null | undefined;
  const initialData: InspectionFormInitialData = {
    tipoCliente: tipoClienteValue && tipoClienteValues.includes(tipoClienteValue as never) ? (tipoClienteValue as typeof tipoClienteValues[number]) : undefined,
    objetivo: inspection.objetivo,
    nomeSolicitante: (cd?.nome_solicitante as string | null | undefined) ?? "",
    contacto: (cd?.contacto as string | null | undefined) ?? "",
    email: (cd?.email as string | null | undefined) ?? "",
    responsavelPresente: (cd?.responsavel_presente as string | null | undefined) ?? "",
    matricula: (vd?.matricula as string | null | undefined) ?? "",
    marca: (vd?.marca as string | null | undefined) ?? "",
    modelo: (vd?.modelo as string | null | undefined) ?? "",
    quilometragem: vd?.quilometragem != null ? String(vd.quilometragem) : "",
    versaoTrim: (vd?.versao_trim as string | null | undefined) ?? "",
    anoFabrico: vd?.ano_fabrico != null ? String(vd.ano_fabrico) : "",
    anoModelo: vd?.ano_modelo != null ? String(vd.ano_modelo) : "",
    cor: (vd?.cor as string | null | undefined) ?? "",
    vin: (vd?.vin as string | null | undefined) ?? "",
    numeroMotor: (vd?.numero_motor as string | null | undefined) ?? "",
    numeroPortas: vd?.numero_portas != null ? String(vd.numero_portas) : "",
    combustivel: (vd?.combustivel as string | null | undefined) ?? "",
    caixaVelocidades: (vd?.caixa_velocidades as string | null | undefined) ?? "",
    tracao: (vd?.tracao as string | null | undefined) ?? "",
    potenciaCv: vd?.potencia_cv != null ? String(vd.potencia_cv) : "",
    torqueNm: vd?.torque_nm != null ? String(vd.torque_nm) : "",
    indiciosAdulteracaoKm: (vd?.indicios_adulteracao_km as string | null | undefined) ?? "",
    numeroProprietariosAnteriores:
      vd?.numero_proprietarios_anteriores != null ? String(vd.numero_proprietarios_anteriores) : "",
    registoAcidentesAnteriores: (vd?.registo_acidentes_anteriores as string | null | undefined) ?? "",
    historicoManutencao: (vd?.historico_manutencao as string | null | undefined) ?? "",
    inspecoesPeriodicasIpoNotas: (vd?.inspecoes_periodicas_ipo_notas as string | null | undefined) ?? "",
    inspecoesPeriodicasIpoData: (vd?.inspecoes_periodicas_ipo_data as string | null | undefined) ?? "",
    situacaoFiscalRegular: (vd?.situacao_fiscal_regular as string | null | undefined) ?? "",
    indiciosAdulteracaoPresentes: vd?.indicios_adulteracao_presentes ? "sim" : "nao",
    veiculoImportado: vd?.veiculo_importado ? "sim" : "nao",
    paisOrigem: (vd?.pais_origem as string | null | undefined) ?? "",
    matriculaOrigem: (vd?.matricula_origem as string | null | undefined) ?? "",
    dataImportacao: (vd?.data_importacao as string | null | undefined) ?? "",
    possuiCoc: vd?.possui_coc === null ? "" : vd?.possui_coc ? "sim" : "nao",
    isencaoIsvAplicada: vd?.isencao_isv_aplicada === null ? "" : vd?.isencao_isv_aplicada ? "sim" : "nao",
    numeroDav: (vd?.numero_dav as string | null | undefined) ?? "",
    dataPrimeiraMatricula: (vd?.data_primeira_matricula as string | null | undefined) ?? "",
    valorBaseIucAnual: vd?.valor_base_iuc_anual != null ? String(vd.valor_base_iuc_anual) : "",
  };

  const { data: equipamentos } = await supabase
    .from("equipamento_inspecao")
    .select("id, categoria, nome_equipamento, condicao, comentario, equipamento_fotos(url, ordem)")
    .eq("inspection_id", id);

  const initialEquipamentosPorCategoria: Record<string, Record<string, EquipamentoInitial>> = {};
  for (const e of equipamentos ?? []) {
    const eq = e as unknown as {
      id: string;
      categoria: string;
      nome_equipamento: string;
      condicao: string;
      comentario: string | null;
      equipamento_fotos: { url: string; ordem: number | null }[];
    };
    const fotos = eq.equipamento_fotos;
    initialEquipamentosPorCategoria[eq.categoria] ??= {};
    initialEquipamentosPorCategoria[eq.categoria][eq.nome_equipamento] = {
      id: eq.id,
      condicao: eq.condicao as "bom" | "atencao",
      comentario: eq.comentario,
      foto1Url: fotos?.find((f) => f.ordem === 0)?.url ?? null,
      foto2Url: fotos?.find((f) => f.ordem === 1)?.url ?? null,
    };
  }

  return (
    <main className="page page--wide">
      <h1>Editar dados básicos</h1>
      <NewInspectionForm
        inspectionId={id}
        initialData={initialData}
        initialEquipamentosPorCategoria={initialEquipamentosPorCategoria}
      />
    </main>
  );
}
