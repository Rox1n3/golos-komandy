import { NextResponse } from "next/server";
import { db, mondayOf, mutate, uid } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/types";

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
/** Departments with fewer answers than this are hidden so nobody can be identified. */
const MIN_GROUP = 3;

export async function GET() {
  const user = await currentUser();
  const all = db().pulse;
  const week = mondayOf();
  const weeks = [...new Set(all.map((p) => p.week))].sort().slice(-8);
  if (!weeks.includes(week)) weeks.push(week);
  const recent = all.filter((p) => weeks.slice(-4).includes(p.week));
  return NextResponse.json({
    week,
    answered: all.some((p) => p.userId === user.id && p.week === week),
    current: avg(all.filter((p) => p.week === week).map((p) => p.score)),
    trend: weeks.map((w) => {
      const xs = all.filter((p) => p.week === w).map((p) => p.score);
      return { week: w, avg: avg(xs), count: xs.length };
    }),
    byDepartment: DEPARTMENTS.map((dep) => {
      const xs = recent.filter((p) => p.department === dep).map((p) => p.score);
      return { key: dep, avg: xs.length >= MIN_GROUP ? avg(xs) : null, count: xs.length };
    }).filter((x) => x.count > 0),
    // Comments are shown without names, only to reviewers, and only from groups (week + department) of at least MIN_GROUP answers.
    comments: canReview(user)
      ? all
          .filter((p) => p.comment && all.filter((x) => x.week === p.week && x.department === p.department).length >= MIN_GROUP)
          .sort((a, b) => b.at.localeCompare(a.at))
          .filter((p, i, xs) => xs.findIndex((x) => x.comment === p.comment) === i)
          .slice(0, 8)
          .map((p) => ({ text: p.comment, score: p.score, at: p.at }))
      : [],
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  const { score, comment } = await req.json();
  const s = Math.round(Number(score));
  if (!(s >= 1 && s <= 5)) return NextResponse.json({ error: "bad_score" }, { status: 400 });
  const week = mondayOf();
  mutate((d) => {
    d.pulse = d.pulse.filter((p) => !(p.userId === user.id && p.week === week));
    d.pulse.push({
      id: uid("p"),
      userId: user.id,
      department: DEPARTMENTS.includes(user.department) ? user.department : "admin",
      week,
      score: s,
      comment: String(comment ?? "").trim().slice(0, 500) || undefined,
      at: new Date().toISOString(),
    });
  });
  return NextResponse.json({ ok: true });
}
