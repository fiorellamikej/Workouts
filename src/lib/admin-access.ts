import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export async function requireAdmin() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/auth/login");
  const {data:role}=await client.rpc("my_staff_role");
  if(role==='owner') {const {data:assurance}=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance?.currentLevel!=='aal2')redirect('/staff/security');}
  const { data, error } = await client.rpc("support_is_admin");
  if (error || !data) redirect("/");
  return client;
}
