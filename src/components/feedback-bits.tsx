  "use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUp, Archive, BadgeCheck, CircleHelp, CircleX, Clock, EyeOff, Heart, Hourglass, Inbox, Lightbulb, LoaderCircle, MapPin, MessageSquare, Paperclip, ScanSearch, Siren, TriangleAlert, UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, useCatName, useI18n } from "./providers";
import { cn } from "@/lib/utils";
import type { FeedbackView, Priority, Status } from "@/lib/types";

export const STATUS_ICON: Record<Status, LucideIcon> = {
  new: Inbox,
  review: ScanSearch,
  needs_info: CircleHelp,
  accepted: BadgeCheck,
  in_progress: LoaderCircle,
  done: BadgeCheck,
  rejected: CircleX,
  closed: Archive,
};
export const statusColor = (s: Status) => `var(--st-${s})`;

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { d } = useI18n();
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}
      style={{ color: statusColor(status), background: `color-mix(in oklab, ${statusColor(status)} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: statusColor(status) }} />
      {d.status[status]}
    </span>
  );
}

export function TypeBadge({ type }: { type: FeedbackView["type"] }) {
  const { d } = useI18n();
  const Icon = type === "idea" ? Lightbulb : type === "praise" ? Heart : TriangleAlert;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", type === "idea" ? "text-sun" : type === "praise" ? "text-ok" : "text-danger")}>
      <Icon className="size-3.5" />
      {d.types[type]}
    </span>
  );
}

const PRIORITY_DOT: Record<Priority, string> = {
  low: "bg-muted/50",
  medium: "bg-accent",
  high: "bg-sun",
  critical: "bg-danger",
};

export function PriorityDot({ p, withLabel }: { p: Priority; withLabel?: boolean }) {
  const { d } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={d.priorities[p]}>
      <span className={cn("size-2 rounded-full", PRIORITY_DOT[p], p === "critical" && "animate-pulse")} />
      {withLabel && d.priorities[p]}
    </span>
  );
}

export function SlaChip({ f, compact }: { f: FeedbackView; compact?: boolean }) {
  const { t, rel } = useI18n();
  // No deadline: either the review is finished, or it is paused while the author answers a clarification request.
  if (!f.deadline) return compact ? null : <span className="text-xs text-muted">{t(f.status === "needs_info" ? "sla.paused" : "sla.final")}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", f.overdue ? "font-medium text-danger" : "text-muted")}>
      {f.overdue ? <Hourglass className="size-3.5" /> : <Clock className="size-3.5" />}
      {t(f.overdue ? "sla.overdue" : "sla.due", { when: rel(f.deadline) })}
    </span>
  );
}

export function VoteButton({ f, onChange, size = "md" }: { f: FeedbackView; onChange: (f: FeedbackView) => void; size?: "md" | "lg" }) {
  const { d } = useI18n();
  const disabled = f.isMine;
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      disabled={disabled}
      title={disabled ? d.detail.own : f.voted ? d.detail.voted : d.detail.vote}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // optimistic update
        onChange({ ...f, voted: !f.voted, votesCount: f.votesCount + (f.voted ? -1 : 1) });
        try {
          onChange(await api<FeedbackView>(`/api/feedback/${f.id}/vote`, "POST"));
        } catch {
          onChange(f);
          toast.error(d.common.error);
        }
      }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-xl border font-semibold tabular-nums transition-colors",
        size === "lg" ? "h-16 w-16 text-lg" : "h-14 w-12 text-sm",
        f.voted ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:border-accent hover:text-accent",
        disabled && "cursor-default opacity-60 hover:border-line hover:text-inherit",
      )}
    >
      <ArrowUp className={size === "lg" ? "size-5" : "size-4"} strokeWidth={2.5} />
      {f.votesCount}
    </motion.button>
  );
}

export function FeedbackCard({ f, onChange }: { f: FeedbackView; onChange: (f: FeedbackView) => void }) {
  const { d, rel } = useI18n();
  const cat = useCatName();
  return (
    <Link
      href={`/ideas/${f.id}`}
      className="group flex gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50 sm:p-5"
    >
      <VoteButton f={f} onChange={onChange} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TypeBadge type={f.type} />
          <StatusBadge status={f.status} />
          <span className="text-xs font-medium tabular-nums text-muted">{f.code}</span>
          <PriorityDot p={f.priority} withLabel />
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-semibold leading-snug group-hover:text-accent">{f.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{f.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            {f.anonymous ? <EyeOff className="size-3.5" /> : null}
            {f.anonymous ? d.common.anonymous : f.author?.name}
          </span>
          <span>{cat(f.category)}</span>
          {f.assignee && (
            <span className="inline-flex items-center gap-1" title={d.detail.assignee}>
              <UserRound className="size-3.5" />
              {f.assignee.name}
            </span>
          )}
          <span>{rel(f.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {f.comments.length}
          </span>
          {!!f.attachments?.length && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" />
              {f.attachments.length}
            </span>
          )}
          {f.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {f.site ?? d.locations[f.location]}
            </span>
          )}
          <SlaChip f={f} compact />
          {f.escalated && <EscalatedBadge />}
        </div>
      </div>
    </Link>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EscalatedBadge() {
  const { d } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
      <Siren className="size-3.5" />
      {d.detail.escalated}
    </span>
  );
}

export const formatTenge = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₸";
