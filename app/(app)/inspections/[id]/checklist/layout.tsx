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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{ width: 260, borderRight: "1px solid #ccc", padding: "1rem" }}>
        <h2>Checklist</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {progress.map((group) => (
            <li key={group.id}>
              <Link href={`/inspections/${id}/checklist/${group.id}`}>
                {group.pendentes === 0 ? "✅" : `⚠️ (${group.pendentes})`} {group.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>{children}</main>
    </div>
  );
}
