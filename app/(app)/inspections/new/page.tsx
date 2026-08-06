import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EQUIPAMENTO_CATEGORIAS } from "@/lib/equipamento/catalog";
import { getCurrentUser } from "@/lib/auth/session";
import { NewInspectionForm } from "./new-inspection-form";

export default async function NewInspectionPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "tecnico") {
    redirect("/admin");
  }

  const supabase = await createClient();
  const { data: sugestoes } = await supabase.from("equipamento_sugestoes").select("categoria, nome");

  // Fix 2 (final-review): group equipamento_sugestoes (written by the RPC on
  // every custom "Outros Equipamentos" submission, §4.2/§5 of the design
  // spec) by categoria, skipping anything that already matches a predefined
  // catalog item case-insensitively so we don't render duplicate checkboxes.
  const catalogoPorCategoria = new Map(
    EQUIPAMENTO_CATEGORIAS.map((c) => [c.id, new Set(c.itens.map((i) => i.toLowerCase()))])
  );
  const sugestoesPorCategoria: Record<string, string[]> = {};
  for (const { categoria, nome } of sugestoes ?? []) {
    if (catalogoPorCategoria.get(categoria)?.has(nome.toLowerCase())) continue;
    (sugestoesPorCategoria[categoria] ??= []).push(nome);
  }

  return (
    <main className="page">
      <h1>Nova inspeção — dados básicos</h1>
      <NewInspectionForm sugestoesPorCategoria={sugestoesPorCategoria} />
    </main>
  );
}
