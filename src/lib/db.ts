import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SEED_FILES, buildSeed } from "./seed";
import { SLA_CRITICAL, SLA_HIGH, SLA_HOURS, isFinal, ticketCode, type SysNote, type Campaign, type CampaignView, type DB, type Feedback, type FeedbackView, type User } from "./types";

// DATA_DIR lets tests (and deployments) keep their data apart from the demo database.
const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const FILE = path.join(DIR, "db.json");
const VERSION = 9;
export const UPLOADS = path.join(DIR, "uploads");

const g = globalThis as unknown as { __db?: DB };

export function db(): DB {
  if (g.__db?.version === VERSION) return g.__db;
  const stored = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as DB) : null;
  // Older data files use a different department list; start fresh from the demo seed.
  if (stored && stored.version === VERSION) {
    g.__db = stored;
  } else {
    g.__db = buildSeed();
    writeSeedFiles();
    persist();
  }
  return g.__db!;
}

/** Placeholder attachments of the demo dataset ("файлы-заглушки"), so attached files really open. */
function writeSeedFiles() {
  if (!existsSync(UPLOADS)) mkdirSync(UPLOADS, { recursive: true });
  for (const f of SEED_FILES) {
    const p = path.join(UPLOADS, f.id);
    if (!existsSync(p)) writeFileSync(p, f.content, "utf8");
  }
}

/** Atomic write: temp file + rename, so a crash never leaves half a JSON file. */
export function persist() {
  if (!g.__db) return;
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(g.__db, null, 2));
  renameSync(tmp, FILE);
}

export function mutate<T>(fn: (d: DB) => T): T {
  const result = fn(db());
  persist();
  return result;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);

export function trackingCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
  return `GL-${part()}-${part()}`;
}

export function slaFor(f: Pick<Feedback, "priority" | "category">) {
  if (f.priority === "critical" || f.category === "safety") return SLA_CRITICAL;
  if (f.priority === "high") return SLA_HIGH;
  return SLA_HOURS;
}

/** When the ticket entered its current status (a reassignment inside the status does not restart the clock). */
export function statusSince(f: Feedback): string {
  let i = f.history.length - 1;
  while (i > 0 && f.history[i - 1].status === f.status) i--;
  return f.history[i]?.at ?? f.createdAt;
}

export function deadlineOf(f: Feedback): string | null {
  const hours = slaFor(f)[f.status];
  if (!hours) return null;
  return new Date(new Date(statusSince(f)).getTime() + hours * 3600_000).toISOString();
}

/**
 * When an overdue ticket escalates: urgent ones (critical, high, safety) right at the deadline,
 * any other ticket 48 hours after it. null while there is nothing to escalate.
 */
export function escalationAt(f: Feedback): string | null {
  if (f.mergedInto || isFinal(f.status)) return null;
  const dl = deadlineOf(f);
  if (!dl) return null;
  const urgent = f.priority === "critical" || f.priority === "high" || f.category === "safety";
  const t = new Date(dl).getTime() + (urgent ? 0 : 48 * 3600_000);
  return t <= Date.now() ? new Date(t).toISOString() : null;
}

export function isEscalated(f: Feedback) {
  return escalationAt(f) !== null;
}

/**
 * Escalation is a real notification, not just a badge: once per status, the head of unit (the fallback responsible)
 * gets "срочно — нужна реакция", the responsible person gets a reminder, and the history records who was told.
 * Runs lazily on frequent requests (/api/me is polled by every open page), so no background job is needed.
 */
export function sweepEscalations() {
  const d = db();
  const due = d.feedback.filter((f) => {
    if (!escalationAt(f)) return false;
    const since = statusSince(f);
    return !f.history.some((h) => h.event === "escalation" && h.status === f.status && h.at >= since);
  });
  if (!due.length) return;
  mutate((dd) => {
    const admin = dd.users.find((u) => u.role === "admin");
    const head = dd.users.find((u) => u.id === dd.settings.fallbackAssigneeId && !u.away);
    for (const f of due) {
      const at = escalationAt(f)!;
      // If the head is the responsible person (or away), the administrator is told instead.
      const target = head && head.id !== f.assigneeId ? head : admin;
      if (!target) continue;
      f.history.push({ status: f.status, at, by: null, event: "escalation", note: `Срок истёк — уведомлён ${target.name}`, sys: { kind: "escalation", to: target.name } });
      f.history.sort((a, b) => a.at.localeCompare(b.at));
      notify(target.id, f.id, "escalation", f.status, at);
      if (f.assigneeId && f.assigneeId !== target.id) notify(f.assigneeId, f.id, "escalation", f.status, at);
    }
  });
}

/**
 * Routing by the administrator's rules: category → responsible person.
 * If the category has no responsible, or that person is marked as away, the fallback responsible gets the ticket.
 * Returns the note that is written into the ticket history, so the route is transparent to everyone.
 */
