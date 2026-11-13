"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles, X } from "lucide-react";
import { api, useI18n } from "./providers";
import { StatusBadge } from "./feedback-bits";
import { cn } from "@/lib/utils";
import { ticketCode, type Status } from "@/lib/types";

type Source = { id: string; number: number; title: string; status: Status };
type Msg = { role: "user"; text: string } | { role: "ai"; text: string; sources: Source[] };

/** Floating Q&A over the ticket base: "what was decided about X?" answered with citations. */
export function Assistant() {
  const { d, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, busy]);

  const askAi = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api<{ answer: string; sources: Source[] }>("/api/ai/ask", "POST", { question: text, locale });
      setMsgs((m) => [...m, { role: "ai", text: r.answer, sources: r.sources }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: d.common.error, sources: [] }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="elevated fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-side px-5 text-sm font-semibold text-white hover:bg-side-2"
          >
            <Sparkles className="size-4 text-accent" />
            {d.assistant.open}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label={d.assistant.title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="elevated fixed inset-x-3 bottom-3 z-50 flex max-h-[min(640px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px]"
          >
            <header className="flex items-start gap-3 bg-side px-4 py-3.5 text-white">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.assistant.title}</p>
                <p className="text-xs text-side-muted">{d.assistant.hint}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-side-muted hover:bg-white/10 hover:text-white" aria-label={d.common.close}>
                <X className="size-5" />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-auto p-4">
              {msgs.length === 0 && (
                <>
                  <p className="text-sm text-muted">{d.assistant.welcome}</p>
                  <div className="flex flex-col items-start gap-2">
                    {[d.assistant.s1, d.assistant.s2, d.assistant.s3].map((s) => (
                      <button key={s} onClick={() => askAi(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-[13px] hover:border-accent hover:text-accent">
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-side px-3.5 py-2 text-sm text-white">
                    {m.text}
                  </p>
                ) : (
                  <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm">
                    <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
                    {m.sources.length > 0 && (
                      <div className="mt-2.5 border-t border-line pt-2">
                        <p className="mb-1 text-[11px] font-medium text-muted">{d.assistant.sources}</p>
                        <ul className="space-y-1">
                          {m.sources.map((s) => (
                            <li key={s.id}>
                              <Link href={`/ideas/${s.id}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface">
                                <span className="text-[11px] tabular-nums text-muted">{ticketCode(s.number)}</span>
                                <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
                                <StatusBadge status={s.status} className="shrink-0" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              )}
              {busy && <p className="animate-pulse text-sm text-muted">{d.assistant.thinking}</p>}
              <div ref={end} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                askAi(q);
              }}
              className="flex gap-2 border-t border-line p-3"
            >
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={d.assistant.placeholder}
                aria-label={d.assistant.placeholder}
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
              />
              <button type="submit" disabled={busy || q.trim().length < 3} className={cn("grid size-10 place-items-center rounded-xl bg-accent text-white disabled:opacity-40")} aria-label={d.common.send}>
                <Send className="size-4" />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
