import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChecklistIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: firstGroup, error } = await supabase
    .from("checklist_group_templates")
    .select("id")
    .eq("ativo", true)
    .order("ordem")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("checklist index group lookup failed", error);
  }

  if (!firstGroup) notFound();

  redirect(`/inspections/${id}/checklist/${firstGroup.id}`);
}
