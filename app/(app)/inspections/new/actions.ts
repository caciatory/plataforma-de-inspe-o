"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inspectionFormSchema } from "@/lib/inspection/schema";
import type { StandContact } from "./stand-autocomplete";

export type CreateInspectionState = { status: "idle" } | { status: "error"; message: string; field?: string };

type EquipamentoParsed = {
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
    result.push({
      key,
      categoria: String(formData.get(`${prefix}__categoria`) ?? ""),
      nome_equipamento: String(formData.get(`${prefix}__nome`) ?? ""),
      condicao,
      // ponytail: the comentário textarea in equipamento-categoria.tsx stays mounted (only
      // hidden) and never clears when condição flips back to "bom", so FormData can carry a
      // stale comentário here — drop it unless condição is actually "atencao".
      comentario: condicao === "atencao" ? (formData.get(`${prefix}__comentario`) as string) || null : null,
      personalizado: formData.get(`${prefix}__personalizado`) === "1",
      foto1: foto1 instanceof File && foto1.size > 0 ? foto1 : null,
      foto2: foto2 instanceof File && foto2.size > 0 ? foto2 : null,
    });
  }
  return result;
}

function buildPhotoPath(inspectionId: string, equipamentoId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${equipamentoId}/${Date.now()}-${safeName}`;
}

// Fix 4 (final-review): only an entry with a DB-valid condição and a non-blank
// nome may reach create_inspection — an invalid row here would abort the
// whole transaction on the `condicao in ('bom','atencao')` check constraint,
// with no indication of which of up to 41 items was at fault. Only reachable
// if native HTML validation is bypassed; dropping matches "unanswered item
// isn't persisted", same as if the técnico never touched it.
function isEquipamentoValido(e: EquipamentoParsed): boolean {
  return (e.condicao === "bom" || e.condicao === "atencao") && e.nome_equipamento.trim() !== "";
}

export async function createInspectionAction(
  _prevState: CreateInspectionState,
  formData: FormData
): Promise<CreateInspectionState> {
  const equipamentos = parseEquipamentos(formData).filter(isEquipamentoValido);
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
  const { data: inspectionId, error } = await supabase.rpc("create_inspection", {
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
    // ponytail: same stale-field pattern as equip__comentario above — `hidden`
    // doesn't clear FormData/React state, so a técnico who fills the field then
    // flips the gate back to "não" would otherwise still submit the old value.
    p_indicios_adulteracao_km: v.indiciosAdulteracaoPresentes === "sim" ? v.indiciosAdulteracaoKm || null : null,
    p_numero_proprietarios_anteriores: v.numeroProprietariosAnteriores ?? null,
    p_registo_acidentes_anteriores: v.registoAcidentesAnteriores || null,
    p_historico_manutencao: v.historicoManutencao || null,
    p_inspecoes_periodicas_ipo_notas: v.inspecoesPeriodicasIpoNotas || null,
    p_inspecoes_periodicas_ipo_data: v.inspecoesPeriodicasIpoData || null,
    p_situacao_fiscal_regular: v.situacaoFiscalRegular || null,
    // `equipamentos` was already filtered to isEquipamentoValido() above, so
    // ordem here stays index-aligned with the equipamento_inspecao rows the
    // RPC creates — uploadPendingEquipamentoFotos below relies on that.
    p_equipamentos: equipamentos.map((e, ordem) => ({
      ordem,
      categoria: e.categoria,
      nome_equipamento: e.nome_equipamento,
      condicao: e.condicao,
      comentario: e.comentario,
      personalizado: e.personalizado,
    })),
    p_indicios_adulteracao_presentes: v.indiciosAdulteracaoPresentes === "sim",
    p_veiculo_importado: v.veiculoImportado === "sim",
    // Same stale-field pattern: the importação block stays mounted (only
    // `hidden`) when veiculoImportado flips back to "não", so drop all 6
    // fields unless the gate is actually "sim".
    p_pais_origem: v.veiculoImportado === "sim" ? v.paisOrigem || null : null,
    p_matricula_origem: v.veiculoImportado === "sim" ? v.matriculaOrigem || null : null,
    p_data_importacao: v.veiculoImportado === "sim" ? v.dataImportacao || null : null,
    p_possui_coc: v.veiculoImportado === "sim" ? (v.possuiCoc === undefined ? null : v.possuiCoc === "sim") : null,
    p_isencao_isv_aplicada:
      v.veiculoImportado === "sim" ? (v.isencaoIsvAplicada === undefined ? null : v.isencaoIsvAplicada === "sim") : null,
    p_numero_dav: v.veiculoImportado === "sim" ? v.numeroDav || null : null,
    p_data_primeira_matricula: v.dataPrimeiraMatricula || null,
    p_valor_base_iuc_anual: v.valorBaseIucAnual ?? null,
  });

  if (error) {
    console.error("create_inspection failed", error);
    return { status: "error", message: "Não foi possível guardar a inspeção. Tente novamente." };
  }

  const equipamentosComFoto = equipamentos.filter((e) => e.foto1 || e.foto2);
  if (equipamentosComFoto.length > 0) {
    // A inspeção principal já foi criada com sucesso (RPC acima) — nada neste bloco deve
    // impedir o redirect final. Qualquer exceção (não só um {error} retornado) cai em
    // console.error para investigação, igual ao resto do arquivo.
    try {
      await uploadPendingEquipamentoFotos(supabase, inspectionId, equipamentos);
    } catch (err) {
      console.error("erro inesperado ao carregar equipamento_inspecao para upload de fotos", err);
    }
  }

  redirect(`/inspections/${inspectionId}`);
}

async function uploadPendingEquipamentoFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  equipamentos: EquipamentoParsed[]
): Promise<void> {
  const { data: equipRows } = await supabase
    .from("equipamento_inspecao")
    .select("id, ordem")
    .eq("inspection_id", inspectionId)
    .order("ordem", { ascending: true });

  for (let ordem = 0; ordem < equipamentos.length; ordem++) {
    const equip = equipamentos[ordem];
    if (!equip.foto1 && !equip.foto2) continue;
    const equipamentoId = equipRows?.find((r) => r.ordem === ordem)?.id;
    if (!equipamentoId) continue;

    for (const [fotoOrdem, foto] of [equip.foto1, equip.foto2].entries()) {
      if (!foto) continue;
      // Falha de upload/insert não bloqueia a criação da inspeção (já existe e é o dado
      // principal) — nem um erro retornado (uploadError/insertError) nem uma exceção real
      // (ex: falha de rede) devem impedir o redirect final; tudo cai em console.error.
      try {
        const path = buildPhotoPath(inspectionId, equipamentoId, foto.name);
        const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, foto);
        if (uploadError) {
          console.error("upload de foto de equipamento falhou", uploadError);
          continue;
        }
        const { data: publicUrl } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
        const { error: insertError } = await supabase.from("equipamento_fotos").insert({
          inspection_id: inspectionId,
          equipamento_inspecao_id: equipamentoId,
          url: publicUrl.publicUrl,
          ordem: fotoOrdem,
        });
        if (insertError) {
          console.error("insert de equipamento_fotos falhou", insertError);
        }
      } catch (err) {
        console.error("erro inesperado ao processar foto de equipamento", err);
      }
    }
  }
}

export async function searchStandContactsAction(query: string): Promise<StandContact[]> {
  if (query.trim().length < 2) return [];

  // RF-05: plain select, no RPC. The existing client_data_select RLS policy
  // (supabase/migrations/00008_rls_helpers_and_core.sql) already scopes this to
  // stands the current user can see (técnico: own inspections; admin: all) —
  // see Global Constraints for why cross-técnico visibility was rejected.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_data")
    .select("nome_solicitante, contacto, email")
    .eq("tipo", "stand")
    .ilike("nome_solicitante", `%${query}%`)
    .order("nome_solicitante")
    .limit(5);

  if (error) {
    console.error("searchStandContactsAction failed", error);
    return [];
  }

  return data ?? [];
}
