import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress } from "@/lib/checklist/progress";

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
    supabase.from("checklist_item_templates").select("id, group_id"),
    supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("checklist layout data fetch failed", { groupsError, itemsError, responsesError });
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);

  return (
    <div className="checklist-shell">
      <nav className="checklist-nav identity-bar" aria-label="Grupos da checklist">
        <h2 className="checklist-nav__title">Checklist</h2>
        <ul className="checklist-nav__list">
          {progress.map((group) => (
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
            </li>
          ))}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
