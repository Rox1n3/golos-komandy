import { NextResponse } from "next/server";
import { db, deadlineOf, isEscalated, ticketCode } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";
import { DEPARTMENTS, STATUSES, TYPES, isFinal, type Feedback } from "@/lib/types";

/** Hours from creation to the first reaction of the responsible side: a status change or an official comment. */
function firstResponseH(f: Feedback) {
  const moves = f.history.filter((h) => h.status !== "new" && !h.event).map((h) => +new Date(h.at));
  const official = f.comments.filter((c) => c.official).map((c) => +new Date(c.at));
  const first = Math.min(...moves, ...official);
  return Number.isFinite(first) ? (first - +new Date(f.createdAt)) / 3600_000 : null;
}

const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100);

export async function GET() {
  const user = await currentUser();
  const d = db();
  const all = d.feedback.filter((f) => !f.mergedInto);
  const now = Date.now();
  const firstResponse = all.map(firstResponseH).filter((x): x is number => x !== null);
  const active = all.filter((f) => !isFinal(f.status));
  const isOverdue = (f: Feedback) => {
    const dl = deadlineOf(f);
    return !!dl && +new Date(dl) < now;
  };
  const overdue = active.filter(isOverdue);
  const closed = all.filter((f) => isFinal(f.status));
  const done = all.filter((f) => f.status === "done");
  // "Reviewed" = the responsible side reacted at least once (the ticket left "new").
  const reviewed = all.filter((f) => f.status !== "new");
  // "With a recorded result" = closed with a written decision (implemented, motivated refusal or closed with a note).
  const withResult = closed.filter((f) => (f.resolution?.text ?? "").trim());

  // 8 weekly buckets: created vs closed
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * 86400_000;
    const start = end - 7 * 86400_000;
    const inRange = (iso?: string) => !!iso && +new Date(iso) >= start && +new Date(iso) < end;
    return {
      start: new Date(start).toISOString(),
      created: all.filter((f) => inRange(f.createdAt)).length,
      closed: closed.filter((f) => inRange(f.history[f.history.length - 1].at)).length,
    };
  });

  // Recurring problems: categories and tags that come up again and again.
  const repeatCategories = d.categories
    .map((c) => {
      const items = all.filter((f) => f.category === c.id && f.type !== "praise");
      return { key: c.id, count: items.length, open: items.filter((f) => !isFinal(f.status)).length, codes: items.map((f) => ticketCode(f.number)) };
    })
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count);
  const tagMap = new Map<string, Feedback[]>();
  all.forEach((f) => f.tags.forEach((t) => tagMap.set(t.toLowerCase(), [...(tagMap.get(t.toLowerCase()) ?? []), f])));
  const repeatTags = [...tagMap.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([tag, list]) => ({ tag, count: list.length, codes: list.map((f) => ticketCode(f.number)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Load of each responsible person: open tickets and how many of them are overdue.
  const byAssignee = d.users
    .filter((u) => u.role !== "employee")
    .map((u) => {
      const mine = active.filter((f) => f.assigneeId === u.id);
      return { id: u.id, name: u.name, color: u.color, open: mine.length, overdue: mine.filter(isOverdue).length, away: !!u.away };
    })
    .filter((x) => x.open)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .slice(0, 8);

  const rated = closed.filter((f) => f.rating);
  const full = {
    csat: rated.length ? Math.round((rated.reduce((s, f) => s + f.rating!.score, 0) / rated.length) * 10) / 10 : null,
    csatCount: rated.length,
    reopened: all.filter((f) => f.rating?.reopened).length,
    total: all.length,
    done: done.length,
    closed: closed.length,
    active: active.length,
    overdue: overdue.length,
    needsInfo: all.filter((f) => f.status === "needs_info").length,
    escalated: active.filter(isEscalated).length,
    savings: done.reduce((s, f) => s + (f.resolution?.savings ?? 0), 0),
    // Indicators named in the spec (section 2.7) and in the dataset checks (section 4).
    reviewedShare: pct(reviewed.length, all.length),
    resolvedShare: pct(withResult.length, all.length),
    closedShare: pct(closed.length, all.length),
    implemented: done.length,
    slaRate: active.length ? Math.round(((active.length - overdue.length) / active.length) * 100) : 100,
    avgFirstResponseH: firstResponse.length ? Math.round(firstResponse.reduce((a, b) => a + b, 0) / firstResponse.length) : 0,
    byType: TYPES.map((t) => ({ key: t, value: all.filter((f) => f.type === t).length })),
    byStatus: STATUSES.map((s) => ({ key: s, value: all.filter((f) => f.status === s).length })),
    byCategory: d.categories.map((c) => ({ key: c.id, value: all.filter((f) => f.category === c.id).length })).filter((x) => x.value).sort((a, b) => b.value - a.value),
    byDepartment: DEPARTMENTS.map((dep) => ({ key: dep, value: active.filter((f) => f.department === dep).length })).filter((x) => x.value),
    byAssignee,
    repeatCategories,
    repeatTags,
    weeks,
  };
  // Employees see only the public summary on the home page; the analytics page is for reviewers and the administrator.
  if (!canReview(user)) {
    const { reviewedShare, done, avgFirstResponseH, slaRate, savings } = full;
    return NextResponse.json({ reviewedShare, done, avgFirstResponseH, slaRate, savings });
  }
  return NextResponse.json(full);
}
