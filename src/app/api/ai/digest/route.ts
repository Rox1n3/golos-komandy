import { NextResponse } from "next/server";
import { digest, type Locale } from "@/lib/ai";
import { canReview, currentUser } from "@/lib/session";

/** Management digest (Analytics page): reviewers and the administrator only. */
export async function GET(req: Request) {
  if (!canReview(await currentUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locale = (new URL(req.url).searchParams.get("locale") === "kk" ? "kk" : "ru") as Locale;
  return NextResponse.json(await digest(locale));
}
