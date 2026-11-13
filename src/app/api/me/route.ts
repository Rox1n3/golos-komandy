import { NextResponse } from "next/server";
import { db, sweepEscalations } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { aiEnabled } from "@/lib/ai";

export async function GET() {
  const user = await currentUser();
  sweepEscalations();
  const d = db();
  return NextResponse.json({
    user,
    users: d.users,
    // Category list with routing (managed by the administrator) and the fallback responsible.
    categories: d.categories,
    settings: d.settings,
    aiEnabled: aiEnabled(),
    unread: d.notifications.filter((n) => n.userId === user.id && !n.read).length,
  });
}

export async function POST(req: Request) {
  const { userId } = await req.json();
  if (!db().users.some((u) => u.id === userId)) return NextResponse.json({ error: "unknown user" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("uid", userId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  return res;
}
