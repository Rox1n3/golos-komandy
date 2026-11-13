import { catName, db, deadlineOf, ticketCode } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";
import { dictionaries } from "@/lib/i18n";

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  // Guard against spreadsheet formula injection and quote every field.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const { types: TYPE, status: STATUS, priorities: PRIORITY, departments: DEP } = dictionaries.ru;

/** Register of all tickets for Excel: management reports without copy-paste. */
export async function GET() {
  const user = await currentUser();
  if (!canReview(user)) return new Response("Forbidden", { status: 403 });
  const d = db();
  const name = (id?: string | null) => d.users.find((u) => u.id === id)?.name ?? "";
  const head = ["Код", "Тип", "Заголовок", "Статус", "Категория", "Приоритет", "Подразделение", "Автор", "Ответственный", "Дальнейшее действие", "Решение", "Голоса", "Файлы", "Создано", "Срок", "Просрочено", "Оценка автора"];
  const rows = d.feedback
    .filter((f) => !f.mergedInto)
    .map((f) => [
      ticketCode(f.number), TYPE[f.type], f.title, STATUS[f.status], catName(f.category), PRIORITY[f.priority], DEP[f.department],
      f.anonymous ? "Анонимно" : name(f.authorId), name(f.assigneeId), f.nextAction ?? "", f.resolution?.text ?? "", f.votes.length, f.attachments?.length ?? 0,
      f.createdAt.slice(0, 16).replace("T", " "), deadlineOf(f)?.slice(0, 16).replace("T", " ") ?? "",
      (() => { const dl = deadlineOf(f); return dl && +new Date(dl) < Date.now() ? "да" : ""; })(), f.rating?.score ?? "",
    ]);
  const csv = "\ufeff" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="modus-feedback-${stamp}.csv"`,
    },
  });
}
