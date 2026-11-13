import { NextResponse } from "next/server";
import { autoRoute, campaignActive, db, deadlineOf, mutate, notify, sweepEscalations, ticketCode, toView, trackingCode, uid } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { DEPARTMENTS, LOCATIONS, PRIORITIES, TYPES, isFinal, type Feedback } from "@/lib/types";

export async function GET(req: Request) {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const user = await currentUser();
  sweepEscalations();
  let list = db().feedback.filter((f) => !f.mergedInto);
  if (p.mine === "1") list = list.filter((f) => f.authorId === user.id);
  if (p.status) list = list.filter((f) => p.status.split(",").includes(f.status));
  if (p.type) list = list.filter((f) => f.type === p.type);
  if (p.category) list = list.filter((f) => f.category === p.category);
  if (p.campaign) list = list.filter((f) => f.campaignId === p.campaign);
  if (p.department) list = list.filter((f) => f.department === p.department);
  if (p.priority) list = list.filter((f) => f.priority === p.priority);
  // "My queue" for the responsible person.
  if (p.assignee === "me") list = list.filter((f) => f.assigneeId === user.id);
  if (p.overdue === "1") {
    const now = Date.now();
    list = list.filter((f) => {
      const d = deadlineOf(f);
      return !isFinal(f.status) && !!d && +new Date(d) < now;
    });
  }
  if (p.q) {
    const q = p.q.toLowerCase();
    list = list.filter((f) => `${f.title} ${f.body} ${f.solution ?? ""} ${f.tags.join(" ")} ${ticketCode(f.number)} #${f.number}`.toLowerCase().includes(q));
  }
  const sorters: Record<string, (a: Feedback, b: Feedback) => number> = {
    top: (a, b) => b.votes.length - a.votes.length,
    new: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    updated: (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
  };
  list = list.slice().sort(sorters[p.sort] ?? sorters.new);
  return NextResponse.json(list.map((f) => toView(f, user)));
}

export async function POST(req: Request) {
  const user = await currentUser();
  const b = await req.json();
  const title = String(b.title ?? "").trim();
  const body = String(b.body ?? "").trim();
  if (title.length < 5 || body.length < 15) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const anonymous = !!b.anonymous;
  const now = new Date().toISOString();
  // Only active categories from the administrator's list are accepted.
  const category = db().categories.some((c) => c.active && c.id === b.category) ? String(b.category) : "other";
  const solution = String(b.solution ?? "").trim().slice(0, 2000) || undefined;
  const created = mutate((d) => {
    const route = autoRoute({ category });
    const owner = d.users.find((u) => u.id === route.assigneeId);
    const f: Feedback = {
      id: uid("f"),
      number: d.counter++,
      type: TYPES.includes(b.type) ? b.type : "idea",
      title: title.slice(0, 140),
      body: body.slice(0, 4000),
      solution,
      category,
      priority: PRIORITIES.includes(b.priority) ? b.priority : category === "safety" ? "critical" : "medium",
      // The department the ticket concerns: chosen by the author, otherwise the responsible person's department.
      department: DEPARTMENTS.includes(b.department) ? b.department : owner?.department ?? user.department,
      location: LOCATIONS.includes(b.location) ? b.location : undefined,
      site: String(b.site ?? "").trim().slice(0, 80) || undefined,
      tags: Array.isArray(b.tags) ? b.tags.slice(0, 5).map((t: unknown) => String(t).slice(0, 24)) : [],
      sentiment: b.sentiment,
      anonymous,
      // Kept server-side only so the author sees "my" tickets; never sent to clients for anonymous tickets.
      authorId: user.id,
      trackingCode: anonymous ? trackingCode() : undefined,
      status: "new",
      // The routing decision is written into the history, so everyone sees why this person got the ticket.
      history: [{ status: "new", at: now, by: null, note: route.note, sys: route.sys }],
      assigneeId: route.assigneeId,
      votes: [],
      comments: [],
      followers: anonymous ? [] : [user.id],
      campaignId: d.campaigns.find((c) => c.id === b.campaignId && campaignActive(c))?.id,
      createdAt: now,
      updatedAt: now,
    };
    d.feedback.unshift(f);
    // The responsible person hears about a new ticket immediately (safety tickets have a 4-hour clock).
    notify(f.assigneeId, f.id, f.category === "safety" || f.priority === "critical" ? "escalation" : "assigned", "new");
    return f;
  });
  return NextResponse.json({ ...toView(created, user), trackingCode: created.trackingCode });
}
