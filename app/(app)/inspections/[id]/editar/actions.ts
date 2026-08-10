"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { inspectionFormSchema } from "@/lib/inspection/schema";

export type UpdateInspectionState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: string };

type EquipamentoParsed = {
  id: string | null;
  key: string;
  categoria: string;
  nome_equipamento: string;
  condicao: string;
  comentario: string | null;
  personalizado: boolean;
  foto1: File | null;
  foto2: File | null;
};

function parseEquipamentos(formData: FormData): EquipamentoParsed[] {
  const keys = new Set<string>();
  for (const name of formData.keys()) {
    const match = name.match(/^equip__(.+)__selecionado$/);
    if (match) keys.add(match[1]);
  }

  const result: EquipamentoParsed[] = [];
  for (const key of keys) {
    const prefix = `equip__${key}`;
    const foto1 = formData.get(`${prefix}__foto1`);
    const foto2 = formData.get(`${prefix}__foto2`);
    const condicao = String(formData.get(`${prefix}__condicao`) ?? "");
    const id = formData.get(`${prefix}__id`);
    result.push({
      id: typeof id === "string" && id !== "" ? id : null,
      key,
      categoria: String(formData.get(`${prefix}__categoria`) ?? ""),
      nome_equipamento: String(formData.get(`${prefix}__nome`) ?? ""),
      condicao,
      comentario: condicao === "atencao" ? (formData.get(`${prefix}__comentario`) as string) || null : null,
      personalizado: formData.get(`${prefix}__personalizado`) === "1",
      foto1: foto1 instanceof File && foto1.size > 0 ? foto1 : null,
      foto2: foto2 instanceof File && foto2.size > 0 ? foto2 : null,
    });
  }
  return result;
}

function isEquipamentoValido(e: EquipamentoParsed): boolean {
  return (e.condicao === "bom" || e.condicao === "atencao") && e.nome_equipamento.trim() !== "";
}

