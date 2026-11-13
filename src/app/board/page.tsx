"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Download, EyeOff, Hourglass, Kanban, Lock, MessageSquare, ShieldCheck, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { EmptyState } from "@/components/ui/widgets";
import { Button, Dialog, Input, Label, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { PageHeader, PriorityDot, TypeBadge, statusColor } from "@/components/feedback-bits";
import { STATUSES, isFinal, type FeedbackView, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Board() {
  const { d, t, rel, locale } = useI18n();
  const { isReviewer, users, loginAs, me } = useApp();
  const { data, setData } = useFetch<FeedbackView[]>(isReviewer ? `/api/feedback?sort=top&u=${me?.id}` : null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [pending, setPending] = useState<{ f: FeedbackView; to: Status } | null>(null);
  const [note, setNote] = useState("");
  const [effect, setEffect] = useState("");
  const [drafting, setDrafting] = useState(false);

  if (me && !isReviewer) {
    const reviewer = users.find((u) => u.role === "reviewer");
    return (
      <EmptyState
        icons={[Kanban, ShieldCheck, EyeOff]}
        title={d.board.noAccess}
        description={d.board.noAccessHint}
        action={reviewer && <Button onClick={() => loginAs(reviewer.id)}>{d.board.switch}</Button>}
        className="mt-10"
      />
    );
  }

  const move = async (f: FeedbackView, to: Status, n = "", e = "") => {
    const prev = data;
    setData((l) => l?.map((x) => (x.id === f.id ? { ...x, status: to } : x)) ?? null);
    try {
      const upd = await api<FeedbackView>(`/api/feedback/${f.id}`, "PATCH", { status: to, note: n, effect: e });
      setData((l) => l?.map((x) => (x.id === upd.id ? upd : x)) ?? null);
      toast.success(d.review.updated);
    } catch (err) {
      setData(prev);
      toast.error((err as Error).message === "403" ? d.review.forbidden : d.common.error);
    }
  };

  const onDrop = (to: Status) => {
    const f = data?.find((x) => x.id === dragId);
    setOver(null);
    setDragId(null);
    if (!f || f.status === to) return;
    if (!f.canProcess) return toast.error(t("detail.readOnly", { name: f.assignee?.name ?? "—" }));
    // A clarification request needs the question, a final status needs the decision for the author.
    if (to === "needs_info" || isFinal(to)) {
      setNote("");
      setEffect("");
      setPending({ f, to });
    } else move(f, to);
  };

  const list = (data ?? []).filter((f) => (!overdueOnly || f.overdue) && (!mineOnly || f.assignee?.id === me?.id));

  return (
    <>
      <PageHeader title={d.board.title} subtitle={d.board.subtitle}>
        <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={mineOnly} onChange={setMineOnly} />
          {d.feed.assignedToMe}
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={overdueOnly} onChange={setOverdueOnly} />
          {d.board.overdueOnly}
        </label>
        <a href="/api/export" download className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:border-ink/40">
          <Download className="size-4" /> {d.export.csv}
        </a>
        </div>
      </PageHeader>
      {!data ? (
        <Skeleton className="h-[60vh]" />
      ) : (
        <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {STATUSES.map((s) => {
            const items = list.filter((f) => f.status === s);
            return (
              <div
                key={s}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(s);
                }}
                onDragLeave={() => setOver((o) => (o === s ? null : o))}
                onDrop={() => onDrop(s)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-2xl border bg-surface-2/60 p-2 transition-colors",
                  over === s ? "border-accent bg-accent-soft/60" : "border-transparent",
                )}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  <span className="size-2.5 rounded-full" style={{ background: statusColor(s) }} />
                  <span className="text-sm font-semibold">{d.status[s]}</span>
                  <span className="ml-auto rounded-full bg-surface px-2 text-xs tabular-nums text-muted">{items.length}</span>
                </div>
                <div className="flex min-h-24 flex-1 flex-col gap-2">
                  {items.map((f) => (
                    <motion.div
                      layout
                      key={f.id}
                      draggable={f.canProcess}
                      onDragStart={() => setDragId(f.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cn(
                        "rounded-xl border bg-surface p-3 shadow-sm",
                        f.canProcess ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                        f.overdue ? "border-danger/60" : "border-line",
                        dragId === f.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <TypeBadge type={f.type} />
                        <span className="text-[11px] tabular-nums text-muted">{f.code}</span>
                        {!f.canProcess && <Lock className="size-3 text-muted" aria-label="read only" />}
                        <span className="ml-auto"><PriorityDot p={f.priority} /></span>
                      </div>
                      <Link href={`/ideas/${f.id}`} className="mt-1.5 line-clamp-3 block text-sm font-medium leading-snug hover:text-accent" draggable={false}>
                        {f.title}
                      </Link>
                      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
                        <span>▲ {f.votesCount}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{f.comments.length}</span>
                        {f.anonymous && <EyeOff className="size-3" />}
                        {f.overdue ? (
                          <span className="ml-auto inline-flex items-center gap-1 font-medium text-danger"><Hourglass className="size-3" />{rel(f.deadline!)}</span>
                        ) : (
                          <span className="ml-auto truncate">{f.assignee?.name ?? d.departments[f.department]}</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {items.length === 0 && <p className="py-6 text-center text-xs text-muted">{d.board.empty}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!pending} onClose={() => setPending(null)} title={pending && t("board.moveTitle", { status: d.status[pending.to] })}>
        {pending && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{pending.f.code} {pending.f.title}</p>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="mb-0" htmlFor="bn">{pending.to === "needs_info" ? d.review.question : d.review.decision}</Label>
                <button
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  disabled={drafting}
                  onClick={async () => {
                    setDrafting(true);
                    try {
                      setNote((await api<{ reply: string }>("/api/ai/reply", "POST", { id: pending.f.id, status: pending.to, locale })).reply);
                    } finally {
                      setDrafting(false);
                    }
                  }}
                >
                  <WandSparkles className={cn("size-3.5", drafting && "animate-spin")} /> {d.review.aiDraft}
                </button>
              </div>
              <Textarea id="bn" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending.to === "needs_info" ? d.review.questionPh : d.review.notePh} />
              <p className="mt-1.5 text-xs text-muted">{d.board.moveText}</p>
            </div>
            {pending.to === "done" && (
              <div>
                <Label htmlFor="be">{d.review.effect}</Label>
                <Input id="be" value={effect} onChange={(e) => setEffect(e.target.value)} placeholder={d.review.effectPh} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>{d.common.cancel}</Button>
              <Button
                variant={pending.to === "rejected" ? "danger" : "primary"}
                onClick={() => {
                  if (!note.trim()) return toast.error(pending.to === "needs_info" ? d.review.questionRequired : pending.to === "rejected" ? d.review.reasonRequired : d.review.noteRequired);
                  move(pending.f, pending.to, note, effect);
                  setPending(null);
                }}
              >
                {d.review.apply}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
