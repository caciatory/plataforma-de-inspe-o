import { createClient } from "@/lib/supabase/server";
import { buildAdminInspectionRows } from "@/lib/inspection/admin-list";
import { InspectionsTable } from "./inspections-table";

export default async function AdminInspectionsPage() {
  const supabase = await createClient();

  const [{ data: inspections, error: inspectionsError }, { data: scores, error: scoresError }] = await Promise.all([
    supabase
      .from("inspections")
      .select("id, status, tipo_cliente, data_abertura, vehicle_data(matricula, marca, modelo), users(nome)")
      .order("data_abertura", { ascending: false }),
    supabase.from("inspection_score").select("inspection_id, nota_geral, classificacao"),
  ]);

  if (inspectionsError || scoresError) {
    console.error("admin inspections list fetch failed", { inspectionsError, scoresError });
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = buildAdminInspectionRows(
    (inspections ?? []) as unknown as Parameters<typeof buildAdminInspectionRows>[0],
    scores ?? [],
    today
  );

  return (
    <main className="page">
      <h1>Todas as inspeções</h1>
      <InspectionsTable rows={rows} />
    </main>
  );
}
