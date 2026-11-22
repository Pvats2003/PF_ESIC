import { LogOut, Palette } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

// Phase 0 placeholder. The "This Month" dashboard replaces this in Phase 2.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Wordmark />
      <div className="card-highlight rounded-2xl bg-surface p-6">
        <Suspense fallback={<Skeleton className="h-8 w-48" />}>
          <Greeting />
        </Suspense>
        <p className="mt-2 text-sm text-ink-muted">
          You&apos;re signed in. The month dashboard arrives in Phase 2, once the Excel data is imported.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild variant="secondary"><Link href="/design"><Palette />Open the style guide</Link></Button>
          <form action="/auth/signout" method="post">
            <Button variant="ghost" block type="submit"><LogOut />Sign out</Button>
          </form>
        </div>
      </div>
    </main>
  );
}

async function Greeting() {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_app_user");
  if (!allowed) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  const { data: me } = await supabase.from("app_users").select("partners(name)").maybeSingle();
  const name = (me?.partners as { name?: string } | null)?.name ?? "there";
  return <h1 className="text-xl font-semibold">Namaste, {name}</h1>;
}
