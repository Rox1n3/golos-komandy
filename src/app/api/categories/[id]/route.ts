import { NextResponse } from "next/server";
import { db, mutate } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/session";

/** Administrator changes a category: name, responsible person (routing rule) or active flag. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (!db().categories.some((c) => c.id === id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (b.responsibleId && !db().users.some((u) => u.id === b.responsibleId && u.role !== "employee")) {
    return NextResponse.json({ error: "bad_responsible" }, { status: 400 });
  }
  const updated = mutate((d) => {
    const c = d.categories.find((x) => x.id === id)!;
    if (b.name?.ru !== undefined) c.name.ru = String(b.name.ru).trim().slice(0, 60) || c.name.ru;
    if (b.name?.kk !== undefined) c.name.kk = String(b.name.kk).trim().slice(0, 60) || c.name.kk;
    // Empty string clears the rule: tickets of this category go to the fallback responsible.
    if (b.responsibleId !== undefined) c.responsibleId = b.responsibleId || undefined;
    // "Другое" is the catch-all category and cannot be switched off.
    if (typeof b.active === "boolean" && c.id !== "other") c.active = b.active;
    return c;
  });
  return NextResponse.json(updated);
}
