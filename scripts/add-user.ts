/**
 * Adds (or re-links) a partner's login. There is no public sign-up: this
 * script is the only way in. Needs the service-role key, so run it from a
 * trusted machine only.
 *
 *   npx tsx scripts/add-user.ts alok@example.com A          # prompts for a password
 *   npx tsx scripts/add-user.ts rajeev@example.com R --password='long-secret'
 *   npx tsx scripts/add-user.ts someone@example.com --remove  # revoke access
 */
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => a.includes("@"))?.toLowerCase();
  const code = args.find((a) => /^[A-Z]$/.test(a));
  const remove = args.includes("--remove");
  let password = args.find((a) => a.startsWith("--password="))?.split("=").slice(1).join("=");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role) in .env.local");
  if (!email || (!remove && !code)) throw new Error("Usage: add-user.ts <email> <partner code A|R> [--password=…] | <email> --remove");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);

  if (remove) {
    if (!existing) return console.log(`No user ${email}`);
    await admin.from("app_users").delete().eq("id", existing.id);
    await admin.auth.admin.deleteUser(existing.id);
    return console.log(`✓ Removed ${email}`);
  }

  const { data: partner, error: pErr } = await admin.from("partners").select("id, name").eq("code", code!).single();
  if (pErr || !partner) throw new Error(`No partner with code ${code}`);

  let userId = existing?.id;
  if (!userId) {
    if (!password) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      password = await rl.question("Password (12+ characters): ");
      rl.close();
    }
    if (!password || password.length < 12) throw new Error("Use a password of at least 12 characters");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: upErr } = await admin.from("app_users").upsert({ id: userId, partner_id: partner.id, role: "admin" });
  if (upErr) throw upErr;
  console.log(`✓ ${email} can now sign in as ${partner.name}`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
