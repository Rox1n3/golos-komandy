import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { COMPANY, chat, langName, type Locale } from "@/lib/ai";
import { campaignView, catName, db, deadlineOf, isEscalated, mondayOf, ticketCode } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";

const MIN_GROUP = 3;

/** Everything the assistant may know, as a compact text snapshot. Anonymous authors and individual pulse answers never leave the server. */
function snapshot() {
  const d = db();
  const name = (id?: string | null) => d.users.find((u) => u.id === id)?.name ?? "—";
  const now = Date.now();
  const tickets = d.feedback
    .filter((f) => !f.mergedInto)
    .map((f) => {
      const dl = deadlineOf(f);
      const flags = [
        dl && +new Date(dl) < now ? "OVERDUE" : "",
        isEscalated(f) ? "ESCALATED" : "",
        f.rating ? `author rating ${f.rating.score}/5${f.rating.reopened ? " (reopened)" : ""}` : "",
        f.attachments?.length ? `${f.attachments.length} files` : "",
      ].filter(Boolean).join(", ");
      return [
        `${ticketCode(f.number)} [${f.type}; ${f.status}; ${catName(f.category)}; priority ${f.priority}; dept ${f.department}; votes ${f.votes.length}; created ${f.createdAt.slice(0, 10)}; author ${f.anonymous ? "anonymous" : name(f.authorId)}; owner ${name(f.assigneeId)}${f.site ? `; site ${f.site}` : ""}${flags ? `; ${flags}` : ""}]`,
        `${f.title}. ${f.body.slice(0, 350)}`,
        f.nextAction ? `Next action: ${f.nextAction}` : "",
        f.resolution ? `Resolution: ${f.resolution.text}${f.resolution.savings ? ` (savings ${f.resolution.savings} KZT/yr)` : ""}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n");

  const weeks = [...new Set(d.pulse.map((p) => p.week))].sort().slice(-4);
  const pulse = weeks
    .map((w) => {
      const rows = d.pulse.filter((p) => p.week === w);
      const byDep = [...new Set(rows.map((r) => r.department))]
        .map((dep) => {
          const r = rows.filter((x) => x.department === dep);
          return r.length >= MIN_GROUP ? `${dep} ${(r.reduce((s, x) => s + x.score, 0) / r.length).toFixed(1)} (n=${r.length})` : `${dep} hidden (n<${MIN_GROUP})`;
        })
        .join(", ");
      return `week ${w}: avg ${(rows.reduce((s, x) => s + x.score, 0) / Math.max(1, rows.length)).toFixed(2)} (n=${rows.length}); ${byDep}`;
    })
    .join("\n");

  const campaigns = d.campaigns
    .map(campaignView)
    .map((c) => `"${c.title}" — ${c.active ? `active until ${c.deadline.slice(0, 10)}` : "finished"}; ideas ${c.ideas}; participants ${c.participants}; audience ${c.audience}`)
    .join("\n");

  return `Today: ${new Date().toISOString().slice(0, 10)} (current week ${mondayOf()}).

TICKETS (${d.feedback.filter((f) => !f.mergedInto).length}):
${tickets}

PULSE (weekly mood 1-5, departments with fewer than ${MIN_GROUP} answers are hidden):
${pulse || "no data"}

CAMPAIGNS:
${campaigns || "none"}

PEOPLE WITH MANAGEMENT ROLES: ${d.users.filter((u) => u.role !== "employee").map((u) => `${u.name} (${u.position})${u.away ? " — away" : ""}`).join(", ")}

ROUTING RULES (category → responsible; fallback ${name(d.settings.fallbackAssigneeId)}):
${d.categories.filter((c) => c.active).map((c) => `${c.name.ru} → ${name(c.responsibleId)}`).join("; ")}`;
}

const PLATFORM = `How the portal "Голос команды" works: an employee picks a type (problem, proposal, positive feedback) and a category, describes it, optionally adds a proposed solution and files. The ticket gets a code (A-001) and is routed by the administrator's rules: category → responsible person; if nobody is set or that person is away, it goes to the fallback responsible, and the route is written into the history. The responsible person changes the status, records the decision and the next action, can reassign the ticket or ask the author for clarification ("needs_info": the author's reply returns it to review). Statuses: new, review, needs_info, accepted, in_progress, done, rejected (always with a motivated answer), closed. Every status has a deadline; overdue high-priority tickets escalate. Authors get notifications and rate the result (1-5), may send a weak answer back once. Anonymous tickets get a tracking code GL-XXXX-XXXX. AI suggests the category, finds duplicates and checks anonymity. Campaigns are management questions with a deadline. Weekly anonymous pulse. Pages: Главная, Лента обращений, Кампании, Новое обращение, Мои обращения, Отследить по коду, Что изменилось; for management: Доска обращений (kanban, Excel export), Аналитика (share reviewed, time to first response, share with result, implemented, recurring problems), ИИ-ассистент; for the administrator: Настройки (categories, routing, fallback, absences, access rights).`;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  if (!canReview(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const locale: Locale = b.locale === "kk" ? "kk" : "ru";
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .slice(-12)
    .map((m: { role: string; content: string }) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content ?? "").slice(0, 4000) }))
    .filter((m: { content: string }) => m.content);
  if (!messages.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  const system = `${COMPANY}
${PLATFORM}

You are the AI assistant for MODUS TRADE management (${user.name}, ${user.position}) inside this portal. You can answer any question about the platform, the tickets, SLA, pulse and campaigns, find patterns, prioritise, draft replies and announcements, and propose concrete solutions with owners and timelines that fit an engineering and security-systems group in Kazakhstan.
Rules: rely on the data snapshot below and cite tickets by code (A-001); if the data does not say, say so and suggest how to find out. Never guess or reveal who wrote anonymous tickets, and never single out people from hidden pulse groups. The snapshot uses English field names and statuses: always translate them into the answer language (e.g. overdue = просрочено, escalated = эскалировано, in_progress = в работе, review = на рассмотрении, needs_info = ожидает уточнения, closed = закрыто) and never print raw English codes. Be concise and practical: short paragraphs, "- " bullet lists, **bold** for key points, no tables. Answer in ${langName(locale)}.

DATA SNAPSHOT:
${snapshot()}`;

  const answer = await chat(system, messages);
  if (answer) return NextResponse.json({ answer, source: "openai" });
  return NextResponse.json({
    answer: locale === "kk" ? "ЖИ қазір қолжетімсіз. Аналитика бетінде негізгі көрсеткіштер бар." : "ИИ сейчас недоступен. Основные показатели есть на странице «Аналитика».",
    source: "local",
  });
}
