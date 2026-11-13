"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, BotMessageSquare, ChartColumn, Megaphone, ChevronsUpDown, ClipboardList, KeyRound, House, Kanban, LogOut, Menu, MessageSquare, Monitor, Moon, PenLine, Search, Settings2, Sun, Trophy, X,
  type LucideIcon,
} from "lucide-react";
import { api, useApp, useFetch, useI18n } from "./providers";
import { useTheme } from "next-themes";
import { Avatar, Dialog } from "./ui/primitives";
import { StatusBadge } from "./feedback-bits";
import { Assistant } from "./assistant";
import { cn } from "@/lib/utils";
import type { FeedbackView, Notification } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

type NavItem = { href: string; key: keyof ReturnType<typeof useI18n>["d"]["nav"]; icon: LucideIcon; reviewer?: boolean; admin?: boolean };

const NAV: NavItem[] = [
  { href: "/", key: "home", icon: House },
  { href: "/ideas", key: "feed", icon: MessageSquare },
  { href: "/campaigns", key: "campaigns", icon: Megaphone },
  { href: "/submit", key: "submit", icon: PenLine },
  { href: "/my", key: "my", icon: ClipboardList },
  { href: "/track", key: "track", icon: KeyRound },
  { href: "/impact", key: "impact", icon: Trophy },
  { href: "/board", key: "board", icon: Kanban, reviewer: true },
  { href: "/analytics", key: "analytics", icon: ChartColumn, reviewer: true },
  { href: "/copilot", key: "copilot", icon: BotMessageSquare, reviewer: true },
  { href: "/settings", key: "settings", icon: Settings2, reviewer: true, admin: true },
];

