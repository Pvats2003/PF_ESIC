import type { Metadata } from "next";
import { DesignGuide } from "./design-guide";

export const metadata: Metadata = { title: "Style guide" };

export default function DesignPage() {
  return <DesignGuide />;
}
