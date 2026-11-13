"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, EyeOff, Heart, LoaderCircle, Megaphone, Route, Save, X, Lightbulb, Mic, MicOff, ShieldCheck, ShieldAlert, Siren, Sparkles, TriangleAlert, WandSparkles, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { AnimatedTabs } from "@/components/ui/widgets";
import { Button, Card, Input, Label, Select, Switch, Textarea, buttonVariants } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/feedback-bits";
import { FilePicker, uploadFiles } from "@/components/attachments";
import { formatSeconds, useDictation } from "@/components/use-dictation";
import { type CampaignView, DEPARTMENTS, LOCATIONS, PRIORITIES, ticketCode, type Category, type Department, type FeedbackView, type Location, type Priority, type Sentiment, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

type Analysis = {
  category: Category; priority: Priority; department: Department; tags: string[]; sentiment: Sentiment;
  improved: { title: string; body: string }; privacy: string[]; toxic: boolean; source: "openai" | "local";
};
type Similar = { id: string; number: number; title: string; status: Status; votes: number; score: number };
type Mode = "idea" | "problem" | "praise" | "hazard";

function SubmitForm() {
  const { d, t, locale } = useI18n();
  const { categories, users, settings } = useApp();

  const params = useSearchParams();
  const initial = params.get("type");
  const [mode, setMode] = useState<Mode>(initial === "hazard" ? "hazard" : initial === "problem" ? "problem" : initial === "praise" ? "praise" : "idea");
  const type = mode === "idea" ? "idea" : mode === "praise" ? "praise" : "problem";
  const hazard = mode === "hazard";
  const [solution, setSolution] = useState("");
  // Once the author picks a category by hand, AI never overrides it.
  const [catTouched, setCatTouched] = useState(false);
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [departmentTouched, setDepartmentTouched] = useState(false);
  const [location, setLocation] = useState<Location | "">(initial === "hazard" ? "site" : "");
  const [site, setSite] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Empty until the author (or AI) picks one; "Другое" is only the last resort.
  const [category, setCategory] = useState<Category>("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [department, setDepartment] = useState<Department>("admin");
  const [tags, setTags] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [supported, setSupported] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<(FeedbackView & { trackingCode?: string }) | null>(null);
  const analyzedFor = useRef("");
  const [files, setFiles] = useState<File[]>([]);
  // Opened from a campaign: the idea is filed as an answer to it.
  const [campaignId, setCampaignId] = useState<string | null>(params.get("campaign"));
  const { data: campaign } = useFetch<{ campaign: CampaignView }>(campaignId ? `/api/campaigns/${campaignId}` : null);
  useEffect(() => {
    if (campaignId) setMode("idea");
  }, [campaignId]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Drafts survive a closed tab or a lost connection on site: text is kept in this browser until the ticket is sent.
  const DRAFT_KEY = "golos-draft-v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw && !initial) {
        const dft = JSON.parse(raw) as { mode?: Mode; title?: string; body?: string; site?: string; location?: Location | "" };
        if (dft.title || dft.body) {
          if (dft.mode) setMode(dft.mode);
          setTitle(dft.title ?? "");
          setBody(dft.body ?? "");
          setSite(dft.site ?? "");
          if (dft.location !== undefined) setLocation(dft.location);
          toast.message(d.draft.restored);
        }
      }
    } catch {}
    setDraftReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    const id = setTimeout(() => {
      try {
        if (title || body) localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, title, body, site, location }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [draftReady, mode, title, body, site, location]);
  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };
  const dictation = useDictation(locale, (text) => setBody((b) => (b ? `${b.trimEnd()} ${text}` : text)), { unsupported: d.submit.voiceUnsupported, denied: d.submit.micDenied, noMic: d.submit.micMissing, insecure: d.submit.micInsecure, notHeard: d.submit.notHeard, unavailable: d.submit.sttUnavailable, error: d.submit.voiceError });

  // A hazard report is always safety-critical and goes to the HSE engineer; AI may refine tags but not lower the priority.
  useEffect(() => {
    if (hazard) {
      setCategory("safety");
      setPriority("critical");
      setDepartment("service");
    } else {
      // Leaving the hazard tab: "Охрана труда" is not in the regular list, so the author picks again.
      setCategory((c) => (c === "safety" ? "" : c));
      setPriority((p) => (p === "critical" ? "medium" : p));
    }
  }, [hazard]);

  // Live duplicate search while typing (debounced)
  useEffect(() => {
    const text = `${title} ${body}`.trim();
    if (text.length < 12) return setSimilar([]);
    const id = setTimeout(async () => {
      try {
        setSimilar(await api<Similar[]>("/api/ai/similar", "POST", { title, body }));
      } catch {}
    }, 650);
    return () => clearTimeout(id);
  }, [title, body]);

  const runAnalysis = async (showText: boolean) => {
    if (body.trim().length < 10) {
      toast.message(d.submit.tooShort);
      return null;
    }
    setAiBusy(true);
    try {
      const a = await api<Analysis>("/api/ai/analyze", "POST", { title, body, type, locale, anonymous });
      setAnalysis(a);
      if (!hazard) {
        if (!catTouched) setCategory(a.category);
        if (!priorityTouched) setPriority(a.priority);
        if (!departmentTouched) setDepartment(a.department);
      }
      setTags(a.tags);
      analyzedFor.current = title + body;
      if (showText) setShowSuggestion(true);
      return a;
    } catch {
      toast.error(d.common.error);
      return null;
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async () => {
    if (title.trim().length < 5 || body.trim().length < 15) return toast.error(d.submit.tooShort);
    setSending(true);
    try {
      let a = analysis;
      if (analyzedFor.current !== title + body) a = await runAnalysis(false);
      const res = await api<FeedbackView & { trackingCode?: string }>("/api/feedback", "POST", {
        type, title, body, anonymous,
        solution: type === "praise" ? undefined : solution,
        // The author's choice wins; AI only pre-fills the field.
        category: hazard ? "safety" : catTouched && category ? category : (a?.category ?? (category || "other")),
        // A value the author picked by hand always wins; otherwise the suggestion (AI or offline rules) is used.
        priority: hazard ? "critical" : priorityTouched ? priority : (a?.priority ?? priority),
        department: hazard ? "service" : departmentTouched ? department : (a?.department ?? department),
        tags: a?.tags ?? tags, sentiment: a?.sentiment,
        location: location || undefined, site,
        campaignId: campaign?.campaign.active ? campaignId : undefined,
      });
      let done: FeedbackView & { trackingCode?: string } = res;
      if (files.length) {
        setUploadPct(0);
        try {
          done = { ...(await uploadFiles(res.id, files, res.trackingCode, setUploadPct)), trackingCode: res.trackingCode };
        } catch {
          toast.error(d.files.failed);
        }
      }
      clearDraft();
      setFiles([]);
      setSolution("");
      setCreated(done);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error(d.common.error);
    } finally {
      setSending(false);
      setUploadPct(null);
    }
  };

  // Routing preview: who gets the ticket under the administrator's rules (same logic as on the server).
  const route = (() => {
    if (!hazard && !category) return null;
    const cat = categories.find((c) => c.id === (hazard ? "safety" : category));
    const owner = users.find((u) => u.id === cat?.responsibleId);
    if (owner && !owner.away) return { name: owner.name, why: "" };
    const fb = users.find((u) => u.id === settings?.fallbackAssigneeId);
    return fb ? { name: fb.name, why: owner ? d.submit.routeAway : d.submit.routeNoOwner } : null;
  })();

  if (created) return <Success f={created} onAnother={() => { setCreated(null); setTitle(""); setBody(""); setAnalysis(null); setSimilar([]); }} />;

  return (
    <>
      <PageHeader title={hazard ? d.submit.hazardTitle : d.submit.title} subtitle={hazard ? undefined : d.submit.subtitle} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-5 p-5 sm:p-6">
          <AnimatedTabs
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (m === "hazard" && !location) setLocation("site");
            }}
            tabs={[
              { value: "problem", label: d.types.problem, icon: TriangleAlert },
              { value: "idea", label: d.types.idea, icon: Lightbulb },
              { value: "praise", label: d.submit.praiseTab, icon: Heart },
              { value: "hazard", label: d.submit.hazardTitle, icon: Siren },
            ]}
          />
          {!hazard && (
            <div>
              <Label htmlFor="cat">{d.submit.category}</Label>
              <Select id="cat" value={category} onChange={(e) => { setCategory(e.target.value as Category); setCatTouched(true); }}>
                <option value="" disabled>{d.submit.categoryPick}</option>
                {categories.filter((c) => c.active && c.id !== "safety").map((c) => <option key={c.id} value={c.id}>{c.name[locale] || c.name.ru}</option>)}
              </Select>
              {route && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-muted">
                  <Route className="mt-px size-3.5 shrink-0 text-accent" />
                  <span>
                    {t("submit.routeTo", { name: route.name })}
                    {route.why && ` · ${t("submit.routeFallback", { why: route.why })}`}
                  </span>
                </p>
              )}
            </div>
          )}
          {mode === "praise" && <p className="text-sm text-muted">{d.submit.hintPraise}</p>}
          {campaign?.campaign.active && campaignId && !hazard && (
            <div className="flex items-start gap-3 border-l-2 border-accent bg-surface-2 px-4 py-3">
              <Megaphone className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="min-w-0 flex-1 text-sm">
                <span className="block text-xs text-muted">{d.campaigns.forCampaign}</span>
                <span className="font-medium">{campaign.campaign.title}</span>
              </p>
              <button type="button" onClick={() => setCampaignId(null)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink" title={d.campaigns.unlink}>
                <X className="size-3.5" /> {d.campaigns.unlink}
              </button>
            </div>
          )}
          {hazard && (
            <p className="flex gap-2.5 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm">
              <Siren className="mt-0.5 size-4 shrink-0 text-accent" />
              {d.submit.hazardBanner}
            </p>
          )}
          <div>
            <Label htmlFor="title">{d.submit.titleLabel}</Label>
            <Input id="title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder={type === "idea" ? d.submit.titlePhIdea : type === "praise" ? d.submit.titlePhPraise : d.submit.titlePhProblem} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label htmlFor="body" className="mb-0">{d.submit.bodyLabel}</Label>
              <span className="text-xs text-muted tabular-nums">{body.length}/4000</span>
            </div>
            <div className="relative">
              <Textarea id="body" rows={7} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={d.submit.bodyPh} className="pb-14" />
              <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={dictation.listening ? "danger" : "ghost"}
                  onClick={dictation.toggle}
                  disabled={dictation.busy}
                  aria-pressed={dictation.listening}
                  aria-label={dictation.listening ? d.submit.stopRec : d.submit.voice}
                >
                  {dictation.busy ? <LoaderCircle className="animate-spin" /> : dictation.listening ? <MicOff /> : <Mic />}
                  {dictation.listening && (
                    <span className="flex h-4 items-end gap-[2px]" aria-hidden>
                      {[0.6, 1, 0.75].map((k, i) => (
                        <span key={i} className="w-[3px] rounded-full bg-current transition-[height] duration-75" style={{ height: `${Math.max(18, dictation.level * k * 100)}%` }} />
                      ))}
                    </span>
                  )}
                  <span className="hidden tabular-nums sm:inline">
                    {dictation.busy ? d.submit.transcribing : dictation.listening ? `${formatSeconds(dictation.seconds)} · ${d.submit.stopRec}` : d.submit.voice}
                  </span>
                </Button>
                <Button type="button" size="sm" variant="soft" onClick={() => runAnalysis(true)} disabled={aiBusy} className="ml-auto">
                  <WandSparkles className={cn(aiBusy && "animate-spin")} />
                  {aiBusy ? d.submit.aiThinking : d.submit.aiImprove}
                </Button>
              </div>
            </div>
          </div>

          {type !== "praise" && (
            <div>
              <Label htmlFor="solution">
                {d.submit.solution} <span className="font-normal text-muted">· {d.submit.solutionOptional}</span>
              </Label>
              <Textarea id="solution" rows={3} maxLength={2000} value={solution} onChange={(e) => setSolution(e.target.value)} placeholder={d.submit.solutionPh} />
            </div>
          )}

          <FilePicker files={files} onChange={setFiles} />

          <AnimatePresence>
            {analysis?.toxic && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 rounded-xl bg-sun-soft px-3.5 py-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-sun" />
                {d.submit.toxic}
              </motion.p>
            )}
            {showSuggestion && analysis && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <Sparkles className="size-4" /> {d.submit.aiSuggestion}
                </p>
                <p className="mt-3 font-semibold">{analysis.improved.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{analysis.improved.body}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => { setTitle(analysis.improved.title); setBody(analysis.improved.body); analyzedFor.current = analysis.improved.title + analysis.improved.body; setShowSuggestion(false); }}>
                    <Check /> {d.submit.aiApply}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSuggestion(false)}>
                    {d.submit.aiDismiss}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="loc">{d.submit.location}</Label>
              <Select id="loc" value={location} onChange={(e) => setLocation(e.target.value as Location | "")}>
                <option value="">—</option>
                {LOCATIONS.map((l) => <option key={l} value={l}>{d.locations[l]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="site">{d.submit.site}</Label>
              <Input id="site" value={site} maxLength={80} onChange={(e) => setSite(e.target.value)} placeholder={d.submit.sitePh} className="h-10" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pr">{d.submit.priority}</Label>
              <Select id="pr" value={priority} onChange={(e) => { setPriority(e.target.value as Priority); setPriorityTouched(true); }}>
                {PRIORITIES.map((c) => <option key={c} value={c}>{d.priorities[c]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="dep">{d.submit.department}</Label>
              <Select id="dep" value={department} onChange={(e) => { setDepartment(e.target.value as Department); setDepartmentTouched(true); }}>
                {DEPARTMENTS.map((c) => <option key={c} value={c}>{d.departments[c]}</option>)}
              </Select>
            </div>
          </div>
          {analysis && (
            <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Sparkles className="size-3.5 text-accent" /> {d.submit.classified}
              {tags.map((tg) => <span key={tg} className="rounded-full bg-surface-2 px-2 py-0.5">#{tg}</span>)}
            </p>
          )}

          <div className="rounded-2xl border border-line p-4">
            <div className="flex items-start gap-3">
              <EyeOff className="mt-0.5 size-5 shrink-0 text-muted" />
              <div className="flex-1">
                <label htmlFor="anon" className="font-medium">{d.submit.anonymous}</label>
                <p className="mt-0.5 text-sm text-muted">{d.submit.anonymousHint}</p>
              </div>
              <Switch id="anon" checked={anonymous} onChange={setAnonymous} />
            </div>
            <AnimatePresence>
              {anonymous && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-medium">{d.submit.privacyTitle}</p>
                    {!analysis ? (
                      <p className="mt-1 text-sm text-muted">{d.submit.privacyRun}</p>
                    ) : analysis.privacy.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {analysis.privacy.map((p) => (
                          <li key={p} className="flex gap-2 text-sm text-danger">
                            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {p}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 flex items-center gap-2 text-sm text-[var(--st-done)]">
                        <ShieldCheck className="size-4" /> {d.submit.privacyOk}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Button size="lg" className="w-full" onClick={submit} disabled={sending}>
            {uploadPct !== null ? `${d.files.uploading} ${Math.round(uploadPct * 100)}%` : sending ? d.submit.sending : d.submit.send}
          </Button>
          {(title || body) && (
            <p className="-mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
              <Save className="size-3.5" /> {d.draft.saved}
              <button
                type="button"
                className="ml-1 font-medium text-ink underline-offset-2 hover:underline"
                onClick={() => {
                  setTitle("");
                  setBody("");
                  setSite("");
                  setAnalysis(null);
                  clearDraft();
                }}
              >
                {d.draft.clear}
              </button>
            </p>
          )}
        </Card>

        <aside>
          <AnimatePresence mode="popLayout">
            {similar.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}>
                <Card className="sticky top-24 border-sun/50 p-5">
                  <p className="font-semibold">{d.submit.similarTitle}</p>
                  <p className="mt-1 text-sm text-muted">{d.submit.similarHint}</p>
                  <ul className="mt-4 space-y-3">
                    {similar.map((s) => (
                      <li key={s.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={s.status} />
                          <span className="text-[11px] text-muted">{t("submit.match", { p: Math.round(s.score * 100) })}</span>
                        </div>
                        <Link href={`/ideas/${s.id}`} target="_blank" className="mt-1.5 block text-sm font-medium leading-snug hover:text-accent">
                          {ticketCode(s.number)} {s.title}
                        </Link>
                        <Button
                          size="sm"
                          variant={supported.has(s.id) ? "primary" : "outline"}
                          className="mt-2.5 w-full"
                          disabled={supported.has(s.id)}
                          onClick={async () => {
                            try {
                              await api(`/api/feedback/${s.id}/vote`, "POST");
                              setSupported((x) => new Set(x).add(s.id));
                              toast.success(d.submit.supported);
                            } catch {
                              toast.error(d.common.error);
                            }
                          }}
                        >
                          <ArrowUp /> {supported.has(s.id) ? d.submit.supported : `${d.submit.support} · ${s.votes + 1}`}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </>
  );
}

function Success({ f, onAnother }: { f: FeedbackView & { trackingCode?: string }; onAnother: () => void }) {
  const { d, t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-xl">
      <Card className="p-8 text-center">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
          className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--st-done)] text-white"
        >
          <Check className="size-8" strokeWidth={3} />
        </motion.span>
        <h1 className="mt-6 font-display text-2xl font-semibold">{t("submit.successTitle", { n: f.code })}</h1>
        <p className="mt-2 text-muted">{d.submit.successText}</p>

        {f.trackingCode && (
          <div className="mt-6 rounded-2xl border border-dashed border-accent p-5">
            <p className="text-sm font-medium">{d.submit.codeTitle}</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <code className="font-mono text-2xl font-bold tracking-widest text-accent">{f.trackingCode}</code>
              <Button
                size="icon"
                variant="ghost"
                aria-label={d.common.copy}
                onClick={() => {
                  navigator.clipboard.writeText(f.trackingCode!);
                  setCopied(true);
                  toast.success(d.common.copied);
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">{d.submit.codeHint}</p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={f.trackingCode ? `/track?code=${f.trackingCode}` : `/ideas/${f.id}`} className={buttonVariants()}>
            {d.submit.open}
          </Link>
          <Button variant="outline" onClick={onAnother}>
            {d.submit.another}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitForm />
    </Suspense>
  );
}
