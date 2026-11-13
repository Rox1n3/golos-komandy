#!/usr/bin/env node
/**
 * Test of the main scenario of the spec on the dataset (no AI needed).
 *
 *   npm run test:core
 *
 * Checks the demo data against the dataset, the six check scenarios of the dataset (section 4), routing with the
 * fallback responsible, access rights, deadlines and escalation. Runs on an isolated server with a temporary
 * database; the demo data in data/ is not touched. AI is switched off for this test: the main scenario must work
 * without it.
 */
import { runTests } from "./lib/test-kit.mjs";

// Dataset: code → [type, status, responsible role].
const DATASET = {
  "A-001": ["problem", "new", "Руководитель закупок"],
  "A-002": ["idea", "review", "Руководитель направления"],
  "A-003": ["problem", "in_progress", "Ответственный за номенклатуру"],
  "A-004": ["idea", "done", "Ответственный за обучение"],
  "A-005": ["problem", "needs_info", "Руководитель бухгалтерии"],
  "A-006": ["idea", "review", "Ответственный за процессы"],
  "A-007": ["problem", "new", "IT-специалист"],
  "A-008": ["idea", "done", "Руководитель подразделения"],
  "A-009": ["problem", "in_progress", "Ответственный за договоры"],
  "A-010": ["idea", "review", "Руководитель продаж"],
  "A-011": ["problem", "new", "Руководитель направления"],
  "A-012": ["idea", "review", "IT-специалист"],
  "A-013": ["problem", "needs_info", "Руководитель проектов"],
  "A-014": ["idea", "review", "Руководитель проектирования"],
  "A-015": ["problem", "in_progress", "Руководитель направления"],
  "A-016": ["idea", "new", "Ответственный за обучение"],
  "A-017": ["idea", "rejected", "Административный руководитель"],
  "A-018": ["praise", "closed", "HR / внутренние коммуникации"],
  "A-019": ["problem", "review", "Администратор документов"],
  "A-020": ["idea", "new", "Руководитель подразделения"],
};

// Demo users: employees (authors), responsible roles, administrator.
const U1 = "u1"; // Сотрудник закупок
const U3 = "u3"; // Сотрудник бухгалтерии
const R1 = "r1"; // Руководитель закупок
const R5 = "r5"; // Руководитель бухгалтерии
const R7 = "r7"; // IT-специалист
const R8 = "r8"; // Руководитель подразделения — fallback responsible
const ADMIN = "a1";
const codes = (list) => list.map((f) => f.code).sort().join(",");

