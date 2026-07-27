import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress, computeSubcategoriaProgress, SEM_SUBCATEGORIA_PARAM } from "@/lib/checklist/progress";

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
          {progress.map((group) => {
            const subcategorias = subcategoriasByGroupId.get(group.id) ?? [];
            return (
              <li key={group.id}>
                <Link href={`/inspections/${id}/checklist/${group.id}`} className="checklist-nav__link">
                  <span
                    className={`checklist-nav__status ${group.pendentes === 0 ? "checklist-nav__status--done" : "checklist-nav__status--pending"}`}
                    aria-hidden="true"
                  >
                    {group.pendentes === 0 ? "✓" : group.pendentes}
                  </span>
                  <span className="sr-only">
                    {group.pendentes === 0 ? "Concluído: " : `${group.pendentes} pendentes: `}
                  </span>
                  {group.nome}
                </Link>
                {subcategorias.length > 0 && (
                  <ul className="checklist-nav__sublist">
                    {subcategorias.map((sub) => {
                      const subParam = sub.subcategoria ?? SEM_SUBCATEGORIA_PARAM;
                      return (
                        <li key={subParam}>
                          <Link
                            href={`/inspections/${id}/checklist/${group.id}?sub=${encodeURIComponent(subParam)}`}
                            className="checklist-nav__sublink"
                          >
                            <span
                              className={`checklist-nav__substatus ${sub.pendentes === 0 ? "checklist-nav__substatus--done" : "checklist-nav__substatus--pending"}`}
                              aria-hidden="true"
                            >
                              {sub.pendentes === 0 ? "✓" : sub.pendentes}
                            </span>
                            <span className="sr-only">
                              {sub.pendentes === 0 ? "Concluído: " : `${sub.pendentes} pendentes: `}
                            </span>
                            {sub.subcategoria ?? "Sem subcategoria"}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
