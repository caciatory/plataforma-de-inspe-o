"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inspectionFormSchema } from "@/lib/inspection/schema";
import type { StandContact } from "./stand-autocomplete";

export type CreateInspectionState = { status: "idle" } | { status: "error"; message: string };

export async function createInspectionAction(
  _prevState: CreateInspectionState,
  formData: FormData
): Promise<CreateInspectionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = inspectionFormSchema.safeParse(raw);

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
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
  });

  if (error) {
    return { status: "error", message: "Não foi possível guardar a inspeção. Tente novamente." };
  }

  redirect(`/inspections/${inspectionId}`);
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

  if (error) return [];

  return data ?? [];
}
