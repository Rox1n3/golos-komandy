"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bell, CircleCheck, CircleHelp, Heart, Hourglass, KeyRound, Lightbulb, MessageSquare, Siren, Star, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { useApp, useFetch, useI18n } from "@/components/providers";
import { Button, Input, Skeleton } from "@/components/ui/primitives";
import { statusColor } from "@/components/feedback-bits";
import { useDeadlineText } from "@/components/campaign-bits";
import { PulseWidget, type Stats } from "./pulse";
import { isFinal, type CampaignView, type FeedbackView, type Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ============================================================================ shared data */

type Note = Notification & { title: string; number?: number; code?: string };
type Attention = { key: string; href: string; icon: LucideIcon; tone: string; label: string; title: string; at: string };

function useHello() {
  const { d } = useI18n();
  const { me } = useApp();
  const h = new Date().getHours();
  const hello = h < 12 ? d.home.greetMorning : h < 18 ? d.home.greetDay : d.home.greetEvening;
  // Demo users are conditional roles ("Сотрудник закупок"), so the full name is used.
  return `${hello}${me ? `, ${me.name}` : ""}`;
}

function useMine() {
  const { me } = useApp();
  return useFetch<FeedbackView[]>(me ? `/api/feedback?mine=1&sort=updated&u=${me.id}` : null).data;
}

/** What waits for the user: unread replies and status changes, closed tickets to rate, overdue tickets. */
function useAttention(mine: FeedbackView[] | null) {
  const { d, t } = useI18n();
  const { me } = useApp();
  const { data: notes } = useFetch<Note[]>(me ? `/api/notifications?u=${me.id}` : null);
  return useMemo(() => {
    if (!notes || !mine) return null;
    const out: Attention[] = [];
    const seen = new Set<string>();
    const push = (a: Attention) => {
      if (seen.has(a.key)) return;
      seen.add(a.key);
      out.push(a);
    };
    for (const f of mine) {
      const last = f.history[f.history.length - 1].at;
      const rateable = isFinal(f.status) && !f.mergedInto && (!f.rating || (f.rating.reopened && last > f.rating.at));
      if (f.status === "needs_info") push({ key: f.id, href: `/ideas/${f.id}`, icon: CircleHelp, tone: "text-accent", label: d.detail.clarifyTitle, title: `${f.code} ${f.title}`, at: last });
      if (rateable && f.type !== "praise") push({ key: f.id, href: `/ideas/${f.id}`, icon: Star, tone: "text-sun", label: d.homeX.rateIt, title: `${f.code} ${f.title}`, at: last });
      if (f.overdue) push({ key: f.id, href: `/ideas/${f.id}`, icon: Hourglass, tone: "text-accent", label: d.homeX.overdue, title: `${f.code} ${f.title}`, at: f.deadline ?? last });
    }
    for (const n of notes.filter((x) => !x.read)) {
      const isNew = n.kind === "assigned" || (n.kind === "status" && n.status === "new");
      push({
        key: n.feedbackId,
        href: `/ideas/${n.feedbackId}`,
        icon: n.kind === "comment" ? MessageSquare : n.kind === "escalation" ? Siren : n.kind === "clarify" ? CircleHelp : Bell,
        tone: n.kind === "escalation" ? "text-accent" : "text-ink",
        label:
          n.kind === "comment" ? d.homeX.reply : n.kind === "escalation" ? d.homeX.escalation : n.kind === "clarify" ? d.detail.clarifyTitle : isNew ? d.homeX.assigned : t("homeX.statusChanged", { status: n.status ? d.status[n.status] : "" }),
        title: `${n.code ?? ""} ${n.title}`,
        at: n.at,
      });
    }
    return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);
  }, [notes, mine, d, t]);
}

function useCampaigns() {
  return useFetch<CampaignView[]>("/api/campaigns").data?.filter((c) => c.active) ?? null;
}

