"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { dictionaries, type Dict, type Locale } from "@/lib/i18n";
import type { CategoryDef, Settings, User } from "@/lib/types";

/* ------------------------------ i18n ------------------------------ */

type I18n = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  d: Dict;
  t: (path: string, params?: Record<string, string | number>) => string;
  rel: (iso: string) => string;
  date: (iso: string, withTime?: boolean) => string;
};

const I18nCtx = createContext<I18n | null>(null);

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

const intlLocale = (l: Locale) => (l === "kk" ? "kk-KZ" : "ru-RU");

const KK_MONTHS = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
const KK_UNITS = {
  minute: ["минут", "минуттан"],
  hour: ["сағат", "сағаттан"],
  day: ["күн", "күннен"],
  month: ["ай", "айдан"],
} as const;

/** Kazakh relative time: "3 сағат бұрын" / "3 сағаттан кейін". */
function kkRelative(n: number, unit: "now" | keyof typeof KK_UNITS) {
  if (unit === "now" || n === 0) return "жаңа ғана";
  if (unit === "day" && n === -1) return "кеше";
  if (unit === "day" && n === 1) return "ертең";
  const [past, future] = KK_UNITS[unit];
  return n < 0 ? `${-n} ${past} бұрын` : `${n} ${future} кейін`;
}

/* ------------------------------ app / session ------------------------------ */

type AppState = {
  me: User | null;
  users: User[];
  aiEnabled: boolean;
  unread: number;
  refreshMe: () => Promise<void>;
  loginAs: (id: string) => Promise<void>;
  isReviewer: boolean;
  isAdmin: boolean;
  /** Categories with routing rules, managed by the administrator. */
  categories: CategoryDef[];
  settings: Settings | null;
};

const AppCtx = createContext<AppState | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [aiEnabled, setAi] = useState(false);
  const [unread, setUnread] = useState(0);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    // The tab title follows the language at once, without a page reload.
    document.title = `MODUS TRADE — ${dictionaries[l].brand}`;
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" });
    const j = await r.json();
    setMe(j.user);
    setUsers(j.users);
    setAi(j.aiEnabled);
    setUnread(j.unread);
    setCategories(j.categories ?? []);
    setSettings(j.settings ?? null);
  }, []);

  const loginAs = useCallback(
    async (id: string) => {
      await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
      await refreshMe();
      window.dispatchEvent(new Event("app:refresh"));
    },
    [refreshMe],
  );

  useEffect(() => {
    refreshMe();
    const id = setInterval(refreshMe, 30_000);
    return () => clearInterval(id);
  }, [refreshMe]);

  const i18n = useMemo<I18n>(() => {
    const d = dictionaries[locale];
    const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
    return {
      locale,
      setLocale,
      d,
      t: (path, params) => {
        let v: unknown = d;
        for (const k of path.split(".")) v = (v as Record<string, unknown>)?.[k];
        let s = typeof v === "string" ? v : path;
        if (params) for (const [k, val] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(val));
        return s;
      },
      rel: (iso) => {
        const diff = (new Date(iso).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        const [n, unit] =
          abs < 60 ? [0, "now" as const]
          : abs < 3600 ? [Math.round(diff / 60), "minute" as const]
          : abs < 86400 ? [Math.round(diff / 3600), "hour" as const]
          : abs < 86400 * 30 ? [Math.round(diff / 86400), "day" as const]
          : [Math.round(diff / (86400 * 30)), "month" as const];
        if (locale === "kk") return kkRelative(n, unit);
        return unit === "now" ? "только что" : rtf.format(n, unit);
      },
      date: (iso, withTime) => {
        const dt = new Date(iso);
        const time = withTime ? `, ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "";
        // Browsers ship incomplete Kazakh CLDR data, so month names are spelled out by hand.
        if (locale === "kk") return `${dt.getDate()} ${KK_MONTHS[dt.getMonth()]}${time}`;
        return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(dt) + time;
      },
    };
  }, [locale, setLocale]);

  const app: AppState = {
    me,
    users,
    aiEnabled,
    unread,
    refreshMe,
    loginAs,
    isReviewer: me?.role === "reviewer" || me?.role === "admin",
    isAdmin: me?.role === "admin",
    categories,
    settings,
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nCtx.Provider value={i18n}>
        <AppCtx.Provider value={app}>
          {children}
          <Toaster richColors position="bottom-right" closeButton />
        </AppCtx.Provider>
      </I18nCtx.Provider>
    </ThemeProvider>
  );
}

/** Category name in the current language; unknown ids are shown as is. */
export function useCatName() {
  const { categories } = useApp();
  const { locale } = useI18n();
  return useCallback(
    (id: string) => {
      const c = categories.find((x) => x.id === id);
      return c ? c.name[locale] || c.name.ru : id;
    },
    [categories, locale],
  );
}

/* ------------------------------ data hook ------------------------------ */

export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!url);

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        setError(r.status);
        setData(null);
      } else {
        setError(null);
        setData(await r.json());
      }
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("app:refresh", onRefresh);
    return () => window.removeEventListener("app:refresh", onRefresh);
  }, [load]);

  return { data, setData, error, loading, reload: load };
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
