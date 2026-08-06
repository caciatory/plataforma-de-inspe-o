import { createClient } from "@/lib/supabase/server";

export type UserRole = "tecnico" | "admin";
export type CurrentUser = { id: string; role: UserRole };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!data) return null;

  return { id: user.id, role: data.role as UserRole };
}
