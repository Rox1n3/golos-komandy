import "server-only";
import OpenAI, { toFile } from "openai";
import { createHash } from "node:crypto";
import { catName, db, persist, ticketCode } from "./db";
import { dictionaries } from "./i18n";
import {
  DEPARTMENTS, PRIORITIES, isFinal,
  type Category, type Department, type Feedback, type FeedbackType, type Priority, type Sentiment, type Status,
} from "./types";

export type Locale = "ru" | "kk";

const key = process.env.OPENAI_API_KEY?.trim();
/**
 * Short timeout and no automatic retries: if OpenAI is slow or blocked (no internet at the venue, firewall),
 * the portal must not hang — every caller falls back to the offline logic. The circuit breaker below
 * then skips the AI for a while, so only the first request after an outage waits.
 */
const TIMEOUT = Number(process.env.OPENAI_TIMEOUT_MS) || 15_000;
const client = key ? new OpenAI({ apiKey: key, timeout: TIMEOUT, maxRetries: 0 }) : null;

/**
 * Circuit breaker: after a connection error, timeout, bad key or rate limit the AI is paused for a while,
 * so the next requests use the offline logic instantly instead of waiting for another timeout.
 */
let pausedUntil = 0;
const PAUSE_MS = 120_000;
function noteFailure(e: unknown) {
  const err = e as { status?: number; message?: string };
  // APIConnectionError also covers timeouts (APIConnectionTimeoutError: "Request timed out.").
  const outage =
    e instanceof OpenAI.APIConnectionError ||
    /connection|timed? ?out|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(err?.message ?? "") ||
    err?.status === 401 || err?.status === 403 || err?.status === 429 || (err?.status ?? 0) >= 500;
  if (outage) pausedUntil = Date.now() + PAUSE_MS;
}
const ready = () => !!client && Date.now() >= pausedUntil;
/** Fast model for classification, translation and drafts; the smart one for the management assistant. */
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const SMART = process.env.OPENAI_MODEL_SMART || "gpt-5.5";
type Effort = "minimal" | "low" | "medium" | "high";
const reasoning = (model: string, effort: Effort) => (/^(gpt-5|gpt-6|o\d)/.test(model) ? { reasoning_effort: effort } : { temperature: 0.3 });

/** AI is configured and currently reachable (not paused after an outage). */
export const aiEnabled = () => ready();

export async function json<T>(system: string, user: string, opts: { smart?: boolean; effort?: Effort } = {}): Promise<T | null> {
  if (!client || !ready()) return null;
  const model = opts.smart ? SMART : MODEL;
  try {
    const res = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...reasoning(model, opts.effort ?? "low"),
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    return JSON.parse(res.choices[0]?.message?.content || "null") as T;
  } catch (e) {
    noteFailure(e);
    console.error("[ai] request failed, falling back to heuristics:", (e as Error).message);
    return null;
  }
}

/** Speech-to-text model; whisper-1 is the fallback if it is unavailable. */
const STT = process.env.OPENAI_MODEL_STT || "gpt-4o-transcribe";

/**
 * Transcribes a short voice note recorded in the browser. The language is fixed by the interface
 * (Russian or Kazakh), which is far more reliable than auto-detection on short phrases.
 * No vocabulary prompt: on silent audio speech models tend to echo the prompt back as the "transcript".
 */
export async function transcribe(audio: Blob, filename: string, lang: "ru" | "kk"): Promise<string | null> {
  if (!client || !ready()) return null;
  const file = await toFile(Buffer.from(await audio.arrayBuffer()), filename, { type: audio.type || "audio/webm" });
  for (const model of [...new Set([STT, "whisper-1"])]) {
    try {
      const r = await client.audio.transcriptions.create({ file, model, language: lang }, { timeout: 45_000 });
      return (r.text ?? "").trim();
    } catch (e) {
      noteFailure(e);
      console.error(`[ai] transcription with ${model} failed:`, (e as Error).message);
      if (!ready()) break;
    }
  }
  return null;
}