export function autoRoute(f: Pick<Feedback, "category">): { assigneeId?: string; note: string; sys: SysNote } {
  const d = db();
  const byId = (id?: string) => (id ? d.users.find((u) => u.id === id) : undefined);
  const cat = d.categories.find((c) => c.id === f.category);
  const owner = byId(cat?.responsibleId);
  const catName = cat?.name.ru ?? f.category;
  if (owner && !owner.away) return { assigneeId: owner.id, note: `Маршрут: «${catName}» → ${owner.name}`, sys: { kind: "route", category: f.category, to: owner.name } };
  const fallback = byId(d.settings.fallbackAssigneeId);
  const backup = fallback && !fallback.away ? fallback : d.users.find((u) => u.role === "admin");
  const why = owner ? `${owner.name} отсутствует` : "для категории не задан ответственный";
  return {
    assigneeId: backup?.id,
    note: `Маршрут: «${catName}» → ${backup?.name ?? "—"} (резерв: ${why})`,
    sys: { kind: "routeFallback", category: f.category, to: backup?.name ?? "—", awayOwner: owner?.name },
  };
}

/** Category name in the requested language (server side). */
export function catName(id: string, locale: "ru" | "kk" = "ru") {
  const c = db().categories.find((x) => x.id === id);
  return c ? c.name[locale] || c.name.ru : id;
}

export { ticketCode };

/**
 * Who may change a ticket (status, decision, next action, responsible):
 * the administrator; the responsible person it is assigned to; a reviewer of the same department;
 * the fallback responsible (head of unit) as the escalation point. Other reviewers see it read-only.
 */
export function canProcess(u: User | null, f: Pick<Feedback, "assigneeId" | "department">) {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "reviewer") return false;
  return !f.assigneeId || f.assigneeId === u.id || f.department === u.department || db().settings.fallbackAssigneeId === u.id;
}

const pickUser = (u?: User) => (u ? { id: u.id, name: u.name, color: u.color, department: u.department, position: u.position } : null);

export function toView(f: Feedback, viewer: User | null, opts: { viaCode?: boolean } = {}): FeedbackView {
  const d = db();
  const assignee = d.users.find((u) => u.id === f.assigneeId);
  const { authorId, trackingCode: _code, votes, followers = [], ...rest } = f;
  const isMine = !!opts.viaCode || (!!viewer && authorId === viewer.id);
  const deadline = deadlineOf(f);
  return {
    ...rest,
    author: f.anonymous ? null : pickUser(d.users.find((u) => u.id === authorId)),
    code: ticketCode(f.number),
    assignee: assignee ? { id: assignee.id, name: assignee.name, color: assignee.color, department: assignee.department, position: assignee.position } : null,
    canProcess: !opts.viaCode && canProcess(viewer, f),
    isMine,
    votesCount: votes.length,
    voted: !!viewer && votes.includes(viewer.id),
    following: !!viewer && followers.includes(viewer.id),
    campaign: (() => {
      const c = f.campaignId ? d.campaigns.find((x) => x.id === f.campaignId) : undefined;
      return c ? { id: c.id, title: c.title } : null;
    })(),
    followersCount: followers.length,
    attachments: f.attachments ?? [],
    deadline,
    overdue: !!deadline && new Date(deadline).getTime() < Date.now(),
    escalated: isEscalated(f),
    commentsView: f.comments.map((c) => ({
      ...c,
      // Comments written by the anonymous author are always shown without a name.
      author: c.authorId ? pickUser(d.users.find((u) => u.id === c.authorId)) : null,
    })),
  };
}

/**
 * The single place where every portal notification is created. An integration (e.g. a Bitrix24 chat message)
 * plugs in here, so all events reach it without touching the rest of the code.
 */
export function notify(userId: string | null | undefined, feedbackId: string, kind: "status" | "comment" | "escalation" | "assigned" | "clarify", status?: Feedback["status"], at = new Date().toISOString()) {
  if (!userId) return;
  db().notifications.unshift({ id: uid("n"), userId, feedbackId, kind, status, at, read: false });
}

export const campaignActive = (c: Campaign) => !c.closedAt && new Date(c.deadline).getTime() > Date.now();

export function campaignView(c: Campaign): CampaignView {
  const d = db();
  const ideas = d.feedback.filter((f) => f.campaignId === c.id && !f.mergedInto);
  return {
    ...c,
    active: campaignActive(c),
    ideas: ideas.length,
    participants: new Set(ideas.map((f) => f.authorId)).size,
    votes: ideas.reduce((s, f) => s + f.votes.length, 0),
    author: d.users.find((u) => u.id === c.createdBy)?.name ?? "",
  };
}

/** Status news goes to the author and to everyone who follows the ticket (once each, never to the actor). */
export function notifyWatchers(f: Feedback, actorId: string | null, kind: "status" | "comment" | "clarify", status?: Feedback["status"]) {
  const ids = new Set([f.authorId, ...(f.followers ?? [])].filter((x): x is string => !!x && x !== actorId));
  ids.forEach((id) => notify(id, f.id, kind, status));
}

export function mondayOf(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
