"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { DetailNotFound } from "@/components/feedback-detail";
import { FeedbackCard } from "@/components/feedback-bits";
import { AudienceText, timeShare, useDeadlineText } from "@/components/campaign-bits";
import { Button, Card, Skeleton, buttonVariants } from "@/components/ui/primitives";
import { ticketCode, type CampaignSummary, type CampaignView, type FeedbackView } from "@/lib/types";
import { cn } from "@/lib/utils";

type Data = { campaign: CampaignView; ideas: FeedbackView[] };

function AiReview({ c }: { c: CampaignView }) {
  const { d, locale } = useI18n();
  const [s, setS] = useState<CampaignSummary | null>(c.aiSummary && c.aiSummary.locale === locale ? c.aiSummary : null);
  const [busy, setBusy] = useState(false);
  const run = async (refresh: boolean) => {
    setBusy(true);
    try {
      setS(await api<CampaignSummary>("/api/ai/campaign", "POST", { id: c.id, locale, refresh }));
    } catch {
      toast.error(d.common.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 bg-side px-5 py-3.5 text-white">
        <Sparkles className="size-4 text-accent" />
        <h2 className="flex-1 font-semibold">{d.campaigns.aiTitle}</h2>
        {s && (
          <button className="text-xs text-side-muted hover:text-white" disabled={busy} onClick={() => run(true)}>
            {d.campaigns.aiAgain}
          </button>
        )}
      </div>
      <div className={cn("p-5", busy && "opacity-60")}>
        {!s ? (
          <>
            <p className="text-sm text-muted">{d.campaigns.aiHint}</p>
            <Button className="mt-3 w-full" variant="outline" disabled={busy || c.ideas === 0} onClick={() => run(false)}>
              <WandSparkles className={cn(busy && "animate-spin")} /> {busy ? d.submit.aiThinking : d.campaigns.aiRun}
            </Button>
          </>
        ) : (
          <div className="space-y-5 text-sm">
            {s.themes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.campaigns.themes}</p>
                <ul className="space-y-1.5">
                  {s.themes.map((th) => (
                    <li key={th.title} className="flex justify-between gap-3">
                      <span>{th.title}</span>
                      <span className="shrink-0 text-muted">{th.ideas.map((n) => ticketCode(n)).join(" ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.top.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.campaigns.top}</p>
                <ol className="space-y-2">
                  {s.top.map((x, i) => (
                    <li key={x.number} className="flex gap-2.5">
                      <span className="font-mono text-accent">{i + 1}</span>
                      <span>
                        <Link href={`/ideas/${ticketCode(x.number)}`} className="font-medium hover:text-accent">{ticketCode(x.number)}</Link> — {x.why}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {s.next && (
              <p className="border-l-2 border-accent pl-3">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{d.campaigns.next}</span>
                {s.next}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { d, t, date } = useI18n();
  const { isReviewer } = useApp();
  const { data, setData, error, reload } = useFetch<Data>(`/api/campaigns/${id}`);
  const left = useDeadlineText();

  if (error) return <DetailNotFound text={d.campaigns.empty} />;
  if (!data) return <Skeleton className="h-96" />;
  const { campaign: c, ideas } = data;

  const patch = async (body: object, msg?: string) => {
    try {
      await api(`/api/campaigns/${c.id}`, "PATCH", body);
      if (msg) toast.success(msg);
      reload();
    } catch {
      toast.error(d.common.error);
    }
  };

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> {d.campaigns.back}
      </Link>

      <header className="border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <AudienceText c={c} /> · {t("campaigns.startedBy", { name: c.author })}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-4xl">{c.title}</h1>
        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-muted">{c.question}</p>
        <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div className="min-w-56">
            <p className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-semibold">{left(c)}</span>
              <span className="text-xs text-muted">{t("campaigns.until", { date: date(c.deadline) })}</span>
            </p>
            <span className="mt-2 block h-1 bg-surface-2">
              <span className="block h-full bg-ink" style={{ width: `${Math.round(timeShare(c) * 100)}%` }} />
            </span>
          </div>
          {[
            [c.ideas, d.campaigns.ideas],
            [c.participants, d.campaigns.participants],
            [c.votes, d.campaigns.votes],
          ].map(([v, l]) => (
            <p key={String(l)}>
              <span className="block font-display text-3xl font-semibold tabular-nums leading-none">{v}</span>
              <span className="text-xs text-muted">{l}</span>
            </p>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            {c.active && (
              <Link href={`/submit?campaign=${c.id}`} className={buttonVariants({ size: "lg" })}>
                {d.campaigns.propose} <ArrowRight />
              </Link>
            )}
            {isReviewer && c.active && (
              <Button size="lg" variant="outline" onClick={() => patch({ close: true }, d.campaigns.closedToast)}>
                {d.campaigns.close}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {ideas.length === 0 && <p className="border border-dashed border-line px-5 py-10 text-center text-muted">{d.campaigns.noIdeas}</p>}
          {ideas.map((f) => {
            const won = c.winners.includes(f.id);
            return (
              <div key={f.id} className={cn("relative", won && "outline outline-2 outline-accent")}>
                {won && (
                  <span className="absolute -top-2.5 left-4 z-10 inline-flex items-center gap-1 bg-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-ink">
                    {d.campaigns.winner}
                  </span>
                )}
                <FeedbackCard f={f} onChange={(nf) => setData({ ...data, ideas: ideas.map((x) => (x.id === nf.id ? nf : x)) })} />
                {isReviewer && (
                  <button
                    onClick={() => patch({ toggleWinner: f.id })}
                    className={cn(
                      "absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold",
                      won ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    {won && <Check className="size-3" />} {won ? d.campaigns.winner : d.campaigns.markWinner}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <aside className="space-y-4">{isReviewer && <AiReview c={c} />}</aside>
      </div>
    </>
  );
}
