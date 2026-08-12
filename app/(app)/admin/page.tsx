import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buildAdminInspectionRows } from "@/lib/inspection/admin-list";
import { InspectionsTable } from "./inspections-table";

export default async function AdminInspectionsPage() {
  const supabase = await createClient();

  const [{ data: inspections, error: inspectionsError }, { data: scores, error: scoresError }] = await Promise.all([
    supabase
      .from("inspections_with_flags")
      .select(
        "id, status, tipo_cliente, data_abertura, atrasada, parceiro_nome, parceiro_logo_url, parceiro_telefone, vehicle_data(matricula, marca, modelo), users(nome)"
      )
      .order("data_abertura", { ascending: false }),
    supabase.from("inspection_score").select("inspection_id, nota_geral, classificacao"),
  ]);

  if (inspectionsError || scoresError) {
    console.error("admin inspections list fetch failed", { inspectionsError, scoresError });
  }

  const rows = buildAdminInspectionRows(
    (inspections ?? []) as unknown as Parameters<typeof buildAdminInspectionRows>[0],
    scores ?? []
  );

  return (
    <main className="page page--wide">
      <div className="page-header">
        <h1>Todas as inspeções</h1>
        <Link href="/admin/tecnicos" className="btn btn-secondary">
          Gerir técnicos
        </Link>
      </div>
      <InspectionsTable rows={rows} />
    </main>
  );
}