function AttentionList({ items, dense }: { items: Attention[] | null; dense?: boolean }) {
  const { d, rel } = useI18n();
  if (!items) return <Skeleton className="h-24" />;
  if (!items.length)
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted">
        <CircleCheck className="size-4 text-[var(--st-done)]" /> {d.homeX.allClear}
      </p>
    );
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.key}>
          <Link href={a.href} className={cn("group flex items-center gap-3 hover:bg-surface-2/60", dense ? "py-2.5" : "px-1 py-3")}>
            <a.icon className={cn("size-4 shrink-0", dense && "self-start mt-0.5", a.tone)} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{a.label}</span>
              <span className={cn("block text-sm text-muted", dense ? "line-clamp-2" : "truncate")}>{a.title}</span>
              {dense && <span className="mt-0.5 block text-[11px] text-muted">{rel(a.at)}</span>}
            </span>
            {!dense && <span className="shrink-0 text-xs text-muted">{rel(a.at)}</span>}
            <ArrowRight className="size-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TrackInline() {
  const { d } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) router.push(`/track?code=${encodeURIComponent(code.trim())}`);
      }}
      className="flex items-center gap-2"
      title={d.home.trackTitle}
    >
      <KeyRound className="size-4 shrink-0 text-muted" />
      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GL-XXXX-XXXX" className="h-9 w-40 font-mono text-sm tracking-wider" aria-label={d.home.trackTitle} />
      <Button type="submit" variant="outline" size="sm" className="h-9">
        {d.home.trackBtn}
      </Button>
    </form>
  );
}

const ACTIONS = (d: ReturnType<typeof useI18n>["d"]) => [
  { href: "/submit?type=idea", icon: Lightbulb, title: d.home.actIdea, hint: d.home.actIdeaHint, hazard: false },
  { href: "/submit?type=problem", icon: TriangleAlert, title: d.home.actProblem, hint: d.home.actProblemHint, hazard: false },
  { href: "/submit?type=praise", icon: Heart, title: d.home.actPraise, hint: d.home.actPraiseHint, hazard: false },
  { href: "/submit?type=hazard", icon: Siren, title: d.home.actHazard, hint: d.home.actHazardHint, hazard: true },
];

function SectionTitle({ children, href, more }: { children: React.ReactNode; href?: string; more?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">{children}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-accent">
          {more} <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

/* ============================================================================ home page */

function weekNumber(dt = new Date()) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +y) / 86400000 + 1) / 7);
}

