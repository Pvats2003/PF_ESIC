import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import type { ClientListRow } from "@/components/clients/clients-list";
import { PhoneEntry } from "@/components/clients/phone-entry";
import { getDb } from "@/lib/data/db";

export const metadata: Metadata = { title: "Phones" };

export default function PhonesPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <PhonesLoader />
    </Suspense>
  );
}

async function PhonesLoader() {
  const db = await getDb();
  if (!db) return <NoDatabase />;
  return <PhoneEntry rows={await db.rpc<ClientListRow[]>("clients_overview")} />;
}
