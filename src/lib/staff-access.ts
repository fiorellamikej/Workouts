import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export async function requireStaff() {
 const db=await createClient(); const {data:{user}}=await db.auth.getUser();
 if(!user) redirect("/auth/login");
 const {data:role,error}=await db.rpc("my_staff_role");
 if(error || !["coach","owner"].includes(role)) redirect("/dashboard");
 const {data:assurance}=await db.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance?.currentLevel!=='aal2')redirect('/staff/security');
 return {db,role:role as "coach"|"owner",user};
}
