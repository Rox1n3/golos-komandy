"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, BotMessageSquare, Check, Copy, EyeOff, LoaderCircle, Mic, MicOff, RotateCcw, ShieldCheck } from "lucide-react";
import { formatSeconds, useDictation } from "@/components/use-dictation";
import { toast } from "sonner";
import { api, useApp, useI18n } from "@/components/providers";
import { EmptyState } from "@/components/ui/widgets";
import { Avatar, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
const STORE = "golos-copilot-v1";

/** Inline markup the assistant uses: **bold** and A-001 ticket links. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\bA-\d{3}\b)/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold"><Inline text={p.slice(2, -2)} /></strong>
        ) : /^A-\d{3}$/.test(p) ? (
          <Link key={i} href={`/ideas/${p}`} className="font-medium text-accent underline-offset-2 hover:underline">{p}</Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Small markdown subset: paragraphs, "- " and "1. " lists, ### headings. */
function Answer({ text }: { text: string }) {
  const blocks: { kind: "p" | "ul" | "ol" | "h"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const kind = /^\s*[-•*]\s+/.test(line) ? "ul" : /^\s*\d+[.)]\s+/.test(line) ? "ol" : /^#{1,4}\s+/.test(line) ? "h" : "p";
    const clean = line.replace(/^\s*([-•*]|\d+[.)]|#{1,4})\s+/, "");
    const last = blocks[blocks.length - 1];
    // Indented lines under a list item belong to that item.
    if (kind === "p" && /^\s{2,}/.test(raw) && last && (last.kind === "ul" || last.kind === "ol") && last.lines.length) {
      last.lines[last.lines.length - 1] += "\n" + clean.trim();
      continue;
    }
    if (last && last.kind === kind && kind !== "h" && last.lines.length) last.lines.push(clean);
    else blocks.push({ kind, lines: [clean] });
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.filter((b) => b.lines.length).map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="space-y-1.5">
            {b.lines.map((l, k) => (
              <li key={k} className="flex gap-2.5">
                <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="whitespace-pre-line"><Inline text={l} /></span>
              </li>
            ))}
          </ul>
        ) : b.kind === "ol" ? (
          <ol key={i} className="space-y-1.5">
            {b.lines.map((l, k) => (
              <li key={k} className="flex gap-2.5">
                <span className="w-4 shrink-0 font-mono text-sm text-accent">{k + 1}</span>
                <span className="whitespace-pre-line"><Inline text={l} /></span>
              </li>
            ))}
          </ol>
        ) : b.kind === "h" ? (
          <p key={i} className="pt-1 font-semibold">{b.lines[0].replace(/\*\*/g, "")}</p>
        ) : (
          <p key={i}><Inline text={b.lines.join(" ")} /></p>
        ),
      )}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const { d } = useI18n();
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
    >
      {ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {ok ? d.copilot.copied : d.copilot.copy}
    </button>
  );
}

export default function CopilotPage() {
  const { d, locale } = useI18n();
  const { me, isReviewer, users, loginAs } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Voice input listens in the interface language: Kazakh (kk-KZ) or Russian (ru-RU).
  const dictation = useDictation(locale, (text) => setInput((v) => (v ? `${v.trimEnd()} ${text}` : text)), { unsupported: d.submit.voiceUnsupported, denied: d.submit.micDenied, noMic: d.submit.micMissing, insecure: d.submit.micInsecure, notHeard: d.submit.notHeard, unavailable: d.submit.sttUnavailable, error: d.submit.voiceError });

  // The conversation survives page switches (kept only in this browser).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {}
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  // Dictated text also grows the input box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || dictation.listening || dictation.busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ answer: string }>("/api/ai/copilot", "POST", { messages: next, locale });
      setMsgs([...next, { role: "assistant", content: r.answer }]);
    } catch {
      toast.error(d.common.error);
      setMsgs(msgs);
      setInput(q);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  };

  if (!isReviewer) {
    const reviewer = users.find((u) => u.role !== "employee");
    return (
      <EmptyState
        icons={[BotMessageSquare, ShieldCheck, EyeOff]}
        title={d.copilot.noAccess}
        description={d.board.noAccessHint}
        action={reviewer && <Button onClick={() => loginAs(reviewer.id)}>{d.board.switch}</Button>}
        className="mt-10"
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold sm:text-3xl">
            <BotMessageSquare className="size-7 text-accent" strokeWidth={1.8} /> {d.copilot.title}
          </h1>
        </div>
        {msgs.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-[10px]" onClick={() => setMsgs([])}>
            <RotateCcw /> {d.copilot.clear}
          </Button>
        )}
      </div>

      <div className="flex-1 py-6">
        {msgs.length === 0 ? (
          <div className="pt-6">
            <p className="font-display text-xl font-semibold">{d.copilot.hello}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {d.copilot.suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="group flex items-start justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-ink/40">
                  {s}
                  <ArrowUp className="mt-0.5 size-4 shrink-0 rotate-45 text-muted transition-colors group-hover:text-accent" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-7">
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end gap-3">
                  <p className="max-w-[85%] whitespace-pre-line rounded-[18px] rounded-tr-[6px] bg-ink px-4 py-2.5 text-[15px] text-bg">{m.content}</p>
                  <Avatar name={me?.name} color={me?.color} size={30} />
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink">
                    <BotMessageSquare className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Answer text={m.content} />
                    <div className="mt-2">
                      <CopyBtn text={m.content} />
                    </div>
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex gap-3">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink">
                  <BotMessageSquare className="size-4" />
                </span>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${k * 150}ms` }} />
                    ))}
                  </span>
                  {d.copilot.thinking}
                </p>
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-bg pb-4 pt-2">
        <div className={cn("flex items-end gap-2 rounded-[18px] border bg-surface p-2 transition-colors", busy ? "border-line" : "border-ink/25 focus-within:border-ink")}>
          <textarea
            ref={box}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={dictation.busy ? d.submit.transcribing : dictation.listening ? `${d.submit.listening} ${formatSeconds(dictation.seconds)}` : d.copilot.placeholder}
            className="max-h-44 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={dictation.toggle}
            disabled={dictation.busy}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? d.submit.stopRec : d.submit.voice}
            title={`${dictation.listening ? d.submit.listening : d.submit.voice} · ${locale === "kk" ? "қазақша" : "по-русски"}`}
            className={cn(
              "relative grid size-10 shrink-0 place-items-center rounded-[12px] transition-colors",
              dictation.listening ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {dictation.listening && (
              <span
                className="absolute inset-0 rounded-[12px] border-2 border-accent/70 transition-transform duration-75"
                style={{ transform: `scale(${1 + dictation.level * 0.35})` }}
                aria-hidden
              />
            )}
            {dictation.busy ? <LoaderCircle className="size-[18px] animate-spin" /> : dictation.listening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
          </button>
          <Button size="icon" className="size-10 shrink-0 rounded-[12px]" disabled={busy || dictation.listening || dictation.busy || !input.trim()} onClick={() => send(input)} aria-label={d.common.send}>
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
