import { NextResponse } from "next/server";
import { db, mutate } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/session";

export async function GET() {
  return NextResponse.json(db().settings);
}

/** Administrator sets the fallback responsible: gets tickets when the category owner is missing or away. */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (b.fallbackAssigneeId && !db().users.some((u) => u.id === b.fallbackAssigneeId && u.role !== "employee")) {
    return NextResponse.json({ error: "bad_user" }, { status: 400 });
  }
  const s = mutate((d) => {
    if (b.fallbackAssigneeId) d.settings.fallbackAssigneeId = String(b.fallbackAssigneeId);
    return d.settings;
  });
  return NextResponse.json(s);
}
