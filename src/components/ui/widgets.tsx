"use client";

/**
 * Shared interface widgets: animated tabs, number ticker, empty state and the status timeline of a ticket.
 */

import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------ Animated Tabs ------------------------------ */

export function AnimatedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = "md",
}: {
  tabs: { value: T; label: React.ReactNode; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="tablist" className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none]", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-1.5 text-sm",
              active ? "text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-accent" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {Icon && <Icon className="size-4" />}
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Number Ticker ------------------------------ */

export function NumberTicker({ value, className, suffix }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {shown.toLocaleString("ru-RU")}
      {suffix}
    </span>
  );
}

/* ------------------------------ Empty State ------------------------------ */

export function EmptyState({
  title,
  description,
  icons,
  action,
  className,
}: {
  title: string;
  description?: string;
  icons: LucideIcon[];
  action?: React.ReactNode;
  className?: string;
}) {
  const [A, B, C] = icons;
  return (
    <div className={cn("group flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center", className)}>
      <div className="isolate flex justify-center">
        {C && (
          <div className="relative left-2.5 top-1.5 grid size-12 -rotate-6 place-items-center rounded-xl border border-line bg-surface shadow-sm transition duration-300 group-hover:-translate-x-4 group-hover:-rotate-12">
            <C className="size-6 text-muted" />
          </div>
        )}
        <div className="relative z-10 grid size-12 place-items-center rounded-xl border border-line bg-surface shadow-sm transition duration-300 group-hover:-translate-y-1">
          <A className="size-6 text-accent" />
        </div>
        {B && (
          <div className="relative right-2.5 top-1.5 grid size-12 rotate-6 place-items-center rounded-xl border border-line bg-surface shadow-sm transition duration-300 group-hover:translate-x-4 group-hover:rotate-12">
            <B className="size-6 text-muted" />
          </div>
        )}
      </div>
      <h3 className="mt-6 font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------ Theme Switcher ------------------------------ */

export type TimelineStep = {
  key: string;
  title: string;
  description?: string;
  date?: string;
  note?: string;
  state: "done" | "current" | "upcoming" | "failed";
  color: string;
  icon: LucideIcon;
};

export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const Icon = s.state === "done" ? Check : s.state === "failed" ? X : s.icon;
        const filled = s.state === "done" || s.state === "current" || s.state === "failed";
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 overflow-hidden rounded bg-line">
                <motion.span
                  className="block w-full origin-top"
                  style={{ background: s.color, height: "100%" }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: s.state === "done" ? 1 : 0 }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                />
              </span>
            )}
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 400, damping: 24 }}
              className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2", !filled && "border-line bg-surface text-muted")}
              style={filled ? { borderColor: s.color, background: s.state === "current" ? "var(--surface)" : s.color, color: s.state === "current" ? s.color : "var(--surface)" } : undefined}
            >
              {s.state === "current" && <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={{ background: s.color }} />}
              <Icon className="size-4" strokeWidth={2.5} />
            </motion.span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={cn("font-medium", s.state === "upcoming" && "text-muted")}>{s.title}</p>
                {s.date && <time className="text-xs text-muted">{s.date}</time>}
              </div>
              {s.description && <p className="mt-0.5 text-sm text-muted">{s.description}</p>}
              {s.note && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">{s.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
