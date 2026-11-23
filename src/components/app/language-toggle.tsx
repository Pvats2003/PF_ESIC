"use client";

import { Languages } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

/** Compact switch for the sidebar / phone header: shows the language you'd switch TO. */
export function LanguageToggle({ className, short }: { className?: string; short?: boolean }) {
  const { lang, setLang, t } = useLang();
  const next = lang === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={t("Change screen language")}
      title={t("Change screen language")}
      className={cn("inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink", className)}
    >
      <Languages aria-hidden className="size-[18px] stroke-[1.75]" />
      <span lang={next} className={next === "hi" ? "font-hindi" : undefined}>{next === "hi" ? (short ? "हिं" : "हिंदी") : short ? "EN" : "English"}</span>
    </button>
  );
}

/** Full choice, for Settings and More. */
export function LanguageChoice() {
  const { lang, setLang, t } = useLang();
  return (
    <Segmented
      ariaLabel={t("Screen language")}
      value={lang}
      onChange={setLang}
      options={[
        { value: "hi", label: <span lang="hi" className="font-hindi">हिंदी</span> },
        { value: "en", label: "English" },
      ]}
    />
  );
}
