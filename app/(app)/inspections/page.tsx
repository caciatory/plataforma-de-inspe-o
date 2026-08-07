import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildTecnicoInspectionRows } from "@/lib/inspection/list";
import { getCurrentUser } from "@/lib/auth/session";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

export default async function MinhasInspecoesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "tecnico") {
    redirect("/admin");
  }

  const supabase = await createClient();

  const { data: inspections, error: inspectionsError } = await supabase
    .from("inspections")
    .select("id, status, data_abertura, vehicle_data(*)")
    .order("data_abertura", { ascending: false });

  if (inspectionsError) {
    console.error("minhas inspecoes fetch failed", inspectionsError);
  }

  const devolvidaIds = (inspections ?? []).filter((i) => i.status === "devolvida").map((i) => i.id);

  const { data: devolucoes } =
    devolvidaIds.length > 0
      ? await supabase
          .from("review_events")
          .select("inspection_id, motivo, timestamp")
          .eq("tipo", "devolucao")
          .in("inspection_id", devolvidaIds)
          .order("timestamp", { ascending: false })
      : { data: [] as { inspection_id: string; motivo: string | null }[] };

  const latestDevolucaoByInspectionId = new Map<string, string>();
  for (const d of devolucoes ?? []) {
    if (!latestDevolucaoByInspectionId.has(d.inspection_id) && d.motivo) {
      latestDevolucaoByInspectionId.set(d.inspection_id, d.motivo);
    }
  }

  const rows = buildTecnicoInspectionRows(
    (inspections ?? []).map((i) => ({
      id: i.id,
      status: i.status,
      data_abertura: i.data_abertura,
      vehicle_data: i.vehicle_data,
    })) as unknown as Parameters<typeof buildTecnicoInspectionRows>[0],
    latestDevolucaoByInspectionId
  );

  return (
    <main className="page">
      <div className="stack-row">
        <h1>Minhas Inspeções</h1>
        <Link href="/inspections/new" className="btn btn-primary">
          Nova inspeção
        </Link>
      </div>
      <ul className="item-list">
        {rows.map((r) => (
          <li key={r.id} className={r.devolvida ? "item-list__row item-list__row--warning" : "item-list__row"}>
            <Link href={`/inspections/${r.id}`}>
              <strong>{r.matricula}</strong> — {STATUS_LABEL[r.status] ?? r.status} — {r.dataAbertura}
              {r.motivo && <p className="hint">Motivo da devolução: {r.motivo}</p>}
            </Link>
          </li>
        ))}
        {rows.length === 0 && <p className="hint">Nenhuma inspeção ainda.</p>}
      </ul>
    </main>
  );
}
