"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, DEMO_EMAIL, DEMO_PASSWORD, demoAvailable } from "@/lib/demo/session";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { loginSchema } from "./schema";

export type LoginState = { error?: string } | undefined;

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(input: { email: string; password: string; next?: string }): Promise<LoginState> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details" };

  // No database yet: only the demo account works, and it only shows made-up data.
  if (!supabaseEnv()) {
    if (!demoAvailable() || parsed.data.email !== DEMO_EMAIL || parsed.data.password !== DEMO_PASSWORD) {
      return { error: `Use the demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}` };
    }
    (await cookies()).set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
    redirect(safeNext(input.next));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.status === 400 ? "That email and password don't match." : "Couldn't sign in. Try again in a moment." };
  }

  // Only allow-listed partners may use the app (RLS enforces this too).
  const { data: allowed } = await supabase.rpc("is_app_user");
  if (!allowed) {
    await supabase.auth.signOut();
    return { error: "This account isn't allowed to use PF ESIC Desk. Ask Alok or Rajeev to add you." };
  }
  redirect(safeNext(input.next));
}