/** Free-form conversation for the management assistant (smart model, plain text answer). */
export async function chat(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string | null> {
  if (!client || !ready()) return null;
  try {
    const res = await client.chat.completions.create(
      {
        model: SMART,
        ...reasoning(SMART, "medium"),
        messages: [{ role: "system", content: system }, ...messages],
      },
      // The smart model thinks longer than the quick helpers.
      { timeout: Math.max(TIMEOUT, 60_000) },
    );
    return res.choices[0]?.message?.content?.trim() || null;
  } catch (e) {
    noteFailure(e);
    console.error("[ai] chat failed:", (e as Error).message);
    return null;
  }
}

/** Shared context so every prompt knows whose employees it is serving. */
export const COMPANY = `Company: MODUS TRADE group (ГК «Модус Трейд», Kazakhstan) — engineering and low-voltage security systems: sales of equipment and turnkey solutions, procurement, design (проектирование), IT development, equipment development, commissioning (пусконаладочные работы) and service support. Departments: sales, procurement, design and project management, technical specialists, IT, service, finance (accounting), HR, administration. Main corporate systems: 1С УТ and Битрикс24. Tickets are referenced by codes like A-001. Wording: in Russian call them «обращения», in Kazakh «өтініштер», never «тикет» or «ticket»; write a code on its own, e.g. «A-003», without the word ticket.`;

/** Model output → plain text: objects ({code, action}) are flattened, so the UI never renders an object. */
export const asText = (x: unknown): string =>
  typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).map(asText).filter(Boolean).join(" — ") : x == null ? "" : String(x);
/** Model output → ticket number: accepts 7, "7" or "A-007". */
export const asNumber = (x: unknown): number | null => {
  const m = /(\d+)\s*$/.exec(String(x ?? "").trim());
  return m ? Number(m[1]) : null;
};

export const langName = (l: Locale) => (l === "kk" ? "Kazakh (Cyrillic)" : "Russian");

/* ----------------------------- analysis ----------------------------- */

/**
 * Active categories for prompts: "id=Name (e.g. «title»; «title»)". Real ticket titles from the routing history
 * teach the model how this company uses each category. The list is managed by the administrator.
 */
export const categoryList = () => {
  const d = db();
  return d.categories
    .filter((c) => c.active)
    .map((c) => {
      const examples = d.feedback.filter((f) => f.category === c.id && !f.mergedInto).slice(0, 2).map((f) => `«${f.title}»`);
      return `${c.id}=${c.name.ru}${examples.length ? ` (e.g. ${examples.join("; ")})` : ""}`;
    })
    .join("; ");
};

export interface Analysis {
  category: Category;
  priority: Priority;
  department: Department;
  tags: string[];
  sentiment: Sentiment;
  improved: { title: string; body: string };
  privacy: string[];
  toxic: boolean;
  source: "openai" | "local";
}

/** Offline classifier: first matching rule wins. Category ids are the dataset categories (see seed.ts). */
const KEYWORDS: [Category, Department, RegExp][] = [
  ["safety", "service", /безопасн|травм|скольз|пожар|охран[аы] труда|опасн|каска|допуск|стеллаж|баллон|высот|қауіпсіз|жарақат/i],
  ["it", "it", /vpn|компьютер|ноутбук|сеть|wi-?fi|интернет|програм|систем|1с|битрикс|почт|пароль|сервер|принтер|синхрониз|интеграц|повторн\w* ввод|желі|бағдарлам/i],
  ["catalog", "design", /номенклатур|каталог|карточк\w* позиц|обозначени|артикул/i],
  ["projects", "projects", /спецификац|состав оборудования|проект\w* (групп|документ)|версии? спецификац/i],
  ["contracts", "sales", /договор|приложени\w* к договор|контракт|шарт/i],
  ["docflow", "finance", /пакет документов|документооборот|бухгалтер|счёт|счет|акт|құжат айналым/i],
  ["storage", "admin", /папк|редакци|архив|хранени|актуальн\w* верси/i],
  ["training", "hr", /обучени|занят|семинар|тренинг|адаптац|онбординг|новичк|новых сотрудник|оқыту/i],
  ["knowledge", "admin", /памятк|наставни|типов\w* ошиб|база знаний|инструкци/i],
  ["regulations", "admin", /регламент|порядок|процедур|пошагов/i],
  ["interdept", "procurement", /заявк|смежн\w* отдел|между подразделени|межотдел|закуп/i],
  ["speed", "admin", /срок\w* ответ|долго|задерж|ждать|оперативн|жедел/i],
  ["tasksetting", "admin", /поручени|постановк\w* задач|без срока|ожидаем\w* результат/i],
  ["tasks", "sales", /закрыва\w* задач|задач\w* в/i],
  ["comms", "it", /канал|чат|переписк|контекст|обсужден/i],
  ["resources", "design", /загруженност|загрузк|ресурс|ближайшие недел/i],
  ["transparency", "admin", /стади\w* проекта|статус|прозрачн|поставщик/i],
  ["results", "admin", /обзор|результат\w* предложени|завершённ|завершенн/i],
  ["workplace", "admin", /кондиционер|офис|кухн|парковк|стул|рабочее место|перерыв|температур|шум|кеңсе|асхана/i],
];

