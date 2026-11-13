import { NextResponse } from "next/server";
import { db, mutate } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/session";

/** Categories with their routing rule. Everyone reads the active ones; the administrator sees and manages all. */
export async function GET() {
  const user = await currentUser();
  const list = db().categories;
  return NextResponse.json(isAdmin(user) ? list : list.filter((c) => c.active));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const ru = String(b.name?.ru ?? "").trim().slice(0, 60);
  const kk = String(b.name?.kk ?? "").trim().slice(0, 60);
  if (ru.length < 2) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const responsibleId = db().users.some((u) => u.id === b.responsibleId && u.role !== "employee") ? String(b.responsibleId) : undefined;
  const created = mutate((d) => {
    const c = { id: `cat-${Math.random().toString(36).slice(2, 8)}`, name: { ru, kk: kk || ru }, responsibleId, active: true };
    // "Другое" always stays last in the list.
    const other = d.categories.findIndex((x) => x.id === "other");
    d.categories.splice(other < 0 ? d.categories.length : other, 0, c);
    return c;
  });
  return NextResponse.json(created);
}
