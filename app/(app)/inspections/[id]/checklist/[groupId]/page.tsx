import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria } from "@/lib/checklist/progress";

export default async function ChecklistGroupPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("checklist_group_templates")
    .select("id, nome")
    .eq("id", groupId)
    .eq("ativo", true)
    .single();

  if (!group) notFound();

  const [{ data: items, error: itemsError }, { data: responses, error: responsesError }] = await Promise.all([
    supabase.from("checklist_item_templates").select("id, subcategoria, nome").eq("group_id", groupId),
    supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
  ]);

  if (itemsError || responsesError) {
    console.error("checklist group data fetch failed", { itemsError, responsesError });
  }

  const subcategorias = groupItemsBySubcategoria(items ?? [], responses ?? []);

  return (
    <div>
      <h1>{group.nome}</h1>
      {subcategorias.map((bucket) => (
        <section key={bucket.subcategoria ?? "sem-subcategoria"}>
          {bucket.subcategoria && <h2>{bucket.subcategoria}</h2>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {bucket.items.map((item) => (
              <li key={item.id}>
                {item.status === "pendente" ? "⚠️" : item.status === "NF" ? "➖" : "✅"} {item.nome}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
