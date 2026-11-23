import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import { SettingsView, type SettingsData } from "@/components/settings/settings-view";
import { getDb } from "@/lib/data/db";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SettingsLoader />
    </Suspense>
  );
}

async function SettingsLoader() {
  const db = await getDb();
  if (!db) return <NoDatabase />;
  return <SettingsView data={await db.rpc<SettingsData>("settings_get")} />;
}
