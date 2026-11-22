/**
 * Demo sign-in for trying the app before a database exists.
 * Only available while Supabase is NOT configured: the moment real keys are
 * added, demo sign-in switches off and the demo cookie is ignored, so it can
 * never open real client data.
 */
import { supabaseEnv } from "@/lib/supabase/env";

export const DEMO_EMAIL = "demo@pfesic.app";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_COOKIE = "pfesic_demo";

export function demoAvailable(): boolean {
  return supabaseEnv() === null;
}
