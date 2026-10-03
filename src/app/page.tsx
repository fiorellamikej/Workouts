import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <Link
        href="/auth/login"
        aria-label="Enter Sword and Shield"
        className="block h-full w-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-500"
        style={{
          backgroundImage: "url('/sword-and-shield.png')",
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <span className="sr-only">Enter Sword and Shield</span>
      </Link>
    </div>
  );
}
