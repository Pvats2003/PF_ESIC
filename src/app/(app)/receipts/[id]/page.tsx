import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { DetailSkeleton } from "@/components/app/page-states";
import { ReceiptShare } from "@/components/payment/receipt-share";
import { Tr } from "@/components/providers/lang-provider";

export const metadata: Metadata = { title: "Receipt" };

export default function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <div className="mx-auto max-w-[600px]">
      <Suspense fallback={<DetailSkeleton />}>
        <ReceiptLoader params={params} />
      </Suspense>
    </div>
  );
}

async function ReceiptLoader({ params }: { params: PageProps<"/receipts/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (
    <>
      <Link href="/" className="mb-4 inline-flex h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"><ChevronLeft className="size-4" /><Tr k="Back" /></Link>
      <h1 className="mb-4 text-lg font-semibold"><Tr k="Receipt" /></h1>
      <ReceiptShare receiptId={id} allowReissue />
    </>
  );
}
