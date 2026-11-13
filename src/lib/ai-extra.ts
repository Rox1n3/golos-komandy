import "server-only";
import { catName, db, persist, ticketCode } from "./db";
import { COMPANY, asText, cos, docText, embed, hash, json, langName, lexical, type Locale } from "./ai";
import { DEPARTMENTS, type AiReview, type Department, type Feedback, type Pulse, type Status } from "./types";

/** Pulse groups smaller than this are hidden everywhere (analytics page, management assistant, AI pulse insight). */
const PULSE_MIN_GROUP = 3;

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
};

/* ----------------------------- AI expertise for one ticket ----------------------------- */

export async function assess(f: Feedback, locale: Locale): Promise<AiReview> {
  const votes = f.votes.length;
  const r = await json<Partial<AiReview>>(
    `${COMPANY}
You are an experienced operations consultant. Evaluate an employee ${f.type} for management. Return JSON:
summary (1-2 sentences: what this is really about),
impact (1-5: effect on money, safety, speed or morale; a risk to people's safety is always 5),
effort (1-5: cost and complexity to implement),
savings (integer: realistic yearly savings or avoided losses in Kazakhstani tenge; 0 if not measurable),
risks (2-3 short items: what goes wrong if ignored or during implementation),
steps (3 concrete first steps, each starting with the owner role),
owner (one of ${DEPARTMENTS.join(",")}).
Be concrete and conservative. Write the text in ${langName(locale)}.`,
    `Title: ${f.title}\nText: ${f.body}\nCategory: ${f.category}, priority: ${f.priority}, location: ${f.location ?? "-"} ${f.site ?? ""}\nSupporters: ${votes}`,
  );
  const now = new Date().toISOString();
  if (r?.summary) {
    return {
      summary: asText(r.summary),
      impact: clamp(r.impact, 1, 5, 3),
      effort: clamp(r.effort, 1, 5, 3),
      savings: Math.max(0, Math.round(Number(r.savings) || 0)),
      risks: Array.isArray(r.risks) ? r.risks.slice(0, 3).map(asText).filter(Boolean) : [],
      steps: Array.isArray(r.steps) ? r.steps.slice(0, 3).map(asText).filter(Boolean) : [],
      owner: DEPARTMENTS.includes(r.owner as Department) ? (r.owner as Department) : f.department,
      source: "openai",
      at: now,
      locale,
    };
  }
  const ru = locale === "ru";
  const impact = f.category === "safety" ? 5 : Math.min(5, 2 + Math.round(votes / 12) + (f.priority === "high" || f.priority === "critical" ? 1 : 0));
  const effort = /систем|закуп|автоматиз|бот|эцп|интеграц|планшет/i.test(f.body) ? 4 : /график|чек-лист|шаблон|встреч|демо/i.test(f.body) ? 2 : 3;
  return {
    summary: ru
      ? `Обращение поддержали ${votes} человек, тема — «${catName(f.category, "ru")}».`
      : `Өтінішті ${votes} адам қолдады, тақырыбы — «${catName(f.category, "kk")}».`,
    impact,
    effort,
    savings: f.category === "safety" ? 0 : votes * 60_000,
    risks: ru
      ? [f.category === "safety" ? "Риск травмы и остановки работ" : "Падение доверия к порталу, если не дать ответ", "Повторные обращения на ту же тему"]
      : [f.category === "safety" ? "Жарақат және жұмыстың тоқтау қаупі" : "Жауап берілмесе, порталға сенім төмендейді", "Осы тақырыпта қайталанған өтініштер"],
    steps: ru
      ? ["Ответственный: уточнить детали у автора за 2 дня", "Руководитель отдела: оценить стоимость и сроки", "Ответственный: сообщить решение в обращении"]
      : ["Жауапты: 2 күнде автордан мәліметті нақтылау", "Бөлім басшысы: құны мен мерзімін бағалау", "Жауапты: шешімді өтініште хабарлау"],
    owner: f.department,
    source: "local",
    at: now,
    locale,
  };
}

