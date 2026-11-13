"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarClock, Lightbulb, Megaphone, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { PageHeader } from "@/components/feedback-bits";
import { EmptyState } from "@/components/ui/widgets";
import { Button, Dialog, Input, Label, Select, Skeleton, Textarea, buttonVariants } from "@/components/ui/primitives";
import { DEPARTMENTS, type CampaignView, type Department } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AudienceText, timeShare, useDeadlineText } from "@/components/campaign-bits";

function ActiveCampaign({ c, index }: { c: CampaignView; index: number }) {
  const { d, t, date } = useI18n();
  const left = useDeadlineText();
  const share = timeShare(c);
  return (
    <article className="group relative grid border border-line bg-surface transition-colors hover:border-ink/40 md:grid-cols-[1fr_260px]">
      <Link href={`/campaigns/${c.id}`} className="absolute inset-0 z-0" aria-label={c.title} />
      <div className="relative p-6 sm:p-7">
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
          <AudienceText c={c} />
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-[28px]">{c.title}</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">{c.question}</p>
      </div>
      <div className="relative flex flex-col justify-between gap-6 border-t border-line p-6 md:border-l md:border-t-0">
        <div>
          <p className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{left(c)}</span>
            <span className="text-xs text-muted">{t("campaigns.until", { date: date(c.deadline) })}</span>
          </p>
          <span className="mt-2 block h-1 bg-surface-2" aria-hidden>
            <span className="block h-full bg-ink" style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              [c.ideas, d.campaigns.ideas],
              [c.participants, d.campaigns.participants],
              [c.votes, d.campaigns.votes],
            ].map(([v, l]) => (
              <div key={String(l)}>
                <dt className="font-display text-2xl font-semibold tabular-nums">{v}</dt>
                <dd className="text-[11px] text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Link href={`/submit?campaign=${c.id}`} className={cn(buttonVariants(), "relative z-10 w-full")}>
          {d.campaigns.propose} <ArrowRight />
        </Link>
      </div>
    </article>
  );
}

function CreateCampaign({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { d } = useI18n();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState("14");
  const [audience, setAudience] = useState<Department | "all">("all");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={d.campaigns.create} className="max-w-xl">
      <div className="space-y-4">
        <div>
          <Label htmlFor="ct">{d.campaigns.fTitle}</Label>
          <Input id="ct" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder={d.campaigns.fTitlePh} />
        </div>
        <div>
          <Label htmlFor="cq">{d.campaigns.fQuestion}</Label>
          <Textarea id="cq" rows={4} value={question} maxLength={1500} onChange={(e) => setQuestion(e.target.value)} placeholder={d.campaigns.fQuestionPh} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cd">{d.campaigns.fDays}</Label>
            <Input id="cd" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <div>
            <Label htmlFor="ca">{d.campaigns.fAudience}</Label>
            <Select id="ca" value={audience} onChange={(e) => setAudience(e.target.value as Department | "all")}>
              <option value="all">{d.campaigns.forAll}</option>
              {DEPARTMENTS.map((dep) => <option key={dep} value={dep}>{d.departments[dep]}</option>)}
            </Select>
          </div>
        </div>
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            if (title.trim().length < 5 || question.trim().length < 15) return toast.error(d.submit.tooShort);
            setBusy(true);
            try {
              await api("/api/campaigns", "POST", { title, question, days: Number(days) || 14, audience });
              toast.success(d.campaigns.launched);
              setTitle("");
              setQuestion("");
              onCreated();
              onClose();
            } catch {
              toast.error(d.common.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Megaphone /> {d.campaigns.launch}
        </Button>
      </div>
    </Dialog>
  );
}

export default function CampaignsPage() {
  const { d } = useI18n();
  const { isReviewer } = useApp();
  const { data, reload } = useFetch<CampaignView[]>("/api/campaigns");
  const [creating, setCreating] = useState(false);
  const left = useDeadlineText();
  const active = (data ?? []).filter((c) => c.active);
  const finished = (data ?? []).filter((c) => !c.active);

  return (
    <>
      <PageHeader title={d.campaigns.title} subtitle={d.campaigns.subtitle}>
        {isReviewer && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> {d.campaigns.create}
          </Button>
        )}
      </PageHeader>

      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icons={[Megaphone, Users, Lightbulb]} title={d.campaigns.empty} />
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{d.campaigns.active}</h2>
              <div className="space-y-4">
                {active.map((c, i) => <ActiveCampaign key={c.id} c={c} index={i} />)}
              </div>
            </section>
          )}
          {finished.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{d.campaigns.finished}</h2>
              <ul className="divide-y divide-line border-y border-line">
                {finished.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-surface-2/50">
                      <span className="min-w-0 flex-1 font-medium group-hover:text-accent">{c.title}</span>
                      <span className="flex items-center gap-1.5 text-sm text-muted">
                        <CalendarClock className="size-4" /> {left(c)}
                      </span>
                      <span className="text-sm tabular-nums text-muted">
                        {c.ideas} {d.campaigns.ideas} · {c.participants} {d.campaigns.participants}
                      </span>
                      {c.winners.length > 0 && <span className="text-xs font-semibold uppercase tracking-wide text-accent">{d.campaigns.winner}: {c.winners.length}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {isReviewer && <CreateCampaign open={creating} onClose={() => setCreating(false)} onCreated={reload} />}
    </>
  );
}
