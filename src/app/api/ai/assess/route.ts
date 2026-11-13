import { NextResponse } from "next/server";
import { assess } from "@/lib/ai-extra";
import type { Locale } from "@/lib/ai";
import { db, mutate } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";

export async function POST(req: Request) {
  if (!canReview(await currentUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, locale = "ru", refresh = false } = await req.json();
  const f = db().feedback.find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (f.aiReview && !refresh && f.aiReview.locale === locale) return NextResponse.json(f.aiReview);
  const review = await assess(f, locale as Locale);
  mutate((d) => {
    const t = d.feedback.find((x) => x.id === id);
    if (t) t.aiReview = review;
  });
  return NextResponse.json(review);
}
