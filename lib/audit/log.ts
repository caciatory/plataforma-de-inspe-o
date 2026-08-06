import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ponytail: fire-and-forget on failure -- the checklist save this follows
// already succeeded and the técnico/admin already saw a success state; an
// audit-write hiccup shouldn't surface as a false "não foi possível
// guardar" error. Logged to console for operator visibility instead.
export async function recordAdminEdit(
  supabase: SupabaseServerClient,
  params: { inspectionId: string; itemTemplateId: string; adminId: string }
): Promise<void> {
  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("nome")
    .eq("id", params.itemTemplateId)
    .single();

  const { error } = await supabase.from("audit_log_entries").insert({
    inspection_id: params.inspectionId,
    admin_id: params.adminId,
    descricao: `Editou "${item?.nome ?? params.itemTemplateId}"`,
  });

  if (error) {
    console.error("recordAdminEdit insert failed", error);
  }
}