function localAnalysis(title: string, body: string, type: FeedbackType, locale: Locale): Analysis {
  const text = `${title} ${body}`;
  let category: Category = "other";
  let department: Department = "admin";
  for (const [c, d, re] of KEYWORDS) if (re.test(text)) { category = c; department = d; break; }
  if (/финанс|бухгалт|возмещ|оплат|счёт|счет|қаржы/i.test(text)) department = "finance";
  else if (/закуп|поставщик|заявк\w* на приобрет/i.test(text)) department = "procurement";
  else if (/склад|отгруз|логист|растамож|қойма/i.test(text)) department = "logistics";
  else if (/продаж|клиент|коммерческ|спецификац|тендер|сату/i.test(text)) department = "sales";
  else if (/пнр|пусконалад|монтаж|объект|инженер/i.test(text) && category !== "it") department = "service";

  const urgent = /срочно|опасн|травм|не работает|авари|сломал|шұғыл|бұзылды/i.test(text);
  let priority: Priority = type === "problem" ? "medium" : "low";
  if (category === "safety") priority = urgent ? "critical" : "high";
  else if (urgent) priority = "high";

  const negative = /не работает|плохо|ужас|проблем|задерж|теря|невозможно|жалоб|разрыва|отвалива|сломал|срочно|нашар|мәселе|істемейді/i.test(text);
  const positive = /предлага|иде|улучш|удобн|спасибо|ұсын|жақсарт/i.test(text);
  const sentiment: Sentiment = negative ? "negative" : positive ? "positive" : "neutral";

  const stop = new Set(["который", "которые", "чтобы", "можно", "нужно", "сейчас", "очень", "после", "этого", "будет", "через", "когда"]);
  const tags = Array.from(new Set(
    text.toLowerCase().match(/[a-zа-яёәғқңөұүһі0-9-]{5,}/gi)?.filter((w) => !stop.has(w)) ?? [],
  )).slice(0, 3);

  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const L = locale === "kk"
    ? { s: "Жағдай", i: "Әсері", p: "Ұсыныс", pd: "Мәселені шешу жолдарын бірге талқылауды ұсынамын." }
    : { s: "Ситуация", i: "Влияние", p: "Предложение", pd: "Предлагаю вместе обсудить варианты решения." };
  const proposal = sentences.find((s) => /предлага|можно|стоит|нужно|ұсын/i.test(s));
  const situation = sentences.filter((s) => s !== proposal).join(" ") || body;
  const improvedBody = `${L.s}: ${situation}\n${L.i}: ${type === "problem" ? (locale === "kk" ? "жұмыс уақыты мен сапасына әсер етеді." : "влияет на время и качество работы сотрудников.") : (locale === "kk" ? "командаға уақыт пен ресурс үнемдейді." : "сэкономит время и ресурсы команды.")}\n${L.p}: ${proposal ?? L.pd}`;

  return {
    category, priority, department, tags, sentiment,
    improved: { title: title.trim().replace(/[!?.]+$/, "").replace(/^./, (c) => c.toUpperCase()), body: improvedBody },
    privacy: localPrivacy(text, locale),
    toxic: /идиот|дебил|тупой|урод|бездар|ақымақ/i.test(text),
    source: "local",
  };
}

