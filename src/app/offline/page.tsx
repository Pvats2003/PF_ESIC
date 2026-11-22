import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <EmptyState icon={WifiOff} title="You're offline" body="Check your internet connection. Your money data is never stored on the phone, so it loads once you're back online." />
    </main>
  );
}
