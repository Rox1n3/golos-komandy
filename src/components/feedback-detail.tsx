"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Archive, ArrowRight, BadgeCheck, Bell, BellRing, CircleHelp, Lock, Megaphone, CircleX, EyeOff, Lightbulb, RotateCcw, Siren, Star, GitMerge, Languages, MapPin, MessageSquare, Send, Sparkles, Tag, UserRoundCog, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useCatName, useI18n } from "./providers";
import { Avatar, Button, Card, Input, Label, Select, Textarea } from "./ui/primitives";
import { EmptyState, StatusTimeline, type TimelineStep } from "./ui/widgets";
import { TicketFiles } from "./attachments";
import { EscalatedBadge, PriorityDot, SlaChip, STATUS_ICON, StatusBadge, TypeBadge, VoteButton, formatTenge, statusColor } from "./feedback-bits";
import { FLOW, STATUSES, isFinal, ticketCode, type AiReview, type FeedbackView, type HistoryEntry, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

/** History note in the interface language: system phrases come from the dictionary, people's notes as written. */
function noteText(h: HistoryEntry, t: ReturnType<typeof useI18n>["t"], cat: (id: string) => string): string | undefined {
  const s = h.sys;
  if (!s) return h.note;
  switch (s.kind) {
    case "route":
      return t("sysNote.route", { category: cat(s.category), to: s.to });
    case "routeFallback":
      return s.awayOwner
        ? t("sysNote.routeAway", { category: cat(s.category), to: s.to, owner: s.awayOwner })
        : t("sysNote.routeNoOwner", { category: cat(s.category), to: s.to });
    case "escalation":
      return t("sysNote.escalation", { to: s.to });
    case "handover":
      return t("sysNote.handover", { from: s.from, to: s.to });
    case "merged":
      return t("sysNote.merged", { code: s.code });
    default:
      return t(`sysNote.${s.kind}`);
  }
}

function buildSteps(
  f: FeedbackView,
  d: ReturnType<typeof useI18n>["d"],
  date: (iso: string, t?: boolean) => string,
  slaText: string,
  note: (h: HistoryEntry) => string | undefined,
): TimelineStep[] {
  const last = (s: Status) => [...f.history].reverse().find((h) => h.status === s);
  // Off the happy path (clarification, refusal, closing without work, reassignment): show the real history.
  const offPath = f.status === "rejected" || f.status === "closed" || f.history.some((h, i) => !FLOW.includes(h.status) || (i > 0 && h.status === f.history[i - 1].status));
  if (offPath) {
    const steps: TimelineStep[] = f.history.map((h, i) => {
      const isLast = i === f.history.length - 1;
      // Events inside a status: escalation to the head, or a handover to another responsible person.
      const escalation = h.event === "escalation";
      const handover = !escalation && (h.event === "handover" || (i > 0 && h.status === f.history[i - 1].status));
      return {
        key: `${h.status}-${i}`,
        title: escalation ? d.detail.escalationStep : handover ? d.detail.handover : d.status[h.status],
        description: escalation || handover ? undefined : isLast && !isFinal(f.status) ? `${d.statusHint[h.status]}${slaText ? `. ${slaText}` : ""}` : d.statusHint[h.status],
        date: date(h.at, true),
        note: note(h),
        state: h.status === "rejected" && !escalation && !handover ? "failed" : isLast && !isFinal(f.status) ? "current" : "done",
        color: statusColor(h.status),
        icon: escalation ? Siren : handover ? UserRoundCog : STATUS_ICON[h.status],
      };
    });
    if (!isFinal(f.status)) {
      const next = f.status === "needs_info" ? "review" : FLOW[FLOW.indexOf(f.status) + 1];
      if (next) steps.push({ key: `next-${next}`, title: d.status[next], description: d.statusHint[next], state: "upcoming", color: statusColor(next), icon: STATUS_ICON[next] });
    }
    return steps;
  }
  const currentIdx = FLOW.indexOf(f.status);
  return FLOW.map((s, i) => {
    const h = last(s);
    const state: TimelineStep["state"] = f.status === "done" || i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming";
    return {
      key: s,
      title: d.status[s],
      description: state === "current" ? `${d.statusHint[s]}. ${slaText}` : d.statusHint[s],
      date: h ? date(h.at, true) : undefined,
      note: h ? note(h) : undefined,
      state,
      color: statusColor(s),
      icon: STATUS_ICON[s],
    };
  });
}

export function FeedbackDetail({ f, setF, code }: { f: FeedbackView; setF: (f: FeedbackView) => void; code?: string }) {
  const { d, t, date, rel } = useI18n();
  const { isReviewer } = useApp();
  const cat = useCatName();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const { locale } = useI18n();
  const [translated, setTranslated] = useState<{ title: string; body: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  // Offer translation when the text is written in the other language than the interface.
  const isKazakh = /[әғқңөұүһі]/i.test(f.title + f.body);
  const canTranslate = locale === "kk" ? !isKazakh : isKazakh;
  const assignee = f.assignee;
  // The question the responsible person asked last (shown while the ticket waits for the author).
  const question = f.status === "needs_info" ? [...f.commentsView].reverse().find((c) => c.official) : undefined;
  const slaText = f.deadline ? t(f.overdue ? "sla.overdue" : "sla.due", { when: rel(f.deadline) }) : "";
  const anonAuthorView = !!code || (f.anonymous && f.isMine);

  const sendComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      setF(await api<FeedbackView>(`/api/feedback/${f.id}/comments`, "POST", { text: comment, code }));
      setComment("");
    } catch {
      toast.error(d.common.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="flex gap-4">
            {!code && <VoteButton f={f} onChange={setF} size="lg" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <TypeBadge type={f.type} />
                <StatusBadge status={f.status} />
                <span className="text-xs font-medium tabular-nums text-muted">{f.code}</span>
                <PriorityDot p={f.priority} withLabel />
                {f.escalated && <EscalatedBadge />}
                {!code && !f.isMine && <FollowButton f={f} setF={setF} />}
              </div>
              <h1 className="mt-2 font-display text-xl font-bold leading-snug sm:text-2xl">{translated?.title ?? f.title}</h1>
            </div>
          </div>
          {f.campaign && (
            <Link href={`/campaigns/${f.campaign.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
              <Megaphone className="size-4 text-accent" /> {d.campaigns.answersTo}: <span className="font-medium text-ink">{f.campaign.title}</span>
            </Link>
          )}
          <p className="mt-5 whitespace-pre-line leading-relaxed">{translated?.body ?? f.body}</p>
          {f.solution && (
            <div className="mt-4 border-l-2 border-sun bg-surface-2 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Lightbulb className="size-3.5 text-sun" /> {d.detail.solution}
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{f.solution}</p>
            </div>
          )}
          {(canTranslate || translated) && (
            <button
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-info hover:underline disabled:opacity-60"
              disabled={translating}
              onClick={async () => {
                if (translated) return setTranslated(null);
                setTranslating(true);
                try {
                  setTranslated(await api<{ title: string; body: string }>("/api/ai/translate", "POST", { id: f.id, to: locale }));
                } catch {
                  toast.error(d.common.error);
                } finally {
                  setTranslating(false);
                }
              }}
            >
              <Languages className="size-4" />
              {translating ? d.detail.translating : translated ? d.detail.original : d.detail.translate}
            </button>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm text-muted">
            <span className="flex items-center gap-2">
              {f.anonymous ? <EyeOff className="size-4" /> : <Avatar name={f.author?.name} color={f.author?.color} size={22} />}
              {f.anonymous ? d.common.anonymous : f.author?.name}
            </span>
            <span>{cat(f.category)}</span>
            <span>{d.departments[f.department]}</span>
            {f.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {d.locations[f.location]}
                {f.site ? `: ${f.site}` : ""}
              </span>
            )}
            <span>
              {d.detail.created} {date(f.createdAt, true)}
            </span>
            {f.tags.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3.5" />
                {f.tags.map((tg) => (
                  <span key={tg} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{tg}</span>
                ))}
              </span>
            )}
          </div>
        </Card>

        {f.status === "needs_info" && (
          <Card className="border-[var(--st-needs_info)]/60 p-5">
            <p className="flex items-center gap-2 font-semibold" style={{ color: statusColor("needs_info") }}>
              <CircleHelp className="size-5" /> {d.detail.clarifyTitle}
            </p>
            {question && <p className="mt-2 whitespace-pre-line leading-relaxed">«{question.text}»</p>}
            <p className="mt-2 text-sm text-muted">{f.isMine || code ? d.detail.clarifyMine : d.detail.clarifyOthers}</p>
          </Card>
        )}

        {f.nextAction && !isFinal(f.status) && (
          <div className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-sm">
              <span className="block text-xs text-muted">{d.detail.nextAction}</span>
              <span className="font-medium">{f.nextAction}</span>
            </p>
          </div>
        )}

        {f.resolution && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className={cn("border-2 p-5 sm:p-6", f.status === "done" ? "border-[var(--st-done)]" : f.status === "closed" ? "border-[var(--st-closed)]/60" : "border-[var(--st-rejected)]/60")}>
              <p className="flex items-center gap-2 font-semibold" style={{ color: statusColor(f.status) }}>
                {f.status === "done" ? <BadgeCheck className="size-5" /> : f.status === "closed" ? <Archive className="size-5" /> : <CircleX className="size-5" />}
                {d.detail.resolution}
              </p>
              {f.mergedInto ? (
                <p className="mt-2">
                  <Link className="text-accent underline" href={`/ideas/${f.mergedInto}`}>
                    {t("detail.merged", { n: f.resolution.text })}
                  </Link>
                </p>
              ) : (
                <p className="mt-2 leading-relaxed">{f.resolution.text}</p>
              )}
              {f.rating && <RatingStars score={f.rating.score} label={d.rating.yours} />}
              {(f.resolution.effect || f.resolution.savings) && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {f.resolution.effect && (
                    <p className="rounded-xl bg-surface-2 px-4 py-3">
                      <span className="block text-xs text-muted">{d.detail.effect}</span>
                      <span className="font-display text-lg font-bold">{f.resolution.effect}</span>
                    </p>
                  )}
                  {!!f.resolution.savings && (
                    <p className="rounded-xl bg-surface-2 px-4 py-3">
                      <span className="block text-xs text-muted">{d.detail.savings}</span>
                      <span className="font-display text-lg font-bold text-[var(--st-done)]">
                        {formatTenge(f.resolution.savings)} <span className="text-sm font-medium text-muted">{d.detail.perYear.replace("₸ ", "")}</span>
                      </span>
                    </p>
                  )}
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {(f.isMine || !!code) && isFinal(f.status) && f.type !== "praise" && (!f.rating || (f.rating.reopened && f.history[f.history.length - 1].at > f.rating.at)) && !f.mergedInto && (
          <RateResolution f={f} setF={setF} code={code} />
        )}
        {f.rating?.reopened && !isFinal(f.status) && (
          <p className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
            <RotateCcw className="size-4 shrink-0 text-accent" /> {d.rating.reopened}
          </p>
        )}

        <TicketFiles f={f} setF={setF} code={code} canEdit={!!code || f.isMine || f.canProcess} />

        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <MessageSquare className="size-4" /> {d.detail.discussion}
            <span className="text-sm font-normal text-muted">{f.commentsView.length}</span>
          </h2>
          <div className="mt-4 space-y-4">
            {f.commentsView.length === 0 && <p className="text-sm text-muted">{d.detail.noComments}</p>}
            {f.commentsView.map((c) => (
              <div key={c.id} className={cn("flex gap-3", c.official && "rounded-2xl bg-accent-soft/60 p-3 -mx-3")}>
                <Avatar name={c.author?.name} color={c.author?.color} anonymous={!c.author} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{c.author?.name ?? d.detail.anonAuthor}</span>
                    {c.official && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
                        <BadgeCheck className="size-3" /> {d.detail.official}
                      </span>
                    )}
                    <span className="text-xs text-muted">{rel(c.at)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && sendComment()}
              placeholder={anonAuthorView ? d.detail.commentAnonPh : d.detail.commentPh}
            />
            <Button size="icon" className="size-11 shrink-0 self-end" onClick={sendComment} disabled={sending || !comment.trim()} aria-label={d.common.send}>
              <Send />
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 font-semibold">{d.detail.path}</h2>
          <StatusTimeline steps={buildSteps(f, d, date, slaText, (h) => noteText(h, t, cat))} />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <SlaChip f={f} />
            {assignee && (
              <span className="flex items-center gap-2 text-xs text-muted">
                {d.detail.assignee}: <Avatar name={assignee.name} color={assignee.color} size={20} /> {assignee.name}
              </span>
            )}
          </div>
        </Card>
        {isReviewer && !code && !f.mergedInto && !f.canProcess && (
          <p className="flex gap-2.5 rounded-md border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
            <Lock className="mt-0.5 size-4 shrink-0" /> {t("detail.readOnly", { name: assignee?.name ?? "—" })}
          </p>
        )}
        {f.canProcess && !code && !f.mergedInto && <ReviewPanel f={f} setF={setF} />}
        {isReviewer && !code && !f.mergedInto && <AiExpertise f={f} />}
      </div>
    </div>
  );
}

function ReviewPanel({ f, setF }: { f: FeedbackView; setF: (f: FeedbackView) => void }) {
  const { d, t, locale } = useI18n();
  const { users } = useApp();
  const nextDefault = f.status === "needs_info" ? "review" : FLOW[Math.min(FLOW.indexOf(f.status) + 1, FLOW.length - 1)] ?? "review";
  const [status, setStatus] = useState<Status>(isFinal(f.status) ? f.status : nextDefault);
  // After a change the panel proposes the next logical status again instead of the one just applied.
  useEffect(() => {
    setStatus(isFinal(f.status) ? f.status : nextDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.status]);
  const [assigneeId, setAssigneeId] = useState(f.assigneeId ?? "");
  const [nextAction, setNextAction] = useState(f.nextAction ?? "");
  useEffect(() => {
    setAssigneeId(f.assigneeId ?? "");
    setNextAction(f.nextAction ?? "");
  }, [f.assigneeId, f.nextAction]);
  const owners = users.filter((u) => u.role !== "employee");
  const patch = async (body: Record<string, unknown>, ok: string) => {
    try {
      setF(await api<FeedbackView>(`/api/feedback/${f.id}`, "PATCH", body));
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(String((e as Error).message) === "403" ? d.review.forbidden : d.common.error);
      return false;
    }
  };
  const [note, setNote] = useState("");
  const [effect, setEffect] = useState("");
  const [savings, setSavings] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [dups, setDups] = useState<{ id: string; number: number; title: string; score: number }[]>([]);
  const [mergeTo, setMergeTo] = useState("");

  useEffect(() => {
    api<typeof dups>("/api/ai/similar", "POST", { title: f.title, body: f.body, excludeId: f.id }).then((r) => {
      setDups(r);
      setMergeTo(r[0]?.id ?? "");
    }).catch(() => {});
  }, [f.id, f.title, f.body]);

  const final = isFinal(status);
  const asking = status === "needs_info";

  return (
    <Card className="border-sun/50 p-5 sm:p-6">
      <h2 className="font-semibold">{d.review.title}</h2>
      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="ra">{d.review.assignee}</Label>
          <div className="flex gap-2">
            <Select id="ra" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="min-w-0">
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.away ? ` (${d.analytics.awayMark})` : ""}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              disabled={!assigneeId || assigneeId === f.assigneeId}
              onClick={() => patch({ assigneeId }, d.review.reassigned)}
            >
              <UserRoundCog /> {d.review.reassign}
            </Button>
          </div>
        </div>
        {!isFinal(f.status) && (
          <div>
            <Label htmlFor="rna">{d.review.nextAction}</Label>
            <div className="flex gap-2">
              <Input id="rna" value={nextAction} maxLength={500} onChange={(e) => setNextAction(e.target.value)} placeholder={d.review.nextActionPh} />
              <Button variant="outline" disabled={nextAction === (f.nextAction ?? "")} onClick={() => patch({ nextAction }, d.review.nextSaved)}>
                {d.review.saveNext}
              </Button>
            </div>
          </div>
        )}
        <div className="border-t border-line pt-4">
          <Label htmlFor="rs">{d.review.status}</Label>
          <Select id="rs" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => <option key={s} value={s}>{d.status[s]}</option>)}
          </Select>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="rn" className="mb-0">{asking ? d.review.question : final ? d.review.decision : d.review.note}</Label>
            <button
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50"
              disabled={drafting}
              onClick={async () => {
                setDrafting(true);
                try {
                  const r = await api<{ reply: string }>("/api/ai/reply", "POST", { id: f.id, status, locale });
                  setNote(r.reply);
                } catch {
                  toast.error(d.common.error);
                } finally {
                  setDrafting(false);
                }
              }}
            >
              <WandSparkles className={cn("size-3.5", drafting && "animate-spin")} /> {d.review.aiDraft}
            </button>
          </div>
          <Textarea id="rn" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={asking ? d.review.questionPh : d.review.notePh} />
        </div>
        {status === "done" && (
          <div className="grid gap-3">
            <div>
              <Label htmlFor="re">{d.review.effect}</Label>
              <Input id="re" value={effect} onChange={(e) => setEffect(e.target.value)} placeholder={d.review.effectPh} />
            </div>
            <div>
              <Label htmlFor="rsav">{d.review.savings}</Label>
              <Input id="rsav" inputMode="numeric" value={savings} onChange={(e) => setSavings(e.target.value.replace(/[^0-9]/g, ""))} placeholder={d.review.savingsPh} />
              {!!f.aiReview?.savings && !savings && (
                <button type="button" className="mt-1.5 text-xs font-medium text-accent hover:underline" onClick={() => setSavings(String(f.aiReview!.savings))}>
                  {d.review.useSavings}: {formatTenge(f.aiReview.savings)}
                </button>
              )}
            </div>
          </div>
        )}
        <Button
          className="w-full"
          disabled={busy || status === f.status}
          onClick={async () => {
            if (asking && !note.trim()) return toast.error(d.review.questionRequired);
            if (status === "rejected" && !note.trim()) return toast.error(d.review.reasonRequired);
            if (final && !note.trim()) return toast.error(d.review.noteRequired);
            setBusy(true);
            const ok = await patch({ status, note, effect, savings: Number(savings) || 0, nextAction: final ? undefined : nextAction }, d.review.updated);
            if (ok) {
              setNote("");
              setEffect("");
              setSavings("");
            }
            setBusy(false);
          }}
        >
          {d.review.apply}
        </Button>
      </div>

      {dups.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <GitMerge className="size-4" /> {d.review.duplicate}
          </p>
          <p className="mt-1 text-xs text-muted">{d.review.duplicateHint}</p>
          <div className="mt-3 flex gap-2">
            <Select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} className="min-w-0">
              {dups.map((x) => (
                <option key={x.id} value={x.id}>
                  {ticketCode(x.number)} {x.title.slice(0, 40)} ({Math.round(x.score * 100)}%)
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              disabled={!mergeTo}
              onClick={async () => {
                try {
                  const r = await api<FeedbackView>(`/api/feedback/${f.id}`, "PATCH", { mergeInto: mergeTo });
                  setF(r);
                  toast.success(t("review.merged", { n: ticketCode(dups.find((x) => x.id === mergeTo)?.number ?? 0) }));
                } catch {
                  toast.error(d.common.error);
                }
              }}
            >
              {d.review.merge}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function FollowButton({ f, setF }: { f: FeedbackView; setF: (f: FeedbackView) => void }) {
  const { d } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      title={d.follow.hint}
      aria-pressed={f.following}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<FeedbackView>(`/api/feedback/${f.id}/follow`, "POST");
          setF(r);
          toast.success(r.following ? d.follow.on : d.follow.off);
        } catch {
          toast.error(d.common.error);
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        "ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
        f.following ? "border-ink bg-ink text-bg" : "border-line hover:border-ink/40",
      )}
    >
      {f.following ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
      {f.following ? d.follow.following : d.follow.follow}
      {f.followersCount > 0 && <span className={cn("tabular-nums", f.following ? "opacity-70" : "text-muted")}>· {f.followersCount}</span>}
    </button>
  );
}

function RatingStars({ score, label }: { score: number; label: string }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm">
      <span className="text-muted">{label}:</span>
      <span className="flex" aria-label={`${score}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn("size-4", i <= score ? "fill-accent text-accent" : "text-line")} />
        ))}
      </span>
    </p>
  );
}

/** The author closes the loop: rates the answer and may send a weak one back once. */
function RateResolution({ f, setF, code }: { f: FeedbackView; setF: (f: FeedbackView) => void; code?: string }) {
  const { d } = useI18n();
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [reopen, setReopen] = useState(false);
  const [busy, setBusy] = useState(false);
  const labels = [d.rating.s1, d.rating.s2, d.rating.s3, d.rating.s4, d.rating.s5];
  const shown = hover || score;
  const canReopen = score > 0 && score <= 2 && !f.history.some((h) => h.note === "reopened");
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{d.rating.title}</h2>
        <p className="mt-1 text-sm text-muted">{d.rating.hint}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4" onMouseLeave={() => setHover(0)}>
          <div className="flex gap-1" role="radiogroup" aria-label={d.rating.title}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={score === i}
                aria-label={labels[i - 1]}
                onMouseEnter={() => setHover(i)}
                onClick={() => {
                  setScore(i);
                  if (i > 2) setReopen(false);
                }}
                className="grid size-10 place-items-center rounded-md transition-transform hover:scale-110"
              >
                <Star className={cn("size-7 transition-colors", i <= shown ? "fill-accent text-accent" : "text-line")} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <span className="text-sm font-medium">{shown ? labels[shown - 1] : ""}</span>
        </div>
        {score > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            <Textarea className="mt-4" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={d.rating.commentPh} />
            {canReopen && (
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md border border-line p-3">
                <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <RotateCcw className="size-3.5" /> {d.rating.reopen}
                  </span>
                  <span className="block text-xs text-muted">{d.rating.reopenHint}</span>
                </span>
              </label>
            )}
            <Button
              className="mt-4"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setF(await api<FeedbackView>(`/api/feedback/${f.id}/rate`, "POST", { score, comment, reopen, code }));
                  toast.success(d.rating.thanks);
                } catch {
                  toast.error(d.common.error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {d.rating.send}
            </Button>
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}

export function DetailNotFound({ text }: { text: string }) {
  return <EmptyState icons={[MessageSquare, EyeOff, CircleX]} title={text} />;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="flex justify-between text-xs text-muted">
        {label}
        <span className="font-semibold text-ink tabular-nums">{value}/5</span>
      </p>
      <div className="mt-1 flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= value ? "bg-ink" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

/** AI expertise for reviewers: impact/effort matrix, savings potential, risks and first steps. */
function AiExpertise({ f }: { f: FeedbackView }) {
  const { d, locale } = useI18n();
  const [review, setReview] = useState<AiReview | null>(f.aiReview && f.aiReview.locale === locale ? f.aiReview : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setReview(f.aiReview && f.aiReview.locale === locale ? f.aiReview : null), [f.aiReview, locale]);

  const run = async (refresh: boolean) => {
    setBusy(true);
    try {
      setReview(await api<AiReview>("/api/ai/assess", "POST", { id: f.id, locale, refresh }));
    } catch {
      toast.error(d.common.error);
    } finally {
      setBusy(false);
    }
  };

  const verdict = review
    ? review.impact >= 4 && review.effort <= 2
      ? d.review.quickWin
      : review.impact >= 4
        ? d.review.bigBet
        : review.effort <= 2
          ? d.review.easyFix
          : d.review.needsCase
    : "";

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 bg-side px-5 py-3.5 text-white">
        <Sparkles className="size-4 text-accent" />
        <h2 className="flex-1 font-semibold">{d.review.aiTitle}</h2>
        {review && (
          <button className="text-xs text-side-muted hover:text-white" disabled={busy} onClick={() => run(true)}>
            {d.review.aiAgain}
          </button>
        )}
      </div>
      <div className="p-5">
        {!review ? (
          <>
            <p className="text-sm text-muted">{d.review.aiHint}</p>
            <Button className="mt-3 w-full" variant="outline" disabled={busy} onClick={() => run(false)}>
              <WandSparkles className={cn(busy && "animate-spin")} />
              {busy ? d.submit.aiThinking : d.review.aiRun}
            </Button>
          </>
        ) : (
          <div className={cn("space-y-4", busy && "opacity-50")}>
            <span className="inline-block rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">{verdict}</span>
            <p className="text-sm leading-relaxed">{review.summary}</p>
            <div className="grid grid-cols-2 gap-4">
              <Meter value={review.impact} label={d.review.impact} />
              <Meter value={review.effort} label={d.review.effort} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p className="rounded-xl bg-surface-2 px-3 py-2">
                <span className="block text-[11px] text-muted">{d.review.aiSavings}</span>
                <span className="font-display font-bold">{review.savings ? formatTenge(review.savings) : "—"}</span>
              </p>
              <p className="rounded-xl bg-surface-2 px-3 py-2">
                <span className="block text-[11px] text-muted">{d.review.owner}</span>
                <span className="font-semibold">{d.departments[review.owner]}</span>
              </p>
            </div>
            {review.risks.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold">{d.review.risks}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">
                  {review.risks.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            {review.steps.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold">{d.review.steps}</p>
                <ol className="list-decimal space-y-0.5 pl-4 text-sm text-muted">
                  {review.steps.map((r) => <li key={r}>{r}</li>)}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
