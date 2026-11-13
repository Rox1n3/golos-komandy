import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { ask } from "@/lib/ai-extra";
import type { Locale } from "@/lib/ai";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const { question = "", locale = "ru" } = await req.json();
  const q = String(question).trim().slice(0, 500);
  if (q.length < 3) return NextResponse.json({ error: "too_short" }, { status: 400 });
  return NextResponse.json(await ask(q, locale as Locale));
}
