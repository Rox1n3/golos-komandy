import { NextResponse } from "next/server";
import { db, mutate, notify, toView } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isFinal } from "@/lib/types";

/**
 * The author rates how the ticket was closed (1-5). A score of 1-2 may send it back for review once,
 * so a formal "rejected" without real work does not silently end the conversation.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const b = await req.json();
  const f0 = db().feedback.find((x) => x.id === id);
  if (!f0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isAuthor = b.code ? b.code === f0.trackingCode : f0.authorId === user.id;
  if (!isAuthor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // A ticket that was sent back can be rated again once it is closed for the second time.
  const closedAt = f0.history[f0.history.length - 1].at;
  const rateable = !f0.rating || (f0.rating.reopened && closedAt > f0.rating.at);
  if (!isFinal(f0.status) || f0.type === "praise" || !rateable) return NextResponse.json({ error: "not_allowed" }, { status: 400 });
  const score = Math.min(5, Math.max(1, Math.round(Number(b.score) || 0)));
  const comment = String(b.comment ?? "").trim().slice(0, 1000) || undefined;
  const reopen = !!b.reopen && score <= 2 && !f0.mergedInto && !f0.rating?.reopened;

  const f = mutate((d) => {
    const f = d.feedback.find((x) => x.id === id)!;
    const now = new Date().toISOString();
    f.rating = { score, comment, at: now, reopened: reopen || f.rating?.reopened || undefined };
    if (comment) f.comments.push({ id: crypto.randomUUID(), authorId: f.anonymous ? null : user.id, text: comment, at: now });
    if (reopen) {
      f.status = "review";
      f.history.push({ status: "review", at: now, by: null, note: "Автор вернул обращение на повторное рассмотрение", sys: { kind: "reopened" } });
      f.resolution = undefined;
      // The ticket goes back to its owner with an escalation flag, so it is not lost in the queue.
      notify(f.assigneeId, f.id, "escalation");
    }
    f.updatedAt = now;
    return f;
  });
  return NextResponse.json(toView(f, b.code ? null : user, { viaCode: !!b.code }));
}
