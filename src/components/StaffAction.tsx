"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function StaffAction({rpc,args,label,textKey,confirm,redirectTo}:{rpc:string;args:Record<string,unknown>;label:string;textKey?:string;confirm?:string;redirectTo?:string}) {
 const [text,setText]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const router=useRouter();
 return <form className="space-y-2" onSubmit={async e=>{e.preventDefault();if(busy || (confirm && !window.confirm(confirm)))return;setBusy(true);setMessage("");try {const {error}=await createClient().rpc(rpc,{...args,...(textKey?{[textKey]:text}:{})});if(error)throw error;setText("");setMessage("Saved.");if(redirectTo)router.push(redirectTo);router.refresh();}catch(e){setMessage(e && typeof e==='object' && 'message' in e?String(e.message):"Could not save. Please retry.");}finally{setBusy(false);}}}>
 {textKey && <label className="block text-sm">{textKey==='p_reason'?"Reason":"Notes / proposed revision"}<textarea required minLength={3} maxLength={textKey==='p_reason'?500:4000} value={text} onChange={e=>setText(e.target.value)} className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-950 p-3" /></label>}
 <button disabled={busy} className="min-h-11 rounded border border-orange-700 px-4 py-2 disabled:opacity-40">{busy?"Saving...":label}</button>{message && <p role="status" className="text-sm text-orange-300">{message}</p>}
 </form>;
}
