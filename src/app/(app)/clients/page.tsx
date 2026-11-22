import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import { ClientsList, type ClientListRow } from "@/components/clients/clients-list";
import { getDb } from "@/lib/data/db";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ClientsLoader />
    </Suspense>
  );
}

async function ClientsLoader() {
  const db = await getDb();
  if (!db) return <NoDatabase />;
  return <ClientsList rows={await db.rpc<ClientListRow[]>("clients_overview")} />;
}
