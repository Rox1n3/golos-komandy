import { NextResponse } from "next/server";
import { canProcess, db, mutate, notify, notifyWatchers, ticketCode, toView } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PRIORITIES, STATUSES, isFinal, parseTicketCode, type Status } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  // Accepts the internal id, the number or the dataset code ("A-001").
  const n = parseTicketCode(decodeURIComponent(id));
  const f = db().feedback.find((x) => x.id === id || (n !== null && x.number === n));
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(f, user));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  const f0 = db().feedback.find((x) => x.id === id);
  if (!f0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Access rights: only the responsible person, their department, the fallback head or the admin may process.
  if (!canProcess(user, f0)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const note = String(b.note ?? "").trim().slice(0, 2000);
  const to = b.status as Status | undefined;
  // A clarification request must contain the question; a refusal must be motivated.
  if (to === "needs_info" && to !== f0.status && !note) return NextResponse.json({ error: "question_required" }, { status: 400 });
  if (to === "rejected" && to !== f0.status && !note && !b.mergeInto) return NextResponse.json({ error: "reason_required" }, { status: 400 });
  // "Реализовано" and "Закрыто" also need the decision written down: the result must be recorded, not just a status.
  if (to && isFinal(to) && to !== f0.status && !note && !b.mergeInto) return NextResponse.json({ error: "decision_required" }, { status: 400 });
  const newAssignee = b.assigneeId ? db().users.find((u) => u.id === b.assigneeId && u.role !== "employee") : undefined;
  if (b.assigneeId && !newAssignee) return NextResponse.json({ error: "bad_assignee" }, { status: 400 });

  const result = mutate((d) => {
    const f = d.feedback.find((x) => x.id === id)!;
    const now = new Date().toISOString();

    if (b.mergeInto) {
      const target = d.feedback.find((x) => x.id === b.mergeInto);
      if (!target || target.id === f.id) return null;
      // Supporters of the duplicate (and its author) automatically support the original.
      target.votes = [...new Set([...target.votes, ...f.votes, ...(f.authorId && f.authorId !== target.authorId ? [f.authorId] : [])])];
      f.mergedInto = target.id;
      f.status = "rejected";
      f.history.push({ status: "rejected", at: now, by: user.id, note: `Объединено с обращением ${ticketCode(target.number)}`, sys: { kind: "merged", code: ticketCode(target.number) } });
      f.resolution = { text: ticketCode(target.number), at: now, by: user.id };
      f.nextAction = undefined;
      f.updatedAt = now;
      notifyWatchers(f, user.id, "status", "rejected");
      return f;
    }

    if (newAssignee && newAssignee.id !== f.assigneeId) {
      const prev = d.users.find((u) => u.id === f.assigneeId)?.name ?? "—";
      f.assigneeId = newAssignee.id;
      // Reassignment is part of the history; the status clock is not restarted (see statusSince).
      f.history.push({ status: f.status, at: now, by: user.id, event: "handover", note: `Ответственный: ${prev} → ${newAssignee.name}`, sys: { kind: "handover", from: prev, to: newAssignee.name } });
      if (newAssignee.id !== user.id) notify(newAssignee.id, f.id, "assigned", f.status);
    }

    if (to && STATUSES.includes(to) && to !== f.status) {
      f.status = to;
      f.history.push({ status: to, at: now, by: user.id, note: note || undefined });
      if (isFinal(to)) {
        const savings = Math.round(Number(b.savings) || 0);
        f.resolution = { text: note, effect: String(b.effect ?? "").trim() || undefined, savings: savings > 0 ? savings : undefined, at: now, by: user.id };
        f.nextAction = undefined;
      }
      if (note) f.comments.push({ id: crypto.randomUUID(), authorId: user.id, text: note, at: now, official: true });
      if (!f.assigneeId) f.assigneeId = user.id;
      if (to === "needs_info") {
        // Only the author is asked to clarify; followers just see the status change.
        if (f.authorId !== user.id) notify(f.authorId, f.id, "clarify", to);
        (f.followers ?? []).filter((x) => x !== f.authorId && x !== user.id).forEach((x) => notify(x, f.id, "status", to));
      } else notifyWatchers(f, user.id, "status", to);
    }
    if (typeof b.nextAction === "string" && !isFinal(f.status)) f.nextAction = b.nextAction.trim().slice(0, 500) || undefined;
    if (b.priority && PRIORITIES.includes(b.priority)) f.priority = b.priority;
    f.updatedAt = now;
    return f;
  });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(result, user));
}