function Logo() {
  const { d } = useI18n();
  return (
    <Link href="/" className="block">
      <span className="flex items-center gap-2">
        <span className="h-6 w-1.5 rounded-full bg-accent" aria-hidden />
        <span className="font-display text-[19px] font-extrabold tracking-tight text-side-ink">
          MODUS <span className="font-semibold text-side-muted">TRADE</span>
        </span>
      </span>
      <span className="mt-1.5 block pl-3.5 text-[13px] font-medium leading-tight text-side-ink">{d.brand}</span>
      <span className="block pl-3.5 text-[11px] leading-tight text-side-muted">{d.brandTag}</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { d } = useI18n();
  const pathname = usePathname();
  const navPillId = `nav-active-${useId()}`;
  const { isReviewer, isAdmin } = useApp();
  // Management pages are only listed for reviewers and admins; employees never see tabs they cannot open.
  const groups = [
    { label: d.nav.groupMain, items: NAV.filter((n) => !n.reviewer) },
    { label: d.nav.groupManage, items: isReviewer ? NAV.filter((n) => n.reviewer && (!n.admin || isAdmin)) : [] },
  ].filter((g) => g.items.length > 0);
  return (
    <nav className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 px-3 text-[11px] font-semibold text-side-muted">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "text-white" : "text-side-muted hover:bg-white/5 hover:text-side-ink",
                    )}
                  >
                    {active && (
                      <motion.span layoutId={navPillId} className="absolute inset-0 rounded-lg bg-side-2" transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}>
                        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent" />
                      </motion.span>
                    )}
                    <n.icon className="relative size-[18px]" />
                    <span className="relative">{d.nav[n.key]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Header controls follow the Linear / Vercel / GitHub pattern: bare icons, no boxes, hover tint only. */
const iconBtn =
  "relative grid size-10 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:text-ink";

function LanguageSwitch() {
  const { locale, setLocale, d } = useI18n();
  const opts: { key: Locale; label: string }[] = [
    { key: "ru", label: "РУС" },
    { key: "kk", label: "ҚАЗ" },
  ];
  return (
    <div className="flex items-center" role="group" aria-label={d.common.language}>
      {opts.map((o, i) => (
        <span key={o.key} className="flex items-center">
          {i > 0 && <span className="h-3.5 w-px bg-line" aria-hidden />}
          <button
            onClick={() => setLocale(o.key)}
            aria-pressed={locale === o.key}
            className={cn(
              "relative h-10 px-2.5 text-[13px] font-semibold tracking-wide transition-colors",
              locale === o.key ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
            <span
              className={cn(
                "absolute inset-x-2.5 bottom-1.5 h-[2px] origin-center bg-accent transition-transform duration-200",
                locale === o.key ? "scale-x-100" : "scale-x-0",
              )}
              aria-hidden
            />
          </button>
        </span>
      ))}
    </div>
  );
}

/** One icon that cycles light, dark, system, like GitHub and Vercel dashboards. */
function ThemeToggle() {
  const { d } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const order = ["light", "dark", "system"] as const;
  type Mode = (typeof order)[number];
  const cur: Mode = mounted && order.includes(theme as Mode) ? (theme as Mode) : "system";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  const Icon = cur === "light" ? Sun : cur === "dark" ? Moon : Monitor;
  const label = `${d.common.theme}: ${d.common[cur]}`;
  return (
    <button onClick={() => setTheme(next)} className={iconBtn} title={label} aria-label={label}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={cur}
          initial={{ rotate: -60, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 60, opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.18 }}
          className="grid place-items-center"
        >
          <Icon className="size-[19px]" strokeWidth={1.8} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.parentElement?.contains(e.target as Node) && onClose();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className={cn("absolute right-0 top-full z-40 mt-2 rounded-2xl border border-line bg-surface p-2 shadow-xl", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Notifications() {
  const { d, t, rel } = useI18n();
  const { unread, refreshMe, me } = useApp();
  const [open, setOpen] = useState(false);
  const { data, reload } = useFetch<(Notification & { title: string; number?: number; code?: string })[]>(open ? `/api/notifications?u=${me?.id}` : null);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn(iconBtn, open && "bg-surface-2 text-ink")} aria-label={d.notifications.title}>
        <Bell className="size-[19px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">{unread}</span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(22rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="font-semibold">{d.notifications.title}</p>
          {unread > 0 && (
            <button
              className="text-xs text-accent hover:underline"
              onClick={async () => {
                await api("/api/notifications", "POST");
                await refreshMe();
                reload();
              }}
            >
              {d.notifications.markRead}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {data?.length ? (
            data.map((n) => (
              <Link
                key={n.id}
                href={`/ideas/${n.feedbackId}`}
                onClick={() => setOpen(false)}
                className={cn("flex gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2", !n.read && "bg-accent-soft/60")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {n.kind === "escalation"
                      ? t("notifications.escalation", { n: n.code ?? "" })
                      : n.kind === "clarify"
                        ? t("notifications.clarify", { n: n.code ?? "" })
                        : n.kind === "assigned" || (n.kind === "status" && n.status === "new")
                          ? t("notifications.assigned", { n: n.code ?? "" })
                          : n.kind === "status" && n.status
                            ? t("notifications.status", { n: n.code ?? "", status: d.status[n.status] })
                            : t("notifications.comment", { n: n.code ?? "" })}
                  </span>
                  <span className="block truncate text-xs text-muted">{n.title}</span>
                  <span className="block text-[11px] text-muted">{rel(n.at)}</span>
                </span>
              </Link>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted">{d.notifications.empty}</p>
          )}
        </div>
      </Popover>
    </div>
  );
}

/** Account block pinned to the bottom of the sidebar. The demo has no passwords, so the exit icon opens the user switcher. */
function SidebarAccount() {
  const { d } = useI18n();
  const { me, users, loginAs } = useApp();
  const [open, setOpen] = useState(false);
  const initials = (me?.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={d.common.profile}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08]",
          open && "bg-white/[0.08]",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-[12px] font-semibold tracking-wide text-side-ink">
          {initials}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold text-side-ink">{me?.name ?? "…"}</span>
          <span className="block truncate text-[12px] text-side-muted">{me ? (d.roles[me.role] === me.name ? me.position : d.roles[me.role]) : ""}</span>
        </span>
        <LogOut className="size-4 shrink-0 text-side-muted transition-colors group-hover:text-side-ink" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="bottom-full left-0 right-0 top-auto mb-2 mt-0 w-auto">
        <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-xs text-muted">
          <ChevronsUpDown className="size-3.5" /> {d.common.loginAs}
        </p>
        <div className="max-h-[60vh] overflow-auto">
          {/* Demo users are conditional roles from the dataset, grouped by access level. */}
          {(["employee", "reviewer", "admin"] as const).map((role) => (
            <div key={role}>
              <p className="sticky top-0 bg-surface px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{d.roles[role]}</p>
              {users.filter((u) => u.role === role).map((u) => (
                <button
                  key={u.id}
                  onClick={async () => {
                    await loginAs(u.id);
                    setOpen(false);
                  }}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2", u.id === me?.id && "bg-surface-2")}
                >
                  <Avatar name={u.name} color={u.color} size={26} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-medium">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted">{u.position}{u.away ? ` · ${d.settings.away.toLowerCase()}` : ""}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const { data } = useFetch<FeedbackView[]>(open ? `/api/feedback?sort=top` : null);
  const { isReviewer, isAdmin } = useApp();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = NAV.filter((n) => (isReviewer || !n.reviewer) && (!n.admin || isAdmin) && (!s || d.nav[n.key].toLowerCase().includes(s))).map((n) => ({ kind: "page" as const, href: n.href, label: d.nav[n.key], icon: n.icon }));
    const tickets = (data ?? [])
      .filter((f) => !s || `${f.title} ${f.code} #${f.number} ${f.tags.join(" ")}`.toLowerCase().includes(s))
      .slice(0, 6)
      .map((f) => ({ kind: "ticket" as const, href: `/ideas/${f.id}`, label: f.title, f }));
    return [...pages, ...tickets];
  }, [q, data, d, isReviewer, isAdmin]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl p-0">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-5 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && results[idx]) go(results[idx].href);
          }}
          placeholder={d.palette.placeholder}
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
        <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
      </div>
      <div className="max-h-[50vh] overflow-auto p-2">
        {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">{d.palette.nothing}</p>}
        {results.map((r, i) => (
          <div key={r.href}>
            {(i === 0 || results[i - 1].kind !== r.kind) && (
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{r.kind === "page" ? d.palette.pages : d.palette.tickets}</p>
            )}
            <button
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(r.href)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", i === idx && "bg-surface-2")}
            >
              {r.kind === "page" ? <r.icon className="size-4 text-muted" /> : <span className="w-12 text-xs tabular-nums text-muted">{r.f.code}</span>}
              <span className="flex-1 truncate">{r.label}</span>
              {r.kind === "ticket" && <StatusBadge status={r.f.status} />}
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** Current section name in the header, so its left side tells you where you are. */
function Crumb() {
  const { d } = useI18n();
  const pathname = usePathname();
  const item = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  return (
    <p className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
      <span className="hidden sm:inline">{d.brand}</span>
      {item && (
        <>
          <span className="hidden text-line sm:inline">/</span>
          <span className="truncate font-medium text-ink">{d.nav[item.key]}</span>
        </>
      )}
    </p>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { d } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-side px-3 py-6 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <div className="mt-9 flex-1 overflow-auto">
          <NavLinks />
        </div>
        <div className="mt-4">
          <SidebarAccount />
        </div>
      </aside>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-side px-3 py-6"
            >
              <div className="flex items-start justify-between px-2">
                <Logo />
                <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-side-ink hover:bg-white/10" aria-label={d.common.close}>
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-8 flex-1 overflow-auto">
                <NavLinks onNavigate={() => setDrawer(false)} />
              </div>
              <div className="mt-4">
                <SidebarAccount />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
          <button className={cn(iconBtn, "-ml-2 lg:hidden")} onClick={() => setDrawer(true)} aria-label={d.common.menu}>
            <Menu className="size-5" />
          </button>
          <Crumb />
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitch />
            <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
            <ThemeToggle />
            <Notifications />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {!pathname.startsWith("/copilot") && <Assistant />}
    </div>
  );
}
