"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LANG_COOKIE, LANG_STORAGE, translate, type T, type UiLang, type Vars } from "@/lib/i18n/translate";

/**
 * The screen language is a per-device choice (each partner picks on their own
 * phone/computer). Stored in localStorage, mirrored to a cookie for later
 * server use. The prerendered shell is English; Hindi applies on hydration.
 */
const listeners = new Set<() => void>();

function read(): UiLang {
  try {
    return localStorage.getItem(LANG_STORAGE) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

function write(lang: UiLang) {
  try {
    localStorage.setItem(LANG_STORAGE, lang);
  } catch {}
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === LANG_STORAGE && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Every component reads the language through the store itself (not a context):
 * a part of the page that streams in later then hydrates with the server's
 * English first and switches right after, instead of mismatching the HTML.
 */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as UiLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <>{children}</>;
}

export function useLang(): { lang: UiLang; setLang: (l: UiLang) => void; t: T } {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as UiLang);
  const t = useCallback<T>((k: string, v?: Vars) => translate(lang, k, v), [lang]);
  return useMemo(() => ({ lang, setLang: write, t }), [lang, t]);
}

/** For server components: `<Tr k="Back" />`. */
export function Tr({ k, vars }: { k: string; vars?: Vars }) {
  return <>{useLang().t(k, vars)}</>;
}