/* ----------------------------- Q&A assistant over all tickets (RAG) ----------------------------- */

export interface Answer {
  answer: string;
  sources: { id: string; number: number; title: string; status: Status }[];
  source: "openai" | "local";
}

const STATUS_WORD: Record<Locale, Record<Status, string>> = {
  ru: { new: "новое", review: "на рассмотрении", needs_info: "ожидает уточнения", accepted: "принято", in_progress: "в работе", done: "реализовано", rejected: "отклонено", closed: "закрыто" },
  kk: { new: "жаңа", review: "қаралуда", needs_info: "нақтылауды күтуде", accepted: "қабылданды", in_progress: "жұмыста", done: "іске асырылды", rejected: "қабылданбады", closed: "жабылды" },
};

async function retrieve(question: string, k: number): Promise<Feedback[]> {
  const d = db();
  const pool = d.feedback.filter((f) => !f.mergedInto);
  const q = await embed([question]);
  if (q) {
    const missing = pool.filter((f) => d.embeddings[f.id]?.hash !== hash(docText(f)));
    const mv = missing.length ? await embed(missing.map(docText)) : [];
    if (mv && missing.length) {
      missing.forEach((f, i) => (d.embeddings[f.id] = { hash: hash(docText(f)), vector: mv[i] }));
      persist();
    }
    return pool
      .filter((f) => d.embeddings[f.id])
      .map((f) => ({ f, s: cos(q[0], d.embeddings[f.id].vector) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => x.f);
  }
  return pool
    .map((f) => ({ f, s: lexical(question, `${docText(f)} ${f.tags.join(" ")} ${f.site ?? ""}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.f);
}

export async function ask(question: string, locale: Locale): Promise<Answer> {
  const ranked = await retrieve(question, 6);
  const context = ranked
    .map((f) => {
      const last = f.history[f.history.length - 1];
      return [
        `${ticketCode(f.number)} [${f.type}, category=${catName(f.category)}, status=${f.status}, votes=${f.votes.length}, created=${f.createdAt.slice(0, 10)}${f.site ? `, site=${f.site}` : ""}] ${f.title}`,
        f.body,
        f.resolution ? `Resolution: ${f.resolution.text}${f.resolution.effect ? ` (${f.resolution.effect})` : ""}` : "",
        last.note ? `Last update: ${last.note}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
  const sources = ranked.map((f) => ({ id: f.id, number: f.number, title: f.title, status: f.status }));

  const r = await json<{ answer: string; used: number[] }>(
    `${COMPANY}
You are the assistant of the company's internal employee feedback portal. Answer the question ONLY from the tickets below and cite them by code (A-001). If they do not answer it, say so and suggest creating a new ticket. Never reveal who wrote anonymous tickets. Max 5 sentences, plain text. Answer in ${langName(locale)}. Return JSON {"answer": "...", "used": [number parts of the codes you relied on, A-007 → 7]}.`,
    `Question: ${question}\n\nTickets:\n${context || "(none found)"}`,
  );
  if (r?.answer) {
    const used = new Set((r.used ?? []).map(Number));
    return { answer: r.answer, sources: used.size ? sources.filter((s) => used.has(s.number)) : [], source: "openai" };
  }
  if (!ranked.length) {
    return {
      answer: locale === "ru" ? "Похожих обращений не нашлось. Создайте новое — его сразу увидят ответственные." : "Ұқсас өтініш табылмады. Жаңасын жасаңыз — оны жауаптылар бірден көреді.",
      sources: [],
      source: "local",
    };
  }
  const top = ranked.slice(0, 3);
  return {
    answer: (locale === "ru" ? "Вот что нашлось по вашему вопросу: " : "Сұрағыңыз бойынша табылғаны: ") + top.map((f) => `${ticketCode(f.number)} «${f.title}» — ${STATUS_WORD[locale][f.status]}`).join("; ") + ".",
    sources: sources.slice(0, 3),
    source: "local",
  };
}

/* ----------------------------- RU ⇄ KZ translation ----------------------------- */

export async function translate(f: Pick<Feedback, "title" | "body">, to: Locale): Promise<{ title: string; body: string } | null> {
  const from = to === "kk" ? "Russian" : "Kazakh";
  const r = await json<{ title: string; body: string }>(
    `You are a professional ${from}→${langName(to)} translator. Translate BOTH the title and the text of the employee ticket from ${from} into ${langName(to)}. The output must be entirely in ${langName(to)} — do not leave it in ${from}. Keep the meaning, numbers and line breaks; keep brand and system names (Avigilon, 1С, VPN) as is. Return JSON {"title": "<translated title>", "body": "<translated text>"}.`,
    `Title: ${f.title}\nText: ${f.body}`,
  );
  return r?.body ? { title: r.title || f.title, body: r.body } : null;
}

/* ----------------------------- pulse insight ----------------------------- */

export async function pulseInsight(pulse: Pulse[], locale: Locale, depName: (d: Department) => string): Promise<{ text: string; source: "openai" | "local" }> {
  const weeks = [...new Set(pulse.map((p) => p.week))].sort().slice(-4);
  const recent = pulse.filter((p) => weeks.includes(p.week));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  // Same privacy rule as on the analytics page: the model gets only department averages, and only for groups of
  // at least PULSE_MIN_GROUP answers; individual scores and comments of smaller groups never leave the server.
  const groups = new Map<string, Pulse[]>();
  recent.forEach((p) => {
    const key = `${p.week} ${p.department}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  });
  const lines = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ps]) => {
      if (ps.length < PULSE_MIN_GROUP) return `${key}: hidden (fewer than ${PULSE_MIN_GROUP} answers)`;
      const comments = ps.map((p) => p.comment).filter(Boolean);
      return `${key}: average ${avg(ps.map((p) => p.score)).toFixed(1)} (n=${ps.length})${comments.length ? `; anonymous comments: ${comments.map((c) => `"${c}"`).join("; ")}` : ""}`;
    });
  const r = await json<{ text: string }>(
    `${COMPANY}
You analyse an anonymous weekly mood pulse (score 1-5) of employees, given as department averages per week. Write 3 short sentences for management in ${langName(locale)}: the trend, which department needs attention and why (use the comments), and one concrete action. Never guess identities and never discuss hidden groups. Return JSON {"text": "..."}.`,
    lines.join("\n"),
  );
  if (r?.text) return { text: r.text, source: "openai" };

  const first = avg(recent.filter((p) => p.week === weeks[0]).map((p) => p.score));
  const last = avg(recent.filter((p) => p.week === weeks[weeks.length - 1]).map((p) => p.score));
  const byDep = new Map<Department, number[]>();
  recent.forEach((p) => byDep.set(p.department, [...(byDep.get(p.department) ?? []), p.score]));
  const worst = [...byDep.entries()].filter(([, xs]) => xs.length >= 3).sort((a, b) => avg(a[1]) - avg(b[1]))[0]?.[0];
  const name = worst ? depName(worst) : "—";
  return {
    text:
      locale === "ru"
        ? `Настроение команды ${last >= first ? "растёт" : "снижается"}: ${first.toFixed(1)} → ${last.toFixed(1)}. Больше всего внимания требует отдел «${name}». Обсудите с руководителем отдела нагрузку и командировки.`
        : `Команда көңіл-күйі ${last >= first ? "жақсаруда" : "төмендеуде"}: ${first.toFixed(1)} → ${last.toFixed(1)}. Ең көп назар қажет бөлім — «${name}». Бөлім басшысымен жүктеме мен іссапарларды талқылаңыз.`,
    source: "local",
  };
}
