import { NextResponse } from "next/server";
import { pulseInsight } from "@/lib/ai-extra";
import type { Locale } from "@/lib/ai";
import { db } from "@/lib/db";
import { dictionaries } from "@/lib/i18n";
import { canReview, currentUser } from "@/lib/session";

export async function GET(req: Request) {
  if (!canReview(await currentUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locale = (new URL(req.url).searchParams.get("locale") === "kk" ? "kk" : "ru") as Locale;
  return NextResponse.json(await pulseInsight(db().pulse, locale, (dep) => dictionaries[locale].departments[dep]));
}
