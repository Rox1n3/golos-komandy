"use client";

import { useState } from "react";
import { Annoyed, Frown, Laugh, Meh, Smile, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { Button, Card, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type Stats = { done: number; avgFirstResponseH: number; slaRate: number; savings: number; reviewedShare: number };
type PulseData = { answered: boolean };

export const FACES: LucideIcon[] = [Frown, Annoyed, Meh, Smile, Laugh];

export function PulseWidget() {
  const { d } = useI18n();
  const { me } = useApp();
  const { data, reload } = useFetch<PulseData>(me ? `/api/pulse?u=${me.id}` : null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const labels = [d.home.pulse1, d.home.pulse2, d.home.pulse3, d.home.pulse4, d.home.pulse5];
  const done = data?.answered && !editing;

  return (
    <Card className="elevated p-5">
      <h2 className="font-display text-lg font-bold">{d.home.pulseTitle}</h2>
      <p className="mt-1 text-xs text-muted">{d.home.pulseHint}</p>
      {done ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
          <span>{d.home.pulseThanks}</span>
          <button className="shrink-0 text-xs font-medium text-accent hover:underline" onClick={() => setEditing(true)}>
            {d.home.pulseChange}
          </button>
        </div>
      ) : (
        <>
          {/* Equal buttons when they fit; a button with a long word ("Нормально", "Орташадан") gets just the room it needs. */}
          <div className="mt-4 flex flex-wrap gap-1 min-[360px]:gap-1.5" role="radiogroup" aria-label={d.home.pulseTitle}>
            {FACES.map((Icon, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={score === i + 1}
                title={labels[i]}
                onClick={() => setScore(i + 1)}
                className={cn(
                  // Slightly smaller on the narrowest phones so all five stay in one row.
                  "flex min-w-min flex-1 flex-col items-center gap-1 rounded-xl border px-0.5 py-2.5 text-[10px] transition min-[360px]:px-1 min-[360px]:text-[11px]",
                  score === i + 1 ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-ink/30 hover:text-ink",
                )}
              >
                <Icon className="size-6" strokeWidth={1.8} />
                <span className="text-center leading-tight">{labels[i]}</span>
              </button>
            ))}
          </div>
          {score && (
            <div className="mt-3 space-y-2">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={d.home.pulseCommentPh} className="text-sm" />
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await api("/api/pulse", "POST", { score, comment });
                    setEditing(false);
                    setScore(null);
                    setComment("");
                    reload();
                    toast.success(d.home.pulseThanks);
                  } catch {
                    toast.error(d.common.error);
                  }
                }}
              >
                {d.home.pulseSend}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
