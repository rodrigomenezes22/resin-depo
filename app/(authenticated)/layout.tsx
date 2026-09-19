import { redirect } from "next/navigation";

import { AppNav } from "@/components/shell/app-nav";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  return (
    <div className="bg-background text-foreground min-h-svh">
      <AppNav email={String(data.claims.email ?? "")} />
      <main className="mx-auto w-full max-w-[1600px] px-4 py-4">{children}</main>
    </div>
  );
}
