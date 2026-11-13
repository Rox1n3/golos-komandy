import { NextResponse } from "next/server";
import { draftReply, type Locale } from "@/lib/ai";
import { db } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";

export async function POST(req: Request) {
  if (!canReview(await currentUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, status, locale = "ru" } = await req.json();
  const f = db().feedback.find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ reply: await draftReply(f, status, locale as Locale) });
}
