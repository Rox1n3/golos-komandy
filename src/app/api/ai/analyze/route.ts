import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { analyze, type Locale } from "@/lib/ai";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const { title = "", body = "", type = "idea", locale = "ru", anonymous = false } = await req.json();
  if (String(body).trim().length < 10) return NextResponse.json({ error: "too_short" }, { status: 400 });
  return NextResponse.json(await analyze(String(title), String(body), type, locale as Locale, !!anonymous));
}
