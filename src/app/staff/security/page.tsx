import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StaffSecurity } from "@/components/StaffSecurity";
export default async function Page(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/auth/login');const {data:role}=await db.rpc('my_staff_role');if(!['owner','coach'].includes(role))redirect('/dashboard');return <div className="mx-auto max-w-lg space-y-4"><h1 className="text-3xl font-bold">Staff two-factor verification</h1><p>Use an authenticator app to protect staff access.</p><StaffSecurity destination={role==='owner'?'/admin':'/coach'} /></div>;}
