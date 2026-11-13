export type Role = "employee" | "reviewer" | "admin";
export type FeedbackType = "idea" | "problem" | "praise";
/** Category id. The list itself lives in the DB and is managed by the administrator (see CategoryDef). */
export type Category = string;
export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "new" | "review" | "needs_info" | "accepted" | "in_progress" | "done" | "rejected" | "closed";
export type Department = "sales" | "procurement" | "projects" | "design" | "service" | "logistics" | "hr" | "finance" | "it" | "admin";
export type Location = "office" | "warehouse" | "site" | "remote";
export type Sentiment = "negative" | "neutral" | "positive";

export const STATUSES: Status[] = ["new", "review", "needs_info", "accepted", "in_progress", "done", "rejected", "closed"];
export const FLOW: Status[] = ["new", "review", "accepted", "in_progress", "done"];
/** Statuses that end the review: the ticket has a recorded result. */
export const FINAL: Status[] = ["done", "rejected", "closed"];
export const isFinal = (s: Status) => FINAL.includes(s);
export const TYPES: FeedbackType[] = ["idea", "problem", "praise"];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
export const DEPARTMENTS: Department[] = ["sales", "procurement", "projects", "design", "service", "logistics", "hr", "finance", "it", "admin"];
export const LOCATIONS: Location[] = ["office", "warehouse", "site", "remote"];

/** Ticket code shown everywhere, in the dataset format: 1 → "A-001". */
export const ticketCode = (n: number) => `A-${String(n).padStart(3, "0")}`;
/** Parses "A-001", "a-1" or "1" back to the number. */
export const parseTicketCode = (s: string) => {
  const m = /^(?:a-?)?0*(\d+)$/i.exec(s.trim());
  return m ? Number(m[1]) : null;
};

/**
 * Hours a ticket may stay in a status before it is overdue. Safety-critical tickets get a much shorter clock.
 * "needs_info" has no clock: the ticket waits for the author, so the responsible person is not penalised.
 */
export const SLA_HOURS: Partial<Record<Status, number>> = { new: 48, review: 120, accepted: 168, in_progress: 720 };
export const SLA_CRITICAL: Partial<Record<Status, number>> = { new: 4, review: 24, accepted: 72, in_progress: 336 };
export const SLA_HIGH: Partial<Record<Status, number>> = { new: 24, review: 72, accepted: 168, in_progress: 504 };

export interface User {
  id: string;
  name: string;
  role: Role;
  department: Department;
  position: string;
  color: string;
  /** Responsible person is away (vacation, sick leave): routing skips them and uses the fallback. */
  away?: boolean;
}

/** Category of tickets with its routing rule. Managed by the administrator on the settings page. */
export interface CategoryDef {
  id: string;
  name: { ru: string; kk: string };
  /** Responsible user the ticket is routed to; the fallback is used when empty or away. */
  responsibleId?: string;
  active: boolean;
}

export interface Settings {
  /** Who gets a ticket when its category has no responsible or that person is away. */
  fallbackAssigneeId: string;
}

/**
 * A phrase written by the system (not by a person), stored as a template so the interface shows it in its language.
 * Names of people and roles are data and stay as they are; the category is an id and is shown translated.
 */
export type SysNote =
  | { kind: "route"; category: string; to: string }
  | { kind: "routeFallback"; category: string; to: string; awayOwner?: string }
  | { kind: "escalation"; to: string }
  | { kind: "handover"; from: string; to: string }
  | { kind: "merged"; code: string }
  | { kind: "authorAnswered" | "reopened" | "taken" | "accepted" | "ideaAccepted" | "clarifyAsked" };

export interface HistoryEntry {
  status: Status;
  at: string;
  by: string | null;
  /** Russian text of the note (also used by export and AI). For system phrases see `sys`. */
  note?: string;
  sys?: SysNote;
  /** An event inside the current status (the status itself did not change). */
  event?: "handover" | "escalation";
}

export interface Comment {
  id: string;
  authorId: string | null; // null = anonymous author of the ticket
  text: string;
  at: string;
  official?: boolean;
}

export interface Resolution {
  text: string;
  effect?: string;
  /** Estimated savings, ₸ per year, entered by the reviewer when an idea is implemented. */
  savings?: number;
  at: string;
  by: string;
}

