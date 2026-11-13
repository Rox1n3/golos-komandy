import { NextResponse } from "next/server";
import { mutate, toView } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const f = mutate((d) => {
    const f = d.feedback.find((x) => x.id === id);
    if (!f || f.authorId === user.id) return f;
    f.votes = f.votes.includes(user.id) ? f.votes.filter((v) => v !== user.id) : [...f.votes, user.id];
    return f;
  });
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(f, user));
}