await runTests({ name: "core", port: 3211, env: { OPENAI_API_KEY: " " } }, async ({ call, check, section }) => {
  const get = async (user, url) => (await call(user, "GET", url)).json;

  section("0. Демо-данные = датасет");
  const all = await get(U1, "/api/feedback?sort=new");
  check("20 обращений A-001…A-020", all.length === 20 && codes(all) === Object.keys(DATASET).join(","), codes(all));
  const wrong = Object.entries(DATASET).filter(([code, [type, status, owner]]) => {
    const f = all.find((x) => x.code === code);
    return !f || f.type !== type || f.status !== status || f.assignee?.name !== owner;
  });
  check("Тип, статус и ответственный каждого обращения как в датасете", wrong.length === 0, wrong.map(([c]) => c).join(","));
  check("Авторы — условные роли, без имён людей", all.every((f) => !f.author || /^(Сотрудник|Менеджер|Координатор|Руководитель)/.test(f.author.name)));

  section("1. Создать обращение: тип, категория, описание, тестовый файл");
  const created = await call(U1, "POST", "/api/feedback", {
    type: "problem",
    category: "interdept",
    title: "Заявки возвращаются на уточнение",
    body: "В заявках на оборудование нет назначения изделия, приходится переспрашивать несколько раз.",
    solution: "Сделать поле «назначение» обязательным.",
  });
  const t1 = created.json;
  check("Обращение зарегистрировано с кодом A-021", created.status === 200 && t1.code === "A-021", JSON.stringify(t1).slice(0, 200));
  check("Предлагаемое решение сохранено", t1.solution === "Сделать поле «назначение» обязательным.");
  const form = new FormData();
  form.append("files", new Blob(["тестовый файл-заглушка"], { type: "text/plain" }), "пример.txt");
  const up = await call(U1, "POST", `/api/feedback/${t1.id}/attachments`, form);
  check("Тестовый файл прикреплён", up.status === 200 && up.json.attachments.length === 1);

  section("2. Назначить ответственного по категории; альтернатива при отсутствии");
  check("По категории «Межотдельное взаимодействие» → Руководитель закупок", t1.assignee?.name === "Руководитель закупок");
  check("Маршрут записан в историю", /Маршрут: «Межотдельное взаимодействие» → Руководитель закупок/.test(t1.history[0].note ?? ""), t1.history[0].note);
  check("Отметить отсутствие может только администратор", (await call(R1, "PATCH", "/api/users/r1", { away: true })).status === 403);
  await call(ADMIN, "PATCH", "/api/users/r1", { away: true });
  const t2 = (await call(U1, "POST", "/api/feedback", { type: "problem", category: "interdept", title: "Ещё одна заявка без параметров", body: "В заявке снова нет параметров изделия, пришлось уточнять у автора." })).json;
  check("Ответственный отсутствует → резервный «Руководитель подразделения»", t2.assignee?.name === "Руководитель подразделения", t2.assignee?.name);
  check("Причина резерва видна в истории", /резерв: Руководитель закупок отсутствует/.test(t2.history[0].note ?? ""), t2.history[0].note);
  check("Маршрут сохранён шаблоном, чтобы показываться на языке интерфейса", t1.history[0].sys?.kind === "route" && t2.history[0].sys?.kind === "routeFallback" && t2.history[0].sys?.awayOwner === "Руководитель закупок");
  await call(ADMIN, "PATCH", "/api/users/r1", { away: false });
  const t3 = (await call(U1, "POST", "/api/feedback", { type: "idea", category: "other", title: "Идея без подходящей категории", body: "Предлагаю обсудить формат общих встреч отделов раз в месяц." })).json;
  check("Категория без ответственного → резервный ответственный", t3.assignee?.name === "Руководитель подразделения", t3.assignee?.name);

  section("3. Изменить статус, запросить уточнение, сохранить историю комментариев");
  check("Сотрудник не может менять статус (403)", (await call(U1, "PATCH", `/api/feedback/${t1.id}`, { status: "review" })).status === 403);
  check("Ответственный другого подразделения не может (403)", (await call(R7, "PATCH", `/api/feedback/${t1.id}`, { status: "review" })).status === 403);
  check("Ответственный берёт на рассмотрение", (await call(R1, "PATCH", `/api/feedback/${t1.id}`, { status: "review", nextAction: "Запросить пример заявки" })).json?.status === "review");
  check("Запрос уточнения без вопроса отклоняется (400)", (await call(R1, "PATCH", `/api/feedback/${t1.id}`, { status: "needs_info" })).status === 400);
  const asked = (await call(R1, "PATCH", `/api/feedback/${t1.id}`, { status: "needs_info", note: "Приложите пример заявки, где не хватает данных." })).json;
  check("Статус «Ожидает уточнения», вопрос — официальный комментарий", asked.status === "needs_info" && asked.commentsView.some((c) => c.official && /Приложите пример/.test(c.text)));
  check("Дальнейшее действие сохранено", asked.nextAction === "Запросить пример заявки");
  const notes = await get(U1, "/api/notifications");
  check("Автор получил уведомление «просят уточнить»", notes.some((n) => n.kind === "clarify" && n.code === "A-021"));
  const answered = (await call(U1, "POST", `/api/feedback/${t1.id}/comments`, { text: "Пример: заявка на камеры без указания объекта." })).json;
  check("Ответ автора вернул обращение «На рассмотрение»", answered.status === "review" && /Автор ответил на уточнение/.test(answered.history.at(-1).note ?? ""));
  check("История комментариев сохранена (вопрос и ответ)", answered.commentsView.length === 2);
  check("Ответственный получил уведомление о комментарии", (await get(R1, "/api/notifications")).some((n) => n.kind === "comment" && n.code === "A-021"));
  const moved = (await call(R1, "PATCH", `/api/feedback/${t1.id}`, { assigneeId: R8 })).json;
  check("Передача другому ответственному записана в историю", moved.assignee?.id === R8 && moved.history.at(-1).event === "handover");

  section("4. Состояние и итог для автора, в том числе мотивированный отказ");
  const a017 = await get("u7", "/api/feedback/A-017");
  check("A-017: отказ с мотивировкой виден автору", a017.status === "rejected" && /нет подходящего помещения/.test(a017.resolution?.text ?? "") && a017.isMine);
  check("Отказ без мотивировки отклоняется (400)", (await call(R8, "PATCH", `/api/feedback/${t1.id}`, { status: "rejected" })).status === 400);
  check("«Реализовано» без текста решения отклоняется (400)", (await call(R8, "PATCH", `/api/feedback/${t1.id}`, { status: "done" })).status === 400);
  const done = (await call(R8, "PATCH", `/api/feedback/${t1.id}`, { status: "done", note: "Поле «назначение» стало обязательным." })).json;
  check("Итог записан и виден автору", done.status === "done" && (await get(U1, `/api/feedback/${t1.id}`)).resolution?.text === "Поле «назначение» стало обязательным.");
  const reopened = (await call(U1, "POST", `/api/feedback/${t1.id}/rate`, { score: 1, reopen: true })).json;
  check("Автор может один раз вернуть обращение на доработку", reopened.status === "review" && /повторное рассмотрение/.test(reopened.history.at(-1).note ?? ""));

  section("5. Фильтры: подразделение, категория, статус, срок; просроченные");
  check("Подразделение «Бухгалтерия»", codes(await get(R8, "/api/feedback?department=finance")) === "A-005");
  check("Категория «Обучение»", codes(await get(R8, "/api/feedback?category=training")) === "A-004,A-016");
  check("Статус «Ожидает уточнения»", codes(await get(R8, "/api/feedback?status=needs_info")) === "A-005,A-013");
  check("Только просроченные: A-007, A-011, A-012", codes(await get(R8, "/api/feedback?overdue=1")) === "A-007,A-011,A-012");
  check("Поиск по коду", codes(await get(U1, "/api/feedback?q=A-013")) === "A-013");

  section("6. Сводка: по типам, доля закрытых, время первого ответа");
  const stats = await get(R8, "/api/stats");
  const byType = Object.fromEntries(stats.byType.map((x) => [x.key, x.value]));
  check("Количество по типам считается", byType.problem >= 9 && byType.idea >= 10 && byType.praise === 1, JSON.stringify(byType));
  check("Доля закрытых и время первого ответа считаются", typeof stats.closedShare === "number" && typeof stats.avgFirstResponseH === "number" && stats.avgFirstResponseH > 0);
  check("Повторяющиеся проблемы найдены", stats.repeatTags.length > 0);
  const empStats = await get(U1, "/api/stats");
  check("Сотруднику — только общие цифры, без нагрузки ответственных", !("byAssignee" in empStats) && typeof empStats.reviewedShare === "number");

  section("Эскалация просроченных");
  // A-021 is also there: the author sent it back above, and a sent-back ticket alerts its responsible person.
  const esc = (await get(R8, "/api/notifications")).filter((n) => n.kind === "escalation").map((n) => n.code);
  check("Руководитель подразделения уведомлён о просроченных A-007, A-011, A-012", ["A-007", "A-011", "A-012"].every((c) => esc.includes(c)), esc.join(","));
  check("О непросроченных обращениях датасета эскалаций нет", esc.filter((c) => c <= "A-020" && !["A-007", "A-011", "A-012"].includes(c)).length === 0, esc.join(","));
  const a007 = await get(R7, "/api/feedback/A-007");
  check("В истории A-007 есть шаг эскалации", a007.history.some((h) => h.event === "escalation" && h.sys?.kind === "escalation"));
  check("Стандартные фразы демо-данных — шаблоны (A-005: «Взято на рассмотрение», «Запрошено уточнение»)", ["taken", "clarifyAsked"].every((k) => all.find((f) => f.code === "A-005").history.some((h) => h.sys?.kind === k)));

  section("Права доступа и защита данных");
  check("Настройки меняет только администратор", (await call(R8, "PATCH", "/api/settings", { fallbackAssigneeId: R1 })).status === 403);
  check("Выгрузка в Excel закрыта для сотрудника", (await call(U1, "GET", "/api/export")).status === 403);
  const anon = (await call(U3, "POST", "/api/feedback", { type: "problem", category: "docflow", anonymous: true, title: "Анонимное тестовое обращение", body: "Проверка: имя автора не должно уходить никому, включая администратора." })).json;
  check("Анонимное: автор скрыт даже от администратора", (await get(ADMIN, `/api/feedback/${anon.id}`)).author === null);
  check("Анонимное: по коду отслеживания виден статус", (await get(null, `/api/track/${anon.trackingCode}`)).id === anon.id);
  const foreignFile = up.json.attachments[0].id;
  check("Нельзя удалить файл чужого обращения", (await call(U3, "DELETE", `/api/feedback/${anon.id}/attachments?file=${foreignFile}`)).status === 404);
  check("Файл первого обращения не пострадал и скачивается", (await call(U1, "GET", `/api/files/${foreignFile}`)).status === 200);
});
