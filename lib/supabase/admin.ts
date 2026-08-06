// Service-role client — bypasses RLS entirely. Only ever used server-side,
// only for the Supabase Auth Admin API (auth.admin.*), never for table
// access (regular Server Actions already use the RLS-scoped client from
// ./server.ts for that). Never import this into a Client Component.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
