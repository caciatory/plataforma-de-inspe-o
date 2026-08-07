-- supabase/migrations/00046_users_insert_policy.sql
-- Achado da revisão final da branch revisao-gestao-admin (Fase 5,
-- sub-projetos 2+3): `public.users` tem RLS habilitada desde a migration
-- 00008, mas nunca ganhou uma policy de INSERT -- RLS do Postgres é
-- default-deny, então o insert de perfil em createTecnicoAction (gestão de
-- técnico) falhava com 42501 em toda chamada, mesmo pro admin. Só admin
-- pode inserir -- criar técnico é sempre uma ação do admin.

create policy users_insert on public.users
  for insert to authenticated
  with check (public.is_admin());
