import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ClientDetail } from "@/app/(app)/actions";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import { ClientView } from "@/components/clients/client-view";
import { getDb } from "@/lib/data/db";

export const metadata: Metadata = { title: "Client" };

export default function ClientPage({ params }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ClientLoader params={params} />
    </Suspense>
  );
}

async function ClientLoader({ params }: { params: PageProps<"/clients/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  if (!db) return <NoDatabase />;
  const d = await db.rpc<ClientDetail>("client_detail", { p_client_id: id });
  if (!d?.client) notFound();
  return <ClientView d={d} />;
}
