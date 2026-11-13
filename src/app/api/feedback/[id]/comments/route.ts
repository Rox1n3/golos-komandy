import { NextResponse } from "next/server";
import { mutate, notify, toView } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const { text, code } = await req.json();
  const clean = String(text ?? "").trim().slice(0, 2000);
  if (!clean) return NextResponse.json({ error: "empty" }, { status: 400 });
  const f = mutate((d) => {
    const f = d.feedback.find((x) => x.id === id);
    if (!f) return null;
    if (code && code !== f.trackingCode) return null;
    const isAuthor = !!code || f.authorId === user.id;
    // The anonymous author writes via the tracking code (or as the hidden author) and stays anonymous.
    const asAnonAuthor = f.anonymous && isAuthor;
    const now = new Date().toISOString();
    f.comments.push({
      id: crypto.randomUUID(),
      authorId: asAnonAuthor ? null : user.id,
      text: clean,
      at: now,
      official: !isAuthor && canReview(user),
    });
    f.updatedAt = now;
    // The author answered a clarification request: the ticket goes back to review automatically.
    if (isAuthor && f.status === "needs_info") {
      f.status = "review";
      f.history.push({ status: "review", at: now, by: null, note: "Автор ответил на уточнение", sys: { kind: "authorAnswered" } });
    }
    if (!isAuthor) notify(f.authorId, f.id, "comment");
    // The responsible person hears about every comment they did not write themselves.
    if (f.assigneeId && f.assigneeId !== user.id) notify(f.assigneeId, f.id, "comment");
    return f;
  });
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(f, code ? null : user, { viaCode: !!code }));
}
