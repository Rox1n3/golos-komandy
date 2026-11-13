import { NextResponse } from "next/server";
import { db, mutate } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/session";

/** Administrator marks a responsible person as away (vacation, sick leave): routing then uses the fallback. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (!db().users.some((u) => u.id === id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const u = mutate((d) => {
    const u = d.users.find((x) => x.id === id)!;
    if (typeof b.away === "boolean") u.away = b.away || undefined;
    return u;
  });
  return NextResponse.json(u);
}