function localPrivacy(text: string, locale: Locale): string[] {
  const out: string[] = [];
  const ru = locale === "ru";
  if (/[\w.-]+@[\w-]+\.\w+/.test(text)) out.push(ru ? "В тексте есть e-mail — он раскроет вашу личность." : "Мәтінде e-mail бар — ол сіздің кім екеніңізді ашады.");
  if (/(\+?\d[\d\s()-]{8,}\d)/.test(text)) out.push(ru ? "В тексте есть номер телефона." : "Мәтінде телефон нөмірі бар.");
  if (/(?:^|[^\p{L}])\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+(?:ов|ев|ин|ова|ева|ина|ұлы|қызы)(?!\p{L})/u.test(text))
    out.push(ru ? "Упомянуто ФИО — это может указать на вас или задеть коллегу." : "Аты-жөні аталған — бұл сізді немесе әріптесті көрсетуі мүмкін.");
  if (/я единственн|только я|мой (начальник|руководитель)|в нашем отделе из \d|мен ғана/i.test(text))
    out.push(ru ? "Есть детали, по которым вас легко вычислить (уникальная роль, размер команды)." : "Сізді оңай анықтауға болатын мәліметтер бар.");
  return out;
}

type RawAnalysis = Omit<Partial<Analysis>, "improved"> & { improved?: { title?: string; situation?: string; impact?: string; proposal?: string } };

export async function analyze(title: string, body: string, type: FeedbackType, locale: Locale, anonymous = false): Promise<Analysis> {
  const fallback = localAnalysis(title, body, type, locale);
  const r = await json<RawAnalysis>(
    `${COMPANY}
You help employees write feedback to their company. Return JSON with keys:
category (one id of: ${categoryList()}), priority (${PRIORITIES.join(",")}), department (${DEPARTMENTS.join(",")}: sales=sales managers and contracts, procurement=purchasing and suppliers, projects=project management, design=design engineers and nomenclature, service=commissioning/installation/service engineers on sites, logistics=warehouse and delivery, hr=HR and training, finance=accounting, it, admin=office, management, processes and documents),
tags (max 3 short lowercase tags), sentiment (negative|neutral|positive),
improved: {title, situation, impact, proposal} — a constructive, respectful rewrite: a clear short title and one or two sentences for each part; keep every concrete fact (numbers, places, systems), drop insults and blame${anonymous ? ", and REMOVE details that could identify the author (names, e-mails, phones, unique job titles, exact team size, personal circumstances)" : ""},
privacy: array of short warnings if the text contains details that could de-anonymize the author or names/attacks a specific colleague (empty array if none),
toxic: boolean — insults or aggression.
Write all text values in ${langName(locale)}.`,
    `Type: ${type}\nTitle: ${title}\nText: ${body}`,
  );
  if (!r) return fallback;
  return {
    category: db().categories.some((c) => c.active && c.id === r.category) ? String(r.category) : fallback.category,
    priority: PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : fallback.priority,
    department: DEPARTMENTS.includes(r.department as Department) ? (r.department as Department) : fallback.department,
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 3).map(String) : fallback.tags,
    sentiment: (["negative", "neutral", "positive"] as const).includes(r.sentiment as Sentiment) ? (r.sentiment as Sentiment) : fallback.sentiment,
    improved: r.improved?.situation
      ? {
          title: r.improved.title || title,
          body: (locale === "kk"
            ? [["Жағдай", r.improved.situation], ["Әсері", r.improved.impact], ["Ұсыныс", r.improved.proposal]]
            : [["Ситуация", r.improved.situation], ["Влияние", r.improved.impact], ["Предложение", r.improved.proposal]])
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n"),
        }
      : fallback.improved,
    privacy: Array.isArray(r.privacy) ? [...new Set([...r.privacy.map(String), ...fallback.privacy])] : fallback.privacy,
    toxic: typeof r.toxic === "boolean" ? r.toxic || fallback.toxic : fallback.toxic,
    source: "openai",
  };
}

/* ----------------------------- duplicates ----------------------------- */

const stem = (w: string) => w.toLowerCase().slice(0, 5);
const tokens = (s: string) => new Set((s.match(/[a-zа-яёәғқңөұүһі0-9]{3,}/gi) ?? []).map(stem));

export function lexical(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / Math.sqrt(A.size * B.size);
}

export const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return d / (Math.sqrt(na * nb) || 1);
};

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!client || !ready() || !texts.length) return null;
  try {
    const r = await client.embeddings.create({ model: "text-embedding-3-small", input: texts });
    return r.data.map((d) => d.embedding);
  } catch (e) {
    noteFailure(e);
    console.error("[ai] embeddings failed:", (e as Error).message);
    return null;
  }
}

