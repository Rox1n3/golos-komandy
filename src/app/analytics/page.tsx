"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { BarChart3, ChartColumn, EyeOff, HeartPulse, Repeat, ShieldCheck, Sparkles, TriangleAlert, UsersRound, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useCatName, useFetch, useI18n } from "@/components/providers";
import { EmptyState, NumberTicker } from "@/components/ui/widgets";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { PageHeader, formatTenge, statusColor } from "@/components/feedback-bits";
import { Donut, TrendChart } from "@/components/charts";
import type { Category, Department, FeedbackType, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stats = {
  total: number; active: number; overdue: number; done: number; avgFirstResponseH: number;
  escalated: number; savings: number; csat: number | null; csatCount: number; reopened: number;
  byDepartment: { key: Department; value: number }[];
  byStatus: { key: Status; value: number }[];
  byCategory: { key: Category; value: number }[];
  weeks: { start: string; created: number; closed: number }[];
  // Indicators of the spec: share reviewed, time to first response, share with a recorded result, implemented.
  reviewedShare: number; resolvedShare: number; closedShare: number; implemented: number; needsInfo: number;
  byType: { key: FeedbackType; value: number }[];
  byAssignee: { id: string; name: string; color: string; open: number; overdue: number; away: boolean }[];
  repeatCategories: { key: string; count: number; open: number; codes: string[] }[];
  repeatTags: { tag: string; count: number; codes: string[] }[];
};
type Digest = { summary: string; themes: { title: string; count: number; insight: string }[]; risks: string[]; actions: string[]; source: string };

function HBars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-3 rounded-r bg-surface-2">
            <motion.span
              className="block h-full rounded-r-[4px]"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              whileInView={{ width: `${(r.value / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics() {
  const { d, t, locale, date } = useI18n();
  const { isReviewer, users, loginAs, me } = useApp();
  const cat = useCatName();
  const { data } = useFetch<Stats>("/api/stats");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && !isReviewer) {
    const reviewer = users.find((u) => u.role === "reviewer");
    return (
      <EmptyState
        icons={[ChartColumn, ShieldCheck, EyeOff]}
        title={d.board.noAccess}
        description={d.board.noAccessHint}
        action={reviewer && <Button onClick={() => loginAs(reviewer.id)}>{d.board.switch}</Button>}
        className="mt-10"
      />
    );
  }

  // The indicators the business asked for (share reviewed, time to first response, share with a result, implemented).
  const kpis = data && [
    { v: data.total, l: d.analytics.total },
    { v: data.reviewedShare, l: d.analytics.reviewedShare, hint: d.analytics.reviewedHint },
    { v: data.avgFirstResponseH, l: d.analytics.firstResponse },
    { v: data.resolvedShare, l: d.analytics.resolvedShare, hint: d.analytics.resolvedHint },
    { v: data.implemented, l: d.analytics.implemented },
    { v: data.closedShare, l: d.analytics.closedShare },
  ];
  // Current state of the queue. Escalation is part of the overdue tile: on the same tickets it would only repeat the number.
  const tiles = data && [
    { v: data.active, l: d.analytics.active },
    {
      v: data.overdue,
      l: d.analytics.overdue,
      sub: data.escalated > 0 ? t("analytics.escalatedOf", { n: data.escalated }) : undefined,
      warn: data.overdue > 0,
      href: "/ideas?overdue=1",
    },
    { v: data.needsInfo, l: d.analytics.needsInfo, href: "/ideas?status=needs_info" },
  ];

  return (
    <>
      <PageHeader title={d.analytics.title} subtitle={d.analytics.subtitle} />
      <p className="mb-3 text-sm font-semibold">{d.analytics.kpiTitle}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {!kpis && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        {kpis?.map((k) => (
          <Card key={k.l} className="p-4">
            <NumberTicker value={k.v} className="font-display text-2xl font-semibold" />
            <p className="mt-1 text-[13px] leading-snug">{k.l}</p>
            {k.hint && <p className="mt-0.5 text-xs text-muted">{k.hint}</p>}
          </Card>
        ))}
      </div>

      {data && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles?.map((x) => {
            const body = (
              <>
                <span className="flex items-center gap-1.5">
                  {x.warn && <TriangleAlert className="size-4 text-danger" />}
                  <NumberTicker value={x.v} className="font-display text-2xl font-semibold" />
                </span>
                <p className="mt-1 text-[13px] leading-snug text-muted">{x.l}</p>
                {"sub" in x && x.sub && <p className="mt-0.5 text-xs font-medium text-danger">{x.sub}</p>}
              </>
            );
            return x.href ? (
              <Link key={x.l} href={x.href} className={cn("rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/60", x.warn && "border-danger/50")}>
                {body}
              </Link>
            ) : (
              <Card key={x.l} className={cn("p-4", x.warn && "border-danger/50")}>{body}</Card>
            );
          })}
          {data.savings > 0 && (
            <Card className="p-4">
              <p className="font-display text-2xl font-bold text-accent tabular-nums">{formatTenge(data.savings)}</p>
              <p className="mt-1 text-[13px] text-muted">{d.analytics.savings}</p>
            </Card>
          )}
          <Card className="p-4">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold tabular-nums">{data.csat !== null ? String(data.csat).replace(".", ",") : "—"}</span>
              {data.csatCount > 0 && <span className="text-xs text-muted tabular-nums">n={data.csatCount}</span>}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {data.csat !== null ? d.analytics.csat : d.analytics.csatNone}
              {data.reopened > 0 && <span className="block text-accent">{data.reopened} {d.analytics.reopened}</span>}
            </p>
          </Card>
        </div>
      )}

      <Card className="mt-6 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft/40 px-5 py-4">
          <Sparkles className="size-5 text-accent" />
          <div className="flex-1">
            <h2 className="font-semibold">{d.analytics.digest}</h2>
            {!digest && <p className="text-sm text-muted">{d.analytics.digestHint}</p>}
          </div>
          <Button
            variant={digest ? "outline" : "primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setDigest(await api<Digest>(`/api/ai/digest?locale=${locale}`, "GET"));
              } catch {
                toast.error(d.common.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <WandSparkles className={cn(busy && "animate-spin")} />
            {digest ? d.analytics.digestAgain : d.analytics.digestBtn}
          </Button>
        </div>
        {busy && !digest && <div className="space-y-2 p-5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>}
        {digest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 p-5">
            <p className="max-w-3xl text-[15px] leading-relaxed">{digest.summary}</p>
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="mb-2 text-sm font-semibold">{d.analytics.themes}</p>
                <ul className="space-y-2">
                  {digest.themes.map((th) => (
                    <li key={th.title} className="rounded-xl bg-surface-2 p-3 text-sm">
                      <p className="flex justify-between font-medium">{th.title} <span className="text-muted tabular-nums">{th.count}</span></p>
                      <p className="mt-0.5 text-muted">{th.insight}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{d.analytics.risks}</p>
                <ul className="space-y-2">
                  {digest.risks.map((r) => (
                    <li key={r} className="flex gap-2 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{d.analytics.actions}</p>
                <ol className="space-y-2">
                  {digest.actions.map((a, i) => (
                    <li key={a} className="flex gap-2 text-sm">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </Card>

      {data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card className="p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4" /> {d.analytics.weekly}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">{d.analytics.weeklyHint}</p>
            <TrendChart
              labels={data.weeks.map((w) => date(w.start))}
              series={[
                { key: "created", label: d.analytics.created, values: data.weeks.map((w) => w.created), style: "dashed" },
                { key: "closed", label: d.analytics.closed, values: data.weeks.map((w) => w.closed), style: "solid" },
              ]}
            />
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold"><Repeat className="size-4" /> {d.analytics.repeating}</h2>
            <p className="mb-4 mt-1 text-sm text-muted">{d.analytics.repeatingHint}</p>
            {data.repeatCategories.length + data.repeatTags.length === 0 ? (
              <p className="text-sm text-muted">{d.analytics.noRepeats}</p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.analytics.repeatCats}</p>
                  <ul className="divide-y divide-line">
                    {data.repeatCategories.map((r) => (
                      <li key={r.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                        <Link href={`/ideas?category=${r.key}`} className="font-medium hover:text-accent">{cat(r.key)}</Link>
                        <span className="tabular-nums text-muted">× {r.count}</span>
                        {r.open > 0 && <span className="text-xs text-accent">{t("analytics.repeatOpen", { n: r.open })}</span>}
                        <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
                          {r.codes.map((c) => <Link key={c} href={`/ideas/${c}`} className="tabular-nums text-muted hover:text-accent">{c}</Link>)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.analytics.repeatTags}</p>
                  <ul className="divide-y divide-line">
                    {data.repeatTags.map((r) => (
                      <li key={r.tag} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                        <Link href={`/ideas?q=${encodeURIComponent(r.tag)}`} className="font-medium hover:text-accent">#{r.tag}</Link>
                        <span className="tabular-nums text-muted">× {r.count}</span>
                        <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
                          {r.codes.map((c) => <Link key={c} href={`/ideas/${c}`} className="tabular-nums text-muted hover:text-accent">{c}</Link>)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{d.analytics.byType}</h2>
            <HBars rows={data.byType.map((x) => ({ label: d.types[x.key], value: x.value, color: x.key === "problem" ? "var(--danger)" : x.key === "praise" ? "var(--ok)" : "var(--sun)" }))} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{d.analytics.byCategory}</h2>
            <HBars rows={data.byCategory.map((c) => ({ label: cat(c.key), value: c.value, color: "var(--chart-1)" }))} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{d.analytics.byDepartment}</h2>
            <Donut rows={data.byDepartment.sort((a, b) => b.value - a.value).map((c) => ({ label: d.departments[c.key], value: c.value }))} centerLabel={d.analytics.openTotal} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{d.analytics.byStatus}</h2>
            <HBars rows={data.byStatus.map((s) => ({ label: d.status[s.key], value: s.value, color: statusColor(s.key) }))} />
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><UsersRound className="size-4" /> {d.analytics.byAssignee}</h2>
            <ul className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
              {data.byAssignee.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0 flex-1 basis-40 truncate">
                    {a.name}
                    {a.away && <span className="ml-1.5 text-xs text-muted">· {d.analytics.awayMark}</span>}
                  </span>
                  <span className="tabular-nums text-muted">{a.open} {d.analytics.openShort}</span>
                  <span className={cn("text-right tabular-nums sm:w-24", a.overdue ? "font-medium text-danger" : "text-muted")}>
                    {a.overdue} {d.analytics.overdueShort}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <PulseSection />
    </>
  );
}

type PulseStats = {
  current: number | null;
  trend: { week: string; avg: number | null; count: number }[];
  byDepartment: { key: Department; avg: number | null; count: number }[];
  comments: { text: string; score: number; at: string }[];
};

function PulseSection() {
  const { d, locale, date, rel } = useI18n();
  const { data } = useFetch<PulseStats>("/api/pulse");
  const [insight, setInsight] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const H = 120;

  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold">
        <HeartPulse className="size-5 text-accent" /> {d.analytics.pulse}
      </h2>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5">
          <div className="flex items-baseline gap-3">
            <p className="font-display text-3xl font-bold tabular-nums">{data.current ?? [...data.trend].reverse().find((w) => w.avg)?.avg ?? "—"}</p>
            <p className="text-sm text-muted">{d.analytics.pulseAvg}</p>
          </div>
          <p className="mb-3 mt-5 text-sm font-semibold">{d.analytics.pulseTrend}</p>
          <div className="flex items-end gap-2" style={{ height: H }}>
            {data.trend.map((w) => (
              <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${date(w.week)}: ${w.avg ?? "—"} (${w.count})`}>
                <span className="text-[11px] font-medium tabular-nums">{w.avg ?? ""}</span>
                <span className="w-full max-w-8 rounded-t-[4px] bg-[var(--chart-1)]" style={{ height: w.avg ? ((w.avg - 1) / 4) * (H - 24) + 4 : 2 }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 border-t border-line pt-1.5 text-[10px] text-muted">
            {data.trend.map((w) => <span key={w.week} className="flex-1 text-center">{date(w.week)}</span>)}
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">{d.analytics.pulseByDep}</p>
          <ul className="space-y-2.5">
            {data.byDepartment.map((x) => (
              <li key={x.key} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate text-muted">{d.departments[x.key]}</span>
                {x.avg === null ? (
                  <span className="col-span-2 text-xs text-muted">{d.analytics.pulseHidden}</span>
                ) : (
                  <>
                    <span className="h-3 rounded-r bg-surface-2">
                      <span
                        className="block h-full rounded-r-[4px]"
                        style={{ width: `${((x.avg - 1) / 4) * 100}%`, background: x.avg < 3 ? "var(--danger)" : "var(--chart-1)" }}
                      />
                    </span>
                    <span className="text-right font-medium tabular-nums">{x.avg}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2/60 px-5 py-3.5">
            <Sparkles className="size-4 text-accent" />
            <p className="flex-1 font-semibold">{d.analytics.pulseAi}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setInsight((await api<{ text: string }>(`/api/ai/pulse?locale=${locale}`, "GET")).text);
                } catch {
                  toast.error(d.common.error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <WandSparkles className={cn(busy && "animate-spin")} /> {d.analytics.pulseAiBtn}
            </Button>
          </div>
          <div className={cn("grid gap-5 p-5", insight && "md:grid-cols-2")}>
            {insight && <p className="text-[15px] leading-relaxed">{insight}</p>}
            <div>
              <p className="mb-2 text-sm font-semibold">{d.analytics.pulseComments}</p>
              <ul className="space-y-2">
                {data.comments.slice(0, 5).map((c, i) => (
                  <li key={i} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    «{c.text}» <span className="text-xs text-muted">{c.score}/5, {rel(c.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
