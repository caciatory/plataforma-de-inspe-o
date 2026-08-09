import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TecnicosTable, type TecnicoRow } from "./tecnicos-table";

export default async function TecnicosPage() {
  const supabase = await createClient();
  const { data: tecnicos, error } = await supabase
    .from("users")
    .select("id, nome, email")
    .eq("role", "tecnico")
    .order("nome");

  if (error) {
    console.error("tecnicos list fetch failed", error);
  }

  const adminClient = createAdminClient();
  const { data: authList, error: authError } = await adminClient.auth.admin.listUsers();
  if (authError) {
    console.error("tecnicos auth list fetch failed", authError);
  }

  const bannedById = new Map(
    (authList?.users ?? []).map((u) => [u.id, Boolean(u.banned_until && new Date(u.banned_until) > new Date())])
  );

  const rows: TecnicoRow[] = (tecnicos ?? []).map((t) => ({
    id: t.id,
    nome: t.nome,
    email: t.email,
    ativo: !(bannedById.get(t.id) ?? false),
  }));

  return (
    <main className="page page--wide">
      <Link href="/admin" className="back-link">
        ← Voltar a todas as inspeções
      </Link>
      <h1>Técnicos</h1>
      <TecnicosTable rows={rows} />
    </main>
  );
}
