"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Hourglass, Inbox, Lightbulb, MessageSquare, Search, TriangleAlert, UserRoundCheck, X } from "lucide-react";
import { useApp, useFetch, useI18n } from "@/components/providers";
import { AnimatedTabs, EmptyState } from "@/components/ui/widgets";
import { Input, Select, Skeleton, buttonVariants } from "@/components/ui/primitives";
import { FeedbackCard, PageHeader } from "@/components/feedback-bits";
import { DEPARTMENTS, PRIORITIES, STATUSES, type FeedbackView } from "@/lib/types";
import { cn } from "@/lib/utils";

type TypeTab = "all" | "idea" | "problem" | "praise";

/** Feed with the filters of the dataset checks: department, category, status, priority and deadline (overdue). */
export default function Feed() {
  const { d, t, locale } = useI18n();
  const { categories, isReviewer } = useApp();
  const [type, setType] = useState<TypeTab>("all");
  const [sort, setSort] = useState<"top" | "new" | "updated">("new");
  const [status, setStatus] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [overdue, setOverdue] = useState(false);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  // Filters can come from a link, e.g. /ideas?overdue=1 from the analytics page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("overdue") === "1") setOverdue(true);
    if (p.get("assignee") === "me") setMine(true);
    if (p.get("status")) setStatus(p.get("status")!);
    if (p.get("category")) setCategory(p.get("category")!);
    if (p.get("department")) setDepartment(p.get("department")!);
    if (p.get("q")) setQ(p.get("q")!);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const qs = new URLSearchParams({ sort });
  if (type !== "all") qs.set("type", type);
  if (status) qs.set("status", status);
  if (category) qs.set("category", category);
  if (department) qs.set("department", department);
  if (priority) qs.set("priority", priority);
  if (overdue) qs.set("overdue", "1");
  if (mine) qs.set("assignee", "me");
  if (debounced) qs.set("q", debounced);
  const { data, setData, loading } = useFetch<FeedbackView[]>(`/api/feedback?${qs}`);
  const filtered = !!(status || category || department || priority || overdue || mine || debounced || type !== "all");
  const reset = () => {
    setType("all");
    setStatus("");
    setCategory("");
    setDepartment("");
    setPriority("");
    setOverdue(false);
    setMine(false);
    setQ("");
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, Icon: typeof Hourglass) => (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition",
        on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );

  return (
    <>
      <PageHeader title={d.feed.title} subtitle={d.feed.subtitle}>
        <Link href="/submit" className={buttonVariants()}>
          {d.feed.create}
        </Link>
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AnimatedTabs
            value={type}
            onChange={setType}
            tabs={[
              { value: "all", label: d.common.all },
              { value: "problem", label: d.types.problem, icon: TriangleAlert },
              { value: "idea", label: d.types.idea, icon: Lightbulb },
              { value: "praise", label: d.submit.praiseTab, icon: Heart },
            ]}
          />
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.feed.searchPh} className="h-10 pl-10" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", ...STATUSES].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] transition",
                status === s ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink",
              )}
            >
              {s ? d.status[s as keyof typeof d.status] : d.common.all}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="min-w-0 sm:w-48" aria-label={d.feed.department}>
            <option value="">{d.feed.allDepartments}</option>
            {DEPARTMENTS.map((dep) => <option key={dep} value={dep}>{d.departments[dep]}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-0 sm:w-56" aria-label={d.feed.category}>
            <option value="">{d.feed.allCategories}</option>
            {categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name[locale] || c.name.ru}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="min-w-0 sm:w-44" aria-label={d.feed.priority}>
            <option value="">{d.feed.allPriorities}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{d.priorities[p]}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="min-w-0 sm:ml-auto sm:w-48" aria-label="sort">
            <option value="new">{d.feed.sortNew}</option>
            <option value="top">{d.feed.sortTop}</option>
            <option value="updated">{d.feed.sortUpdated}</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toggle(overdue, setOverdue, d.feed.overdue, Hourglass)}
          {isReviewer && toggle(mine, setMine, d.feed.assignedToMe, UserRoundCheck)}
          {data && <span className="ml-1 text-[13px] text-muted">{t("feed.found", { n: data.length })}</span>}
          {filtered && (
            <button onClick={reset} className="ml-auto inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
              <X className="size-3.5" /> {d.feed.reset}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {loading && !data && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        {data?.map((f) => (
          <FeedbackCard key={f.id} f={f} onChange={(nf) => setData((l) => l?.map((x) => (x.id === nf.id ? nf : x)) ?? null)} />
        ))}
        {data && data.length === 0 && (
          <EmptyState
            icons={[Search, Lightbulb, MessageSquare]}
            title={d.feed.empty}
            description={d.feed.emptyHint}
            action={<Link href="/submit" className={buttonVariants({ variant: "outline" })}><Inbox /> {d.feed.create}</Link>}
          />
        )}
      </div>
    </>
  );
}
