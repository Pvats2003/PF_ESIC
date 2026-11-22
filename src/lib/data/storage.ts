import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { supabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Private file storage for challan proofs (PDF / screenshots).
 *   production  → Supabase Storage bucket (private; RLS allows only app users)
 *   development → ./.local-uploads (gitignored)
 */
export async function uploadPrivateFile(bucket: "challans", path: string, file: File): Promise<string> {
  if (!/^[a-z0-9/_.-]+$/i.test(path) || path.includes("..")) throw new Error("Bad file path");
  if (!supabaseEnv()) {
    const target = join(process.cwd(), ".local-uploads", bucket, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));
    return `${bucket}/${path}`;
  }
  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return `${bucket}/${path}`;
}

/** Short-lived link to view a private file (null in local development). */
export async function signedUrl(fullPath: string, seconds = 600): Promise<string | null> {
  if (!supabaseEnv()) return null;
  const [bucket, ...rest] = fullPath.split("/");
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), seconds);
  return data?.signedUrl ?? null;
}
