import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export async function requireAdmin() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data, error } = await client.rpc("support_is_admin");
  if (error || !data) redirect("/");
  return client;
}
