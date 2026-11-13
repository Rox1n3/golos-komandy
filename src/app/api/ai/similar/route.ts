import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { findSimilar } from "@/lib/ai";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const { title = "", body = "", excludeId } = await req.json();
  if (`${title}${body}`.trim().length < 8) return NextResponse.json([]);
  return NextResponse.json(await findSimilar(String(title), String(body), excludeId));
}
