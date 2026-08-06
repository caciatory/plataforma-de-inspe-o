"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

export type CreateTecnicoState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function createTecnicoAction(
  _prevState: CreateTecnicoState,
  formData: FormData
): Promise<CreateTecnicoState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem criar técnicos." };
  }

  const nome = ((formData.get("nome") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const senha = (formData.get("senha") as string) || "";

  if (!nome || !email || senha.length < 8) {
    return { status: "error", message: "Preencha nome, email e uma senha com pelo menos 8 caracteres." };
  }

  const adminClient = createAdminClient();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    console.error("createTecnicoAction auth.admin.createUser failed", createError);
    return {
      status: "error",
      message:
        createError?.message === "User already registered"
          ? "Já existe um utilizador com este email."
          : "Não foi possível criar o técnico. Tente novamente.",
    };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("users")
    .insert({ id: created.user.id, nome, email, role: "tecnico" });

  if (insertError) {
    console.error("createTecnicoAction users insert failed", insertError);
    return { status: "error", message: "Utilizador criado, mas não foi possível salvar o perfil. Contacte o suporte." };
  }

  return { status: "success" };
}

export type ToggleTecnicoState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

// ~100 years -- Supabase's Admin API has no literal "permanent" ban value,
// this is the documented workaround (ban_duration: "none" reverses it).
const PERMANENT_BAN_DURATION = "876000h";

export async function toggleTecnicoBanAction(
  _prevState: ToggleTecnicoState,
  formData: FormData
): Promise<ToggleTecnicoState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem desativar técnicos." };
  }

  const tecnicoId = formData.get("tecnicoId") as string;
  const ban = formData.get("ban") === "true";

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(tecnicoId, {
    ban_duration: ban ? PERMANENT_BAN_DURATION : "none",
  });

  if (error) {
    console.error("toggleTecnicoBanAction failed", error);
    return { status: "error", message: "Não foi possível atualizar o técnico. Tente novamente." };
  }

  return { status: "success" };
}
