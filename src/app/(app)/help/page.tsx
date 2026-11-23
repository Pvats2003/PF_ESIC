import type { Metadata } from "next";
import { HelpView } from "@/components/help/help-view";

export const metadata: Metadata = { title: "How it works" };

export default function HelpPage() {
  return <HelpView />;
}