export const docText = (f: Pick<Feedback, "title" | "body">) => `${f.title}\n${f.body}`;
export const hash = (s: string) => createHash("sha1").update(s).digest("hex");

export async function findSimilar(title: string, body: string, excludeId?: string) {
  const d = db();
  const pool = d.feedback.filter((f) => f.id !== excludeId && !f.mergedInto);
  const query = `${title}\n${body}`;
  let scored: { f: Feedback; score: number }[];

  if (client) {
    const missing = pool.filter((f) => d.embeddings[f.id]?.hash !== hash(docText(f)));
    const vecs = await embed([query, ...missing.map(docText)]);
    if (vecs) {
      missing.forEach((f, i) => (d.embeddings[f.id] = { hash: hash(docText(f)), vector: vecs[i + 1] }));
      if (missing.length) persist();
      scored = pool.map((f) => ({ f, score: cos(vecs[0], d.embeddings[f.id].vector) }));
      // embeddings of short Russian texts sit around 0.3–0.5 even when unrelated; rescale to 0..1
      scored = scored.map((s) => ({ ...s, score: Math.max(0, (s.score - 0.45) / 0.4) }));
    } else scored = pool.map((f) => ({ f, score: lexical(query, docText(f)) }));
  } else scored = pool.map((f) => ({ f, score: lexical(query, docText(f)) }));

  return scored
    .filter((s) => s.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ f, score }) => ({ id: f.id, number: f.number, title: f.title, status: f.status, votes: f.votes.length, score: Math.min(1, score) }));
}

/* ----------------------------- reviewer helpers ----------------------------- */

export async function draftReply(f: Feedback, status: Status, locale: Locale): Promise<string> {
  const r = await json<{ reply: string }>(
    `${COMPANY}
You are an HR/operations manager answering an employee's ${f.type}. Write a short (3-4 sentences), warm, specific, honest reply in ${langName(locale)}. Thank them, explain the decision — the new status is "${dictionaries[locale].status[status]}" (never mention internal status codes) — and the next step with a realistic time frame. No placeholders like [name]. Return JSON {"reply": "..."}.`,
    `Title: ${f.title}\nText: ${f.body}`,
  );
  if (r?.reply) return r.reply;
  const ru: Partial<Record<Status, string>> = {
    review: "Спасибо, что подняли этот вопрос! Мы взяли обращение в работу и изучаем детали с ответственным подразделением. Вернёмся с решением в течение 5 рабочих дней.",
    accepted: "Спасибо за предложение! Мы его одобрили и включаем в план работ. Следующий шаг — назначить ответственного и сроки, об этом сообщим здесь.",
    in_progress: "Работа уже идёт: ответственная команда приступила к реализации. Будем публиковать промежуточные результаты в этом обращении.",
    done: "Готово! Решение внедрено. Спасибо, что помогаете делать компанию лучше — напишите, если что-то работает не так, как ожидалось.",
    rejected: "Спасибо за обращение. Сейчас мы не можем реализовать это в предложенном виде: решение требует ресурсов, которые уже распределены на приоритетные задачи. Мы сохраним идею и вернёмся к ней при планировании следующего квартала.",
    needs_info: "Спасибо за обращение! Чтобы принять решение, нам нужно уточнение: опишите, пожалуйста, на каких примерах или этапах это проявляется. После вашего ответа обращение вернётся на рассмотрение.",
    closed: "Спасибо за обращение! Мы зафиксировали его и передали ответственным. Дополнительных действий не требуется, рассмотрение завершено.",
  };
  const kk: Partial<Record<Status, string>> = {
    review: "Бұл мәселені көтергеніңізге рахмет! Өтінішті жұмысқа алдық, жауапты бөліммен бірге қарап жатырмыз. 5 жұмыс күні ішінде шешіммен ораламыз.",
    accepted: "Ұсынысыңызға рахмет! Біз оны мақұлдап, жұмыс жоспарына енгіздік. Келесі қадам — жауаптыны және мерзімді белгілеу.",
    in_progress: "Жұмыс басталды: жауапты команда іске асыруға кірісті. Аралық нәтижелерді осы жерде жариялаймыз.",
    done: "Дайын! Шешім енгізілді. Компанияны жақсартуға көмектескеніңізге рахмет.",
    rejected: "Өтінішіңізге рахмет. Қазір мұны ұсынылған түрде іске асыра алмаймыз: ресурстар басым міндеттерге бөлінген. Идеяны сақтап, келесі тоқсанды жоспарлағанда қайта ораламыз.",
    needs_info: "Өтінішіңізге рахмет! Шешім қабылдау үшін нақтылау қажет: бұл қандай мысалдарда немесе кезеңдерде көрінетінін сипаттаңызшы. Жауабыңыздан кейін өтініш қайта қарауға оралады.",
    closed: "Өтінішіңізге рахмет! Біз оны тіркеп, жауаптыларға бердік. Қосымша әрекет қажет емес, қарау аяқталды.",
  };
  return (locale === "kk" ? kk : ru)[status] ?? (locale === "kk" ? "Рахмет! Өтініш жаңартылды." : "Спасибо! Обращение обновлено.");
}