/** An internal newspaper: the campaign of the week as the lead story, then three columns of news. */
export function HomeEditorial() {
  const { d, t, rel, date, locale } = useI18n();
  const hello = useHello();
  const mine = useMine();
  const attention = useAttention(mine);
  const campaigns = useCampaigns();
  const left = useDeadlineText();
  const { data: stats } = useFetch<Stats>("/api/stats");
  const { data: top } = useFetch<FeedbackView[]>("/api/feedback?sort=top&status=new,review,needs_info,accepted,in_progress");
  const { data: done } = useFetch<FeedbackView[]>("/api/feedback?status=done&sort=updated");
  const lead = campaigns?.[0];
  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y-[3px] border-ink py-2 text-xs font-semibold uppercase tracking-[0.14em]">
        <span>{locale === "kk" ? date(new Date().toISOString()) : today}</span>
        <span className="text-accent">{t("homeX.issue", { n: weekNumber() })}</span>
      </div>
      <p className="mt-4 font-display text-lg text-muted">{hello}</p>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0">
          {!campaigns ? (
            <Skeleton className="h-64" />
          ) : lead ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{d.homeX.leadKicker}</p>
              <Link href={`/campaigns/${lead.id}`} className="group">
                {/* Smaller on the narrowest phones and long words may hyphenate, so a word like «подразделениями» never sticks out. */}
                <h1 className="mt-2 hyphens-auto break-words font-display text-[30px] font-semibold leading-[1.05] tracking-tight group-hover:text-accent min-[360px]:text-4xl sm:text-[54px]">{lead.title}</h1>
              </Link>
              <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">{lead.question}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                <span className="font-semibold">{left(lead)}</span>
                <span><b className="font-display text-xl tabular-nums">{lead.ideas}</b> <span className="text-muted">{d.campaigns.ideas}</span></span>
                <span><b className="font-display text-xl tabular-nums">{lead.participants}</b> <span className="text-muted">{d.campaigns.participants}</span></span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={`/submit?campaign=${lead.id}`} className="inline-flex h-11 items-center gap-2 bg-accent px-5 text-sm font-semibold text-accent-ink hover:brightness-110">
                  {d.campaigns.propose} <ArrowRight className="size-4" />
                </Link>
                {campaigns.length > 1 && (
                  <Link href="/campaigns" className="inline-flex h-11 items-center gap-2 border border-ink/20 px-5 text-sm font-medium hover:border-ink">
                    + {campaigns.length - 1} {d.nav.campaigns.toLowerCase()}
                  </Link>
                )}
              </div>
            </>
          ) : (
            <h1 className="font-display text-4xl font-semibold">{hello}</h1>
          )}
        </article>

        <aside className="border-t-2 border-ink pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="flex items-center justify-between text-[13px] font-semibold uppercase tracking-[0.12em]">
            {d.homeX.attention}
            {!!attention?.length && <span className="grid size-6 place-items-center rounded-full bg-accent text-[11px] text-white">{attention.length}</span>}
          </h2>
          <div className="mt-2">
            <AttentionList items={attention} dense />
          </div>
        </aside>
      </div>

      <div className="mt-10 grid grid-cols-2 border-y border-line md:grid-cols-4">
        {[
          { v: stats?.reviewedShare ?? "…", l: d.analytics.reviewedShare, red: true },
          { v: stats?.done ?? "…", l: d.analytics.implemented },
          { v: stats?.avgFirstResponseH ?? "…", l: d.home.statResponse },
          { v: stats?.slaRate ?? "…", l: d.home.statSla },
        ].map((s, i) => (
          <div key={i} className={cn("px-4 py-4 first:pl-0", i > 0 && "md:border-l md:border-line")}>
            <p className={cn("font-display text-2xl font-semibold tabular-nums", s.red && "text-accent")}>{s.v}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 md:grid-cols-3 [&>*]:min-w-0">
        <section>
          <SectionTitle href="/impact" more={d.home.seeAll}>{d.homeX.doneCol}</SectionTitle>
          {!done && <Skeleton className="h-40" />}
          <ul className="divide-y divide-line">
            {done?.slice(0, 3).map((f) => (
              <li key={f.id} className="py-3">
                <Link href={`/ideas/${f.id}`} className="group block">
                  <p className="font-semibold leading-snug group-hover:text-accent">{f.title}</p>
                  {(f.resolution?.effect || f.resolution?.text) && <p className="mt-1 text-sm text-[var(--st-done)]">{f.resolution.effect || f.resolution.text}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <SectionTitle href="/ideas" more={d.home.seeAll}>{d.homeX.discussCol}</SectionTitle>
          {!top && <Skeleton className="h-40" />}
          <ol className="divide-y divide-line">
            {top?.slice(0, 4).map((f) => (
              <li key={f.id} className="flex gap-3 py-3">
                <span className="w-8 shrink-0 font-display text-xl font-semibold tabular-nums text-accent">{f.votesCount}</span>
                <Link href={`/ideas/${f.id}`} className="min-w-0 text-sm font-medium leading-snug hover:text-accent">{f.title}</Link>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <SectionTitle href="/my" more={d.home.myAll}>{d.homeX.yoursCol}</SectionTitle>
          {!mine && <Skeleton className="h-40" />}
          {mine?.length === 0 && <p className="py-3 text-sm text-muted">{d.home.myEmpty}</p>}
          <ul className="divide-y divide-line">
            {mine?.slice(0, 4).map((f) => (
              <li key={f.id} className="py-3">
                <Link href={`/ideas/${f.id}`} className="group block">
                  <p className="truncate text-sm font-medium group-hover:text-accent">{f.title}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="size-2 rounded-full" style={{ background: statusColor(f.status) }} />
                    {d.status[f.status]} · {rel(f.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 border-t-[3px] border-ink pt-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">{d.homeX.newTicket}</h2>
          <div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {ACTIONS(d).map((a) => (
              <Link key={a.href} href={a.href} className={cn("group bg-surface p-4 transition-colors hover:bg-surface-2", a.hazard && "text-accent")}>
                <a.icon className="size-5" />
                <p className="mt-3 font-semibold">{a.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{a.hint}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <TrackInline />
          </div>
        </div>
        <PulseWidget />
      </div>
    </div>
  );
}

