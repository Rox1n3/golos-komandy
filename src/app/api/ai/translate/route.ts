import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { translate } from "@/lib/ai-extra";
import type { Locale } from "@/lib/ai";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const { id, to = "ru" } = await req.json();
  const f = db().feedback.find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await translate(f, to as Locale);
  if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(r);
}