export interface Digest {
  summary: string;
  themes: { title: string; count: number; insight: string }[];
  risks: string[];
  actions: string[];
  source: "openai" | "local";
}

export async function digest(locale: Locale): Promise<Digest> {
  const d = db();
  const open = d.feedback.filter((f) => !isFinal(f.status) && !f.mergedInto);
  const list = d.feedback
    .slice()
    .sort((a, b) => b.votes.length - a.votes.length)
    .slice(0, 40)
    .map((f) => `${ticketCode(f.number)} [${f.type}/${catName(f.category)}/${f.priority}/${f.status}] votes=${f.votes.length} — ${f.title}`)
    .join("\n");

  const r = await json<Omit<Digest, "source">>(
    `${COMPANY}
You are an analyst for an employee feedback platform. Based on the list, produce a management digest in ${langName(locale)}. Return JSON: summary (2-3 sentences), themes (3-4 items: title, count, insight), risks (2-3 short items: what may hurt engagement or safety if ignored), actions (3 concrete next steps for management, reference ticket codes like A-003).`,
    list,
  );
  if (r?.summary) {
    // Models sometimes return list items as objects ({code, action}); the UI needs plain strings.
    const text = asText;
    const list = (xs: unknown) => (Array.isArray(xs) ? xs.map(text).filter(Boolean).slice(0, 5) : []);
    return {
      summary: text(r.summary),
      themes: (Array.isArray(r.themes) ? r.themes : []).slice(0, 4).map((t) => {
        const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
        return { title: text(o.title), count: Math.max(0, Math.round(Number(o.count) || 0)), insight: text(o.insight) };
      }),
      risks: list(r.risks),
      actions: list(r.actions),
      source: "openai",
    };
  }

  const byCat = new Map<Category, Feedback[]>();
  open.forEach((f) => byCat.set(f.category, [...(byCat.get(f.category) ?? []), f]));
  const top = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  const critical = open.filter((f) => f.priority === "critical" || f.priority === "high");
  const hot = open.slice().sort((a, b) => b.votes.length - a.votes.length).slice(0, 3);
  const isRu = locale === "ru";
  const cat = (c: Category) => catName(c, locale);
  return {
    summary: isRu
      ? `Открыто ${open.length} обращений, из них ${critical.length} с высоким приоритетом. Больше всего вопросов в теме «${cat(top[0]?.[0] ?? "other")}». Самая поддерживаемая инициатива — ${hot[0] ? ticketCode(hot[0].number) : "—"} (${hot[0]?.votes.length} голосов).`
      : `${open.length} өтініш ашық, оның ${critical.length} жоғары басымдықта. Ең көп сұрақ — «${cat(top[0]?.[0] ?? "other")}» тақырыбында. Ең көп қолдау тапқаны — ${hot[0] ? ticketCode(hot[0].number) : "—"} (${hot[0]?.votes.length} дауыс).`,
    themes: top.map(([c, fs]) => ({
      title: cat(c),
      count: fs.length,
      insight: (isRu ? "Главное: " : "Негізгісі: ") + fs.sort((a, b) => b.votes.length - a.votes.length)[0].title,
    })),
    risks: critical.slice(0, 3).map((f) => `${ticketCode(f.number)} ${f.title}`),
    actions: hot.map((f) => (isRu ? `Дать публичный ответ по ${ticketCode(f.number)} — его поддержали ${f.votes.length} человек` : `${ticketCode(f.number)} бойынша жария жауап беру — ${f.votes.length} адам қолдады`)),
    source: "local",
  };
}