function buildPhotoPath(inspectionId: string, equipamentoId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${equipamentoId}/${Date.now()}-${safeName}`;
}

export async function updateInspectionAction(
  _prevState: UpdateInspectionState,
  formData: FormData
): Promise<UpdateInspectionState> {
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const equipamentos = parseEquipamentos(formData).filter(isEquipamentoValido);
  const equipamentosRemovidos = String(formData.get("equipamentosRemovidos") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const raw = Object.fromEntries(formData.entries());
  const parsed = inspectionFormSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      status: "error",
      message: firstIssue?.message ?? "Dados inválidos.",
      field: firstIssue?.path[0] !== undefined ? String(firstIssue.path[0]) : undefined,
    };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inspection", {
    p_inspection_id: inspectionId,
    p_tipo_cliente: v.tipoCliente,
    p_objetivo: v.objetivo,
    p_matricula: v.matricula,
    p_marca: v.marca,
    p_modelo: v.modelo,
    p_nome_solicitante: v.nomeSolicitante,
    p_quilometragem: v.quilometragem,
    p_versao_trim: v.versaoTrim || null,
    p_ano_fabrico: v.anoFabrico ?? null,
    p_ano_modelo: v.anoModelo ?? null,
    p_cor: v.cor || null,
    p_vin: v.vin || null,
    p_numero_motor: v.numeroMotor || null,
    p_numero_portas: v.numeroPortas ?? null,
    p_combustivel: v.combustivel || null,
    p_caixa_velocidades: v.caixaVelocidades || null,
    p_tracao: v.tracao || null,
    p_potencia_cv: v.potenciaCv ?? null,
    p_torque_nm: v.torqueNm ?? null,
    p_contacto: v.contacto || null,
    p_email: v.email || null,
    p_responsavel_presente: v.responsavelPresente || null,
    p_indicios_adulteracao_km: v.indiciosAdulteracaoPresentes === "sim" ? v.indiciosAdulteracaoKm || null : null,
    p_numero_proprietarios_anteriores: v.numeroProprietariosAnteriores ?? null,
    p_registo_acidentes_anteriores: v.registoAcidentesAnteriores || null,
    p_historico_manutencao: v.historicoManutencao || null,
    p_inspecoes_periodicas_ipo_notas: v.inspecoesPeriodicasIpoNotas || null,
    p_inspecoes_periodicas_ipo_data: v.inspecoesPeriodicasIpoData || null,
    p_situacao_fiscal_regular: v.situacaoFiscalRegular || null,
    p_indicios_adulteracao_presentes: v.indiciosAdulteracaoPresentes === "sim",
    p_veiculo_importado: v.veiculoImportado === "sim",
    p_pais_origem: v.veiculoImportado === "sim" ? v.paisOrigem || null : null,
    p_matricula_origem: v.veiculoImportado === "sim" ? v.matriculaOrigem || null : null,
    p_data_importacao: v.veiculoImportado === "sim" ? v.dataImportacao || null : null,
    p_possui_coc: v.veiculoImportado === "sim" ? (v.possuiCoc === undefined ? null : v.possuiCoc === "sim") : null,
    p_isencao_isv_aplicada:
      v.veiculoImportado === "sim" ? (v.isencaoIsvAplicada === undefined ? null : v.isencaoIsvAplicada === "sim") : null,
    p_numero_dav: v.veiculoImportado === "sim" ? v.numeroDav || null : null,
    p_data_primeira_matricula: v.dataPrimeiraMatricula || null,
    p_valor_base_iuc_anual: v.valorBaseIucAnual ?? null,
    p_equipamentos: equipamentos.map((e, ordem) => ({
      ...(e.id ? { id: e.id } : {}),
      ordem,
      categoria: e.categoria,
      nome_equipamento: e.nome_equipamento,
      condicao: e.condicao,
      comentario: e.comentario,
      personalizado: e.personalizado,
    })),
    p_equipamentos_removidos: equipamentosRemovidos,
  });

  if (error) {
    console.error("update_inspection failed", error);
    return { status: "error", message: "Não foi possível guardar as alterações. Tente novamente." };
  }

  const equipamentosComFoto = equipamentos.filter((e) => e.foto1 || e.foto2);
  if (equipamentosComFoto.length > 0) {
    try {
      await uploadEquipamentoFotos(supabase, inspectionId, equipamentos);
    } catch (err) {
      console.error("erro inesperado ao processar fotos de equipamento na edição", err);
    }
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    const { error: auditError } = await supabase.from("audit_log_entries").insert({
      inspection_id: inspectionId,
      admin_id: currentUser.id,
      descricao: "Editou dados básicos da inspeção",
    });
    if (auditError) console.error("audit_log_entries insert failed (update_inspection)", auditError);
  }

  redirect(`/inspections/${inspectionId}`);
}

async function uploadEquipamentoFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  equipamentos: EquipamentoParsed[]
): Promise<void> {
  // Existing items already carry their own id (Task 6 threads it through as
  // `equip__<key>__id`); only newly-inserted items need the ordem-based lookup
  // create_inspection's uploader already relies on.
  const { data: equipRows } = await supabase
    .from("equipamento_inspecao")
    .select("id, ordem")
    .eq("inspection_id", inspectionId)
    .order("ordem", { ascending: true });

  for (let ordem = 0; ordem < equipamentos.length; ordem++) {
    const equip = equipamentos[ordem];
    if (!equip.foto1 && !equip.foto2) continue;
    const equipamentoId = equip.id ?? equipRows?.find((r) => r.ordem === ordem)?.id;
    if (!equipamentoId) continue;

    for (const [fotoOrdem, foto] of [equip.foto1, equip.foto2].entries()) {
      if (!foto) continue;
      try {
        // Replacing an existing slot: remove the old row at this ordem before
        // inserting the new one, per the design's "picking a new file replaces
        // the slot" decision.
        await supabase
          .from("equipamento_fotos")
          .delete()
          .eq("equipamento_inspecao_id", equipamentoId)
          .eq("ordem", fotoOrdem);

        const path = buildPhotoPath(inspectionId, equipamentoId, foto.name);
        const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, foto);
        if (uploadError) {
          console.error("upload de foto de equipamento falhou (edição)", uploadError);
          continue;
        }
        const { data: publicUrl } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
        const { error: insertError } = await supabase.from("equipamento_fotos").insert({
          inspection_id: inspectionId,
          equipamento_inspecao_id: equipamentoId,
          url: publicUrl.publicUrl,
          ordem: fotoOrdem,
        });
        if (insertError) console.error("insert de equipamento_fotos falhou (edição)", insertError);
      } catch (err) {
        console.error("erro inesperado ao processar foto de equipamento (edição)", err);
      }
    }
  }
}
