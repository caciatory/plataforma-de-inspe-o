import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress, computeSubcategoriaProgress } from "@/lib/checklist/progress";
import { ChecklistNavGroup } from "./checklist-nav-group";

export default async function ChecklistLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase.from("inspections").select("id").eq("id", id).single();

  if (!inspection) notFound();

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase.from("checklist_item_templates").select("id, group_id, subcategoria"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("checklist layout data fetch failed", { groupsError, itemsError, responsesError });
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);
  const subcategoriaProgress = computeSubcategoriaProgress(items ?? [], responses ?? []);
  const subcategoriasByGroupId = new Map(subcategoriaProgress.map((g) => [g.id, g.subcategorias]));

  return (
    <div className="checklist-shell">
      <nav className="checklist-nav identity-bar" aria-label="Grupos da checklist">
        <h2 className="checklist-nav__title">Checklist</h2>
        <ul className="checklist-nav__list">
          {progress.map((group) => (
            <ChecklistNavGroup
              key={group.id}
              inspectionId={id}
              group={group}
              subcategorias={subcategoriasByGroupId.get(group.id) ?? []}
            />
          ))}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
