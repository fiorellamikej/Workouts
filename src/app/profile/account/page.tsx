import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/components/AccountSettings";
export default async function AccountPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/auth/login");
  return <div className="mx-auto max-w-xl space-y-6"><Link href="/profile" className="text-orange-400">← Profile</Link><h1 className="text-3xl font-bold">Account settings</h1><AccountSettings userId={user.id} email={user.email || ""} /></div>;
}
