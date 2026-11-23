"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
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

interface LangCtx {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: T;
}

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, t: (k, v) => translate("en", k, v) });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as UiLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback<T>((k: string, v?: Vars) => translate(lang, k, v), [lang]);
  const value = useMemo(() => ({ lang, setLang: write, t }), [lang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/** For server components: `<T k="Back" />`. */
export function Tr({ k, vars }: { k: string; vars?: Vars }) {
  return <>{useLang().t(k, vars)}</>;
}
