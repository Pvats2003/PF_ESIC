import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/brand/logo";
import { supabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const configured = supabaseEnv() !== null;
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-accent-soft opacity-60 blur-3xl" />
      <div className="relative w-full max-w-[380px]">
        <Wordmark className="mb-8 justify-center" />
        <div className="card-highlight rounded-2xl bg-surface p-6">
          <h1 className="text-lg font-semibold">Welcome back</h1>
          <p className="mt-1 mb-6 text-sm text-ink-muted">Sign in with the account Alok or Rajeev set up for you.</p>
          {!configured && (
            <p role="status" className="mb-4 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning ring-1 ring-warning-line ring-inset">
              The database isn&apos;t connected yet. Add the Supabase keys to <code>.env.local</code>.
            </p>
          )}
          <Suspense fallback={<FormSkeleton />}>
            <LoginForm disabled={!configured} />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-ink-faint">
          No sign-up: accounts are added by the partners. <Link href="/design" className="underline underline-offset-2 hover:text-ink">Style guide</Link>
        </p>
      </div>
    </main>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-4 w-16" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-13 w-full rounded-xl" />
    </div>
  );
}
