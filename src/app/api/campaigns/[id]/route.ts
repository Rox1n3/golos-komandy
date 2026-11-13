import { NextResponse } from "next/server";
import { campaignView, db, mutate, notify, toView } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  const d = db();
  const c = d.campaigns.find((x) => x.id === id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ideas = d.feedback
    .filter((f) => f.campaignId === id && !f.mergedInto)
    .sort((a, b) => (c.winners.includes(b.id) ? 1 : 0) - (c.winners.includes(a.id) ? 1 : 0) || b.votes.length - a.votes.length)
    .map((f) => toView(f, user));
  return NextResponse.json({ campaign: campaignView(c), ideas });
}

/** Reviewers close a campaign early, extend it, or mark winning ideas (their authors are notified). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  if (!canReview(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const c = mutate((d) => {
    const c = d.campaigns.find((x) => x.id === id);
    if (!c) return null;
    const now = new Date().toISOString();
    if (b.close) c.closedAt = now;
    if (b.reopenDays) {
      c.closedAt = undefined;
      c.deadline = new Date(Date.now() + Math.min(90, Number(b.reopenDays)) * 86400_000).toISOString();
    }
    if (b.toggleWinner) {
      const f = d.feedback.find((x) => x.id === b.toggleWinner && x.campaignId === id);
      if (f) {
        if (c.winners.includes(f.id)) c.winners = c.winners.filter((w) => w !== f.id);
        else {
          c.winners.push(f.id);
          // The ticket's status does not change, so the author is told with an official comment, not a status notice.
          f.comments.push({ id: crypto.randomUUID(), authorId: user.id, text: `Идея выбрана в кампании «${c.title}».`, at: now, official: true });
          notify(f.authorId, f.id, "comment");
        }
      }
    }
    return c;
  });
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(campaignView(c));
}
