import { NextResponse } from "next/server";
import { campaignView, db, mutate, uid } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";
import { DEPARTMENTS, type Campaign } from "@/lib/types";

export async function GET() {
  const list = db().campaigns.map(campaignView);
  // Active first (closest deadline first), then finished ones, newest first.
  list.sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.active ? +new Date(a.deadline) - +new Date(b.deadline) : +new Date(b.deadline) - +new Date(a.deadline)));
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!canReview(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const title = String(b.title ?? "").trim().slice(0, 100);
  const question = String(b.question ?? "").trim().slice(0, 1500);
  const days = Math.min(90, Math.max(1, Math.round(Number(b.days) || 14)));
  if (title.length < 5 || question.length < 15) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const c = mutate((d) => {
    const c: Campaign = {
      id: uid("c"),
      title,
      question,
      audience: DEPARTMENTS.includes(b.audience) ? b.audience : "all",
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      deadline: new Date(Date.now() + days * 86400_000).toISOString(),
      winners: [],
    };
    d.campaigns.unshift(c);
    return c;
  });
  return NextResponse.json(campaignView(c));
}
