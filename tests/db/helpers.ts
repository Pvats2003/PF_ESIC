import { Client } from "pg";
import { testDbUrl } from "../../scripts/db-test-setup";

export async function connect(): Promise<Client> {
  const c = new Client({ connectionString: testDbUrl() });
  await c.connect();
  return c;
}

/** Run `fn` inside a transaction as a given API role, then roll back. */
export async function asRole<T>(
  c: Client,
  role: "anon" | "authenticated",
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await c.query("begin");
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await c.query(`set local role ${role}`);
    return await fn();
  } finally {
    await c.query("rollback");
  }
}

export const ALOK_USER = "00000000-0000-4000-8000-00000000000a";
export const STRANGER_USER = "00000000-0000-4000-8000-0000000000ff";

/** Admin-side fixtures: an allow-listed user, a non-listed user, one client. */
export async function seedBasics(c: Client): Promise<{ clientId: string; alokId: string }> {
  await c.query(`insert into auth.users (id, email) values ($1,'alok@example.com'),($2,'stranger@example.com') on conflict do nothing`, [ALOK_USER, STRANGER_USER]);
  const { rows: [p] } = await c.query(`select id from partners where code='A'`);
  await c.query(`insert into app_users (id, partner_id) values ($1,$2) on conflict do nothing`, [ALOK_USER, p.id]);
  const { rows: [cl] } = await c.query(
    `insert into clients (firm_name, default_charge_paise, handled_by_partner_id) values ('TEST FIRM', 50000, $1) returning id`, [p.id]);
  return { clientId: cl.id, alokId: p.id };
}

export async function insertPayment(c: Client, clientId: string, partnerId: string, on: string): Promise<string> {
  const { rows: [pay] } = await c.query(
    `insert into payments (client_id, amount_paise, received_on, mode, received_by_partner_id, idempotency_key)
     values ($1, 50000, $2, 'cash', $3, gen_random_uuid()) returning id`, [clientId, on, partnerId]);
  return pay.id;
}
