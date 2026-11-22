import "server-only";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/demo/session";
import { supabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The app's only door to data: named database functions (see supabase/migrations).
 *   production  → supabase.rpc(fn, args) as the signed-in user (Row Level Security applies)
 *   development → `select public.fn(...)` on a local Postgres, as the demo partner,
 *                 with the same role switch Supabase does, so the same rules apply.
 */
export interface Db {
  mode: "supabase" | "local";
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export class DbError extends Error {}

const FN = /^[a-z_]+$/;
const ARG = /^p_[a-z_]+$/;

let pool: import("pg").Pool | null = null;

async function localDb(): Promise<Db | null> {
  const url = process.env.LOCAL_DATABASE_URL;
  const userId = process.env.LOCAL_DEMO_USER_ID;
  if (!url || !userId) return null;
  if ((await cookies()).get(DEMO_COOKIE)?.value !== "1") return null;
  const { Pool } = await import("pg");
  pool ??= new Pool({ connectionString: url, max: 5 });
  return {
    mode: "local",
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      if (!FN.test(fn) || !Object.keys(args).every((k) => ARG.test(k))) throw new DbError("Bad function call");
      const keys = Object.keys(args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const client = await pool!.connect();
      try {
        await client.query("begin");
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        await client.query("set local role authenticated");
        const res = await client.query(sql, keys.map((k) => args[k]));
        await client.query("commit");
        return res.rows[0]?.r as T;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw new DbError((e as Error).message);
      } finally {
        client.release();
      }
    },
  };
}

export async function getDb(): Promise<Db | null> {
  if (!supabaseEnv()) return localDb();
  const supabase = await createClient();
  return {
    mode: "supabase",
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw new DbError(error.message);
      return data as T;
    },
  };
}

/** Same as getDb but throws when there's no data source (pages behind the proxy always have one). */
export async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new DbError("No database is connected. Sign in again.");
  return db;
}
