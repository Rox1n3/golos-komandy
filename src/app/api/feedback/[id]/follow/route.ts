import { NextResponse } from "next/server";
import { mutate, toView } from "@/lib/db";
import { currentUser } from "@/lib/session";

/** Toggle following: followers get every status change of the ticket in their notifications. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const f = mutate((d) => {
    const f = d.feedback.find((x) => x.id === id);
    if (!f) return null;
    const set = new Set(f.followers ?? []);
    if (set.has(user.id)) set.delete(user.id);
    else set.add(user.id);
    f.followers = [...set];
    return f;
  });
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(f, user));
}