/** A file attached to a ticket. Bytes live in data/uploads/<id>; only metadata is kept in the DB. */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  at: string;
  /** Uploader; null for the anonymous author so the file never reveals who wrote the ticket. */
  by: string | null;
}

/** Author's verdict on how the ticket was closed: closes the "black hole" loop. */
export interface Rating {
  score: number; // 1..5
  comment?: string;
  at: string;
  /** The author was unhappy and sent the ticket back for another look (allowed once). */
  reopened?: boolean;
}

export const MAX_FILE_MB = 25;
export const MAX_FILES = 10;

export interface AiReview {
  summary: string;
  impact: number; // 1..5
  effort: number; // 1..5
  savings: number; // ₸ per year, rough estimate
  risks: string[];
  steps: string[];
  owner: Department;
  source: "openai" | "local";
  at: string;
  locale: string;
}

export interface Feedback {
  id: string;
  number: number;
  type: FeedbackType;
  title: string;
  body: string;
  /** Author's proposed solution (optional), separate from the problem description. */
  solution?: string;
  category: Category;
  priority: Priority;
  department: Department;
  location?: Location;
  site?: string;
  tags: string[];
  anonymous: boolean;
  authorId: string | null;
  trackingCode?: string;
  status: Status;
  history: HistoryEntry[];
  resolution?: Resolution;
  assigneeId?: string;
  /** Next step agreed by the responsible person ("what happens next"). */
  nextAction?: string;
  votes: string[];
  comments: Comment[];
  sentiment?: Sentiment;
  mergedInto?: string;
  aiReview?: AiReview;
  attachments?: Attachment[];
  /** Employees who follow the ticket and get its status updates. */
  followers?: string[];
  rating?: Rating;
  campaignId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  feedbackId: string;
  kind: "status" | "comment" | "vote_milestone" | "escalation" | "assigned" | "clarify";
  status?: Status;
  at: string;
  read: boolean;
}

export interface Pulse {
  id: string;
  userId: string; // stored only to allow one answer per week; never sent to clients
  department: Department;
  week: string; // ISO date of the Monday
  score: number; // 1..5
  comment?: string;
  at: string;
}

/** A question from management with a deadline: "How do we cut commissioning time?" Employees answer with ideas. */
export interface Campaign {
  id: string;
  title: string;
  question: string;
  /** Who is asked: one department or everyone. */
  audience: Department | "all";
  createdBy: string;
  createdAt: string;
  deadline: string;
  closedAt?: string;
  winners: string[];
  aiSummary?: CampaignSummary;
}

export interface CampaignSummary {
  themes: { title: string; ideas: number[] }[];
  top: { number: number; why: string }[];
  next: string;
  locale: string;
  at: string;
  source: "openai" | "local";
}

export interface CampaignView extends Campaign {
  active: boolean;
  ideas: number;
  participants: number;
  votes: number;
  author: string;
}

export interface DB {
  version: number;
  users: User[];
  feedback: Feedback[];
  notifications: Notification[];
  pulse: Pulse[];
  campaigns: Campaign[];
  categories: CategoryDef[];
  settings: Settings;
  embeddings: Record<string, { hash: string; vector: number[] }>;
  counter: number;
}

/** Public shape sent to clients: never leaks authorId of anonymous tickets. */
export interface FeedbackView extends Omit<Feedback, "authorId" | "trackingCode" | "votes" | "followers"> {
  author: Pick<User, "id" | "name" | "color" | "department" | "position"> | null;
  /** Ticket code in the dataset format, e.g. "A-001". */
  code: string;
  assignee: Pick<User, "id" | "name" | "color" | "department" | "position"> | null;
  /** The viewer may change status, decision and responsible (see canProcess). */
  canProcess: boolean;
  isMine: boolean;
  votesCount: number;
  voted: boolean;
  following: boolean;
  campaign: { id: string; title: string } | null;
  followersCount: number;
  deadline: string | null;
  overdue: boolean;
  escalated: boolean;
  commentsView: (Comment & { author: Pick<User, "id" | "name" | "color" | "position"> | null })[];
}
