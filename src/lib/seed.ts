import type { Campaign, CategoryDef, DB, Feedback, FeedbackType, HistoryEntry, Priority, Pulse, Status, User, SysNote } from "./types";

/**
 * Demo data = the hackathon dataset «Демонстрационные обращения сотрудников» (A-001…A-020).
 *
 * As the dataset requires, people are conditional roles, not names. Texts, types, categories, priorities,
 * statuses, responsible roles and next actions are taken from the dataset as is. Short titles, dates,
 * votes and a few comments are added for the demo ("участники могут дополнить набор"): without dates there is
 * no time-to-first-response and no overdue tickets to show.
 */

const H = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

const author = (id: string, name: string, department: User["department"], position: string, color: string): User => ({ id, name, role: "employee", department, position, color });
const owner = (id: string, name: string, department: User["department"], position: string, color: string): User => ({ id, name, role: "reviewer", department, position, color });

export const SEED_USERS: User[] = [
  // Authors of the dataset tickets
  author("u1", "Сотрудник закупок", "procurement", "Закупки", "#2f80ed"),
  author("u2", "Сотрудник проектирования", "design", "Проектирование", "#7c4ddb"),
  author("u3", "Сотрудник бухгалтерии", "finance", "Бухгалтерия", "#d97706"),
  author("u4", "Менеджер по продажам", "sales", "Продажи", "#0f9d6b"),
  author("u5", "Координатор проекта", "projects", "Проектный отдел", "#0e7490"),
  author("u6", "Руководитель проекта", "projects", "Проектный отдел", "#9333ea"),
  author("u7", "Сотрудник офиса", "admin", "Офис", "#64748b"),
  // Conditional responsible roles of the dataset
  owner("r1", "Руководитель закупок", "procurement", "Закупки", "#1d4ed8"),
  owner("r2", "Руководитель направления", "admin", "Управление направлением", "#be123c"),
  owner("r3", "Ответственный за номенклатуру", "design", "Каталог и номенклатура", "#4338ca"),
  owner("r4", "Ответственный за обучение", "hr", "Обучение", "#db2777"),
  owner("r5", "Руководитель бухгалтерии", "finance", "Бухгалтерия", "#b45309"),
  owner("r6", "Ответственный за процессы", "admin", "Процессы и регламенты", "#0f766e"),
  owner("r7", "IT-специалист", "it", "IT", "#0369a1"),
  owner("r8", "Руководитель подразделения", "admin", "Подразделение", "#7c2d12"),
  owner("r9", "Ответственный за договоры", "sales", "Договорная работа", "#15803d"),
  owner("r10", "Руководитель продаж", "sales", "Продажи", "#047857"),
  owner("r11", "Руководитель проектов", "projects", "Проектный отдел", "#6d28d9"),
  owner("r12", "Руководитель проектирования", "design", "Проектирование", "#5b21b6"),
  owner("r13", "Административный руководитель", "admin", "Административная служба", "#475569"),
  owner("r14", "HR / внутренние коммуникации", "hr", "HR и внутренние коммуникации", "#c026d3"),
  owner("r15", "Администратор документов", "admin", "Документы", "#334155"),
  // Added for the safety scenario ("Опасность на объекте"), not part of the dataset
  owner("r16", "Специалист по охране труда", "service", "Охрана труда", "#c2410c"),
  { id: "a1", name: "Администратор системы", role: "admin", department: "admin", position: "Настройки и маршрутизация", color: "#c81e1e" },
];

/** Dataset categories with the default routing rule (category → conditional responsible). */
export const SEED_CATEGORIES: CategoryDef[] = [
  { id: "interdept", name: { ru: "Межотдельное взаимодействие", kk: "Бөлімаралық өзара іс-қимыл" }, responsibleId: "r1", active: true },
  { id: "transparency", name: { ru: "Информационная прозрачность", kk: "Ақпараттық ашықтық" }, responsibleId: "r2", active: true },
  { id: "catalog", name: { ru: "Каталог и данные", kk: "Каталог және деректер" }, responsibleId: "r3", active: true },
  { id: "training", name: { ru: "Обучение", kk: "Оқыту" }, responsibleId: "r4", active: true },
  { id: "docflow", name: { ru: "Документооборот", kk: "Құжат айналымы" }, responsibleId: "r5", active: true },
  { id: "regulations", name: { ru: "Регламенты", kk: "Регламенттер" }, responsibleId: "r6", active: true },
  { id: "it", name: { ru: "Интеграции и IT", kk: "Интеграциялар және IT" }, responsibleId: "r7", active: true },
  { id: "knowledge", name: { ru: "Знания и наставничество", kk: "Білім және тәлімгерлік" }, responsibleId: "r8", active: true },
  { id: "contracts", name: { ru: "Договорная работа", kk: "Шарт жұмысы" }, responsibleId: "r9", active: true },
  { id: "tasks", name: { ru: "Задачи и коммуникации", kk: "Тапсырмалар және коммуникациялар" }, responsibleId: "r10", active: true },
  { id: "speed", name: { ru: "Оперативность", kk: "Жеделдік" }, responsibleId: "r2", active: true },
  { id: "comms", name: { ru: "Коммуникации", kk: "Коммуникациялар" }, responsibleId: "r7", active: true },
  { id: "projects", name: { ru: "Проектная деятельность", kk: "Жобалық қызмет" }, responsibleId: "r11", active: true },
  { id: "resources", name: { ru: "Планирование ресурсов", kk: "Ресурстарды жоспарлау" }, responsibleId: "r12", active: true },
  { id: "tasksetting", name: { ru: "Постановка задач", kk: "Тапсырма қою" }, responsibleId: "r2", active: true },
  { id: "workplace", name: { ru: "Корпоративная среда", kk: "Корпоративтік орта" }, responsibleId: "r13", active: true },
  { id: "storage", name: { ru: "Хранение документов", kk: "Құжаттарды сақтау" }, responsibleId: "r15", active: true },
  { id: "results", name: { ru: "Прозрачность результатов", kk: "Нәтижелердің ашықтығы" }, responsibleId: "r8", active: true },
  { id: "safety", name: { ru: "Охрана труда", kk: "Еңбекті қорғау" }, responsibleId: "r16", active: true },
  { id: "other", name: { ru: "Другое", kk: "Басқа" }, active: true },
];

/** Placeholder attachments ("файлы-заглушки") — not real company documents. */
export const SEED_FILES = [
  { id: "seedfile-a001", name: "пример-заявки-на-оборудование.txt", type: "text/plain", content: "Файл-заглушка для демонстрации.\nПример полей заявки: наименование изделия, назначение, требуемые параметры, количество, срок.\nНе является реальным документом компании.\n" },
  { id: "seedfile-a013", name: "спецификация-сравнение-версий.csv", type: "text/csv", content: "Строка;Версия 1;Версия 2;Изменено\n1;Позиция А;Позиция А;нет\n2;Позиция Б;Позиция Б-2;да\n3;—;Позиция В;добавлено\n" },
];

type Step = [Status, number, string | null, string?];
interface Item {
  code: number;
  type: FeedbackType;
  category: string;
  author: string;
  priority: Priority;
  status: Status;
  assignee: string;
  title: string;
  body: string;
  /** Dataset "Пример дальнейшего действия" for open tickets. */
  next?: string;
  /** Dataset "Пример результата / мотивированного ответа" for closed tickets. */
  result?: string;
  tags: string[];
  votes: number;
  path: Step[];
  comments?: [string, string, number, boolean?][];
  file?: { id: string; by: string; at: number };
  rating?: number;
}

/** Standard phrases of the demo history that the interface shows in its language (the rest are people's own words). */
const GENERIC: Record<string, SysNote> = {
  "Взято на рассмотрение": { kind: "taken" },
  "Принято в работу": { kind: "accepted" },
  "Идея принята": { kind: "ideaAccepted" },
  "Запрошено уточнение у автора": { kind: "clarifyAsked" },
};

const DEP: Record<string, User["department"]> = Object.fromEntries(SEED_USERS.map((u) => [u.id, u.department]));

const ITEMS: Item[] = [
  { code: 1, type: "problem", category: "interdept", author: "u1", priority: "medium", status: "new", assignee: "r1",
    title: "В заявках на оборудование не хватает назначения и параметров",
    body: "В заявках на приобретение оборудования иногда не хватает назначения изделия и требуемых параметров. Предлагаю добавить обязательные поля, чтобы сократить число уточнений.",
    next: "Запросить пример корректно заполненной заявки; оценить изменение шаблона.",
    tags: ["заявки", "шаблон"], votes: 4, path: [["new", 20, null]], file: { id: "seedfile-a001", by: "u1", at: 20 } },
  { code: 2, type: "idea", category: "transparency", author: "u1", priority: "medium", status: "review", assignee: "r2",
    title: "Показывать поставщикам общую стадию проекта",
    body: "При общении с поставщиками полезно видеть общую стадию проекта без доступа к коммерческим деталям. Можно ли показывать краткий статус и ориентировочные контрольные даты?",
    next: "Определить перечень доступных статусов и источник их обновления.",
    tags: ["поставщики", "статус проекта"], votes: 3, path: [["new", 144, null], ["review", 98, "r2", "Взято на рассмотрение"]] },
  { code: 3, type: "problem", category: "catalog", author: "u2", priority: "high", status: "in_progress", assignee: "r3",
    title: "Разные обозначения одного изделия в материалах",
    body: "В рабочих материалах иногда встречаются разные обозначения одного изделия. Это увеличивает время проверки спецификации. Нужен понятный способ находить актуальную карточку позиции.",
    next: "Подготовить правило проверки и корректировки номенклатуры.",
    tags: ["номенклатура", "спецификация"], votes: 7,
    path: [["new", 336, null], ["review", 330, "r3", "Взято на рассмотрение"], ["accepted", 300, "r3", "Принято в работу"], ["in_progress", 200, "r3", "Готовим правило проверки номенклатуры"]],
    comments: [["r3", "Готовим правило проверки и корректировки номенклатуры, черновик — к концу недели.", 199, true]] },
  { code: 4, type: "idea", category: "training", author: "u1", priority: "low", status: "done", assignee: "r4",
    title: "Короткие занятия по новым товарным линейкам",
    body: "Было бы полезно проводить короткие занятия по новым товарным линейкам с разбором типовых запросов. Предлагаю составить календарь таких встреч.",
    result: "Запланирован пробный обучающий семинар.",
    tags: ["обучение", "товарные линейки"], votes: 9,
    path: [["new", 720, null], ["review", 712, "r4", "Взято на рассмотрение"], ["accepted", 650, "r4", "Идея принята"], ["in_progress", 500, "r4", "Составляем календарь встреч"], ["done", 300, "r4", "Запланирован пробный обучающий семинар"]],
    comments: [["r4", "Запланирован пробный обучающий семинар, приглашения отправлены.", 300, true]], rating: 5 },
  { code: 5, type: "problem", category: "docflow", author: "u3", priority: "medium", status: "needs_info", assignee: "r5",
    title: "Не видно, на каком этапе пакет документов",
    body: "При обработке документов между подразделениями возникают дополнительные вопросы о том, на каком этапе находится пакет. Хотелось бы видеть ответственного и текущий статус.",
    next: "Уточнить виды документов и ключевые этапы согласования.",
    tags: ["документы", "статус"], votes: 3,
    path: [["new", 120, null], ["review", 112, "r5", "Взято на рассмотрение"], ["needs_info", 100, "r5", "Запрошено уточнение у автора"]],
    comments: [["r5", "Уточните, пожалуйста: о каких видах документов идёт речь и на каких этапах согласования чаще всего возникают вопросы?", 100, true]] },
  { code: 6, type: "idea", category: "regulations", author: "u3", priority: "medium", status: "review", assignee: "r6",
    title: "Памятка для операций нескольких подразделений",
    body: "Предлагаю собрать короткую пошаговую памятку для операций, в которых последовательно участвуют несколько подразделений, и определить порядок актуализации памятки.",
    next: "Назначить владельца процесса и согласовать черновик инструкции.",
    tags: ["памятка", "процессы"], votes: 5, path: [["new", 96, null], ["review", 82, "r6", "Взято на рассмотрение"]] },
  { code: 7, type: "problem", category: "it", author: "u3", priority: "high", status: "new", assignee: "r7",
    title: "Повторный ввод одних данных в разных системах",
    body: "Иногда повторный ввод одних и тех же сведений в разных рабочих системах занимает много времени. Нужна оценка, какие операции можно синхронизировать безопасно.",
    next: "Собрать примеры операций и оценить техническую реализуемость.",
    tags: ["интеграция", "двойной ввод"], votes: 8, path: [["new", 60, null]],
    comments: [["u4", "У продаж та же ситуация: одни и те же данные вносим в несколько систем.", 40]] },
  { code: 8, type: "idea", category: "knowledge", author: "u3", priority: "low", status: "done", assignee: "r8",
    title: "Памятка по типовым ошибкам для нового сотрудника",
    body: "При передаче сложной задачи новому сотруднику полезен короткий разбор типовых ошибок и контактов, к которым можно обратиться за помощью. Предлагаю сделать такую памятку.",
    result: "Создана учебная инструкция.",
    tags: ["наставничество", "памятка"], votes: 6,
    path: [["new", 600, null], ["review", 594, "r8", "Взято на рассмотрение"], ["accepted", 560, "r8", "Идея принята"], ["in_progress", 480, "r8", "Готовим инструкцию"], ["done", 240, "r8", "Создана учебная инструкция"]],
    comments: [["r8", "Учебная инструкция с типовыми ошибками и контактами опубликована.", 240, true]], rating: 4 },
  { code: 9, type: "problem", category: "contracts", author: "u4", priority: "high", status: "in_progress", assignee: "r9",
    title: "Неясно, кто готовит и проверяет приложение к договору",
    body: "Не всегда понятно, кто готовит очередную версию приложения к договору и кто должен проверить её перед отправкой. Это приводит к повторным согласованиям.",
    next: "Разграничить этапы подготовки, проверки и утверждения.",
    tags: ["договоры", "согласование"], votes: 6,
    path: [["new", 216, null], ["review", 210, "r9", "Взято на рассмотрение"], ["accepted", 190, "r9", "Принято в работу"], ["in_progress", 150, "r9", "Разграничиваем этапы"]],
    comments: [["r9", "Разграничиваем этапы подготовки, проверки и утверждения; схему покажем на следующей неделе.", 149, true]] },
  { code: 10, type: "idea", category: "tasks", author: "u4", priority: "medium", status: "review", assignee: "r10",
    title: "Не закрывать задачу до подтверждения результата",
    body: "Предлагаю не закрывать рабочую задачу до подтверждения заказчиком результата внутри компании, чтобы связанные вопросы оставались в общей истории обсуждения.",
    next: "Проверить, подходит ли правило для разных типов задач.",
    tags: ["задачи", "история"], votes: 2, path: [["new", 72, null], ["review", 62, "r10", "Взято на рассмотрение"]] },
  { code: 11, type: "problem", category: "speed", author: "u4", priority: "high", status: "new", assignee: "r2",
    title: "Непредсказуемые сроки ответа смежных подразделений",
    body: "При срочной подготовке клиентского предложения сложно прогнозировать сроки ответа от смежных подразделений. Хотелось бы видеть ожидаемый срок и уведомление при задержке.",
    next: "Определить допустимые сроки реакции для разных категорий.",
    tags: ["сроки", "уведомления"], votes: 7, path: [["new", 40, null]] },
  { code: 12, type: "idea", category: "comms", author: "u4", priority: "low", status: "review", assignee: "r7",
    title: "Единое место для итоговых решений по задаче",
    body: "Рабочие обсуждения распределены по нескольким каналам, из-за чего теряется контекст. Предлагаю выбрать единое место для итоговых решений по задаче.",
    next: "Сравнить варианты и предложить правила фиксации итогов.",
    tags: ["коммуникации", "решения"], votes: 4, path: [["new", 192, null], ["review", 174, "r7", "Взято на рассмотрение"]] },
  { code: 13, type: "problem", category: "projects", author: "u5", priority: "medium", status: "needs_info", assignee: "r11",
    title: "Не видно, какие строки спецификации изменились",
    body: "Когда изменяется состав оборудования в проекте, не всегда ясно, какие строки спецификации были пересмотрены. Нужна более заметная история изменений.",
    next: "Уточнить формат исходных файлов и способы сравнения версий.",
    tags: ["спецификация", "история изменений"], votes: 5,
    path: [["new", 168, null], ["review", 160, "r11", "Взято на рассмотрение"], ["needs_info", 150, "r11", "Запрошено уточнение у автора"]],
    comments: [["r11", "Уточните, пожалуйста: в каком формате исходные файлы спецификаций и как сейчас сравниваете версии?", 150, true]],
    file: { id: "seedfile-a013", by: "u5", at: 168 } },
  { code: 14, type: "idea", category: "resources", author: "u5", priority: "medium", status: "review", assignee: "r12",
    title: "Показывать загруженность проектной группы",
    body: "Предлагаю показывать загруженность проектной группы на ближайшие недели в укрупнённом виде. Так будет проще согласовывать сроки запуска новых задач.",
    next: "Согласовать показатели загрузки и права просмотра.",
    tags: ["загрузка", "планирование"], votes: 3, path: [["new", 120, null], ["review", 102, "r12", "Взято на рассмотрение"]] },
  { code: 15, type: "problem", category: "tasksetting", author: "u6", priority: "medium", status: "in_progress", assignee: "r2",
    title: "Поручения без ожидаемого результата и срока",
    body: "Некоторые поручения поступают без ожидаемого результата и даты завершения. Предлагаю договориться о минимальном наборе данных при постановке задачи.",
    next: "Подготовить шаблон с целью, сроком, приоритетом и ответственным.",
    tags: ["задачи", "шаблон"], votes: 6,
    path: [["new", 288, null], ["review", 280, "r2", "Взято на рассмотрение"], ["accepted", 260, "r2", "Принято в работу"], ["in_progress", 200, "r2", "Готовим шаблон постановки задачи"]],
    comments: [["r2", "Готовим шаблон: цель, срок, приоритет, ответственный.", 199, true]] },
  { code: 16, type: "idea", category: "training", author: "u6", priority: "low", status: "new", assignee: "r4",
    title: "Практические демонстрации оборудования для новых сотрудников",
    body: "Для новых сотрудников полезны практические демонстрации оборудования, а не только презентации. Предлагаю пилотное занятие с учебными образцами.",
    next: "Проверить наличие образцов и составить план пилота.",
    tags: ["обучение", "оборудование"], votes: 4, path: [["new", 10, null]] },
  { code: 17, type: "idea", category: "workplace", author: "u7", priority: "low", status: "rejected", assignee: "r13",
    title: "Зона для коротких перерывов",
    body: "Предлагаю организовать отдельную небольшую зону для коротких перерывов рядом с рабочими помещениями.",
    result: "Сейчас нет подходящего помещения; вернуться к вопросу при перепланировке.",
    tags: ["офис"], votes: 2,
    path: [["new", 360, null], ["review", 344, "r13", "Взято на рассмотрение"], ["rejected", 300, "r13", "Сейчас нет подходящего помещения"]],
    comments: [["r13", "Сейчас нет подходящего помещения. Вернёмся к вопросу при перепланировке офиса.", 300, true]], rating: 4 },
  { code: 18, type: "praise", category: "workplace", author: "u7", priority: "low", status: "closed", assignee: "r14",
    title: "Спасибо за внутренние учебные встречи",
    body: "Хочу отметить пользу внутренних учебных встреч: после них стало легче обращаться к коллегам за консультацией. Было бы хорошо сохранить этот формат.",
    result: "Положительный отзыв зафиксирован и передан организаторам обучения.",
    tags: ["обучение", "отзыв"], votes: 5,
    path: [["new", 144, null], ["review", 140, "r14", "Взято на рассмотрение"], ["closed", 130, "r14", "Отзыв передан организаторам обучения"]],
    comments: [["r14", "Спасибо! Передали отзыв организаторам обучения — формат сохраняем.", 130, true]] },
  { code: 19, type: "problem", category: "storage", author: "u5", priority: "medium", status: "review", assignee: "r15",
    title: "Трудно найти актуальную редакцию инструкции",
    body: "В общих папках трудно быстро определить актуальную редакцию инструкции. Можно ли закрепить единые правила именования и архивирования старых версий?",
    next: "Согласовать порядок хранения и владельцев папок.",
    tags: ["документы", "версии"], votes: 6, path: [["new", 96, null], ["review", 72, "r15", "Взято на рассмотрение"]],
    comments: [["u2", "Поддерживаю: в проектных папках та же проблема с версиями.", 80]] },
  { code: 20, type: "idea", category: "results", author: "u1", priority: "low", status: "new", assignee: "r8",
    title: "Публиковать обзор завершённых улучшений",
    body: "Предлагаю публиковать краткий обзор завершённых внутренних улучшений, чтобы сотрудники видели результат направленных предложений.",
    next: "Рассмотреть формат квартальной подборки без конфиденциальных сведений.",
    tags: ["прозрачность", "обзор"], votes: 5, path: [["new", 5, null]] },
];

function seedPulse(): Pulse[] {
  const out: Pulse[] = [];
  const monday = (weeksAgo: number) => {
    const d = new Date(Date.now() - weeksAgo * 7 * 86400_000);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const comments = ["Много срочных запросов от смежных отделов", "Хорошая неделя, задачи закрыты в срок", "Не хватает информации о планах проекта", "Полезная учебная встреча", "Сложно найти актуальную версию инструкции"];
  const deps = ["procurement", "design", "finance", "sales", "projects", "admin"] as const;
  for (let w = 8; w >= 1; w--) {
    const base = 3.3 + (8 - w) * 0.07;
    for (let i = 0; i < 18; i++) {
      const dep = deps[i % deps.length];
      const wobble = ((i * 7 + w * 3) % 5) - 2;
      const score = Math.max(1, Math.min(5, Math.round(base + wobble * 0.6 - (dep === "sales" ? 0.5 : 0))));
      out.push({
        id: `p${w}-${i}`,
        userId: `pulse-${i}`,
        department: dep,
        week: monday(w),
        score,
        comment: (i + w) % 6 === 0 ? comments[(i + w) % comments.length] : undefined,
        at: new Date(Date.now() - w * 7 * 86400_000).toISOString(),
      });
    }
  }
  return out;
}

const idOf = (code: number) => `a${String(code).padStart(3, "0")}`;

const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    title: "Меньше уточнений между подразделениями",
    question:
      "Заявки, документы и поручения часто возвращаются на уточнение. Какие шаблоны, обязательные поля или правила помогут передавать задачи между подразделениями с первого раза?",
    audience: "all",
    createdBy: "r8",
    createdAt: ago(24 * 9),
    deadline: new Date(Date.now() + 12 * 24 * H).toISOString(),
    winners: [],
  },
  {
    id: "c2",
    title: "Одно место для решений и сроков",
    question: "Обсуждения распределены по разным каналам, а сроки ответа смежных подразделений сложно прогнозировать. Как фиксировать итоговые решения и ожидаемые сроки?",
    audience: "all",
    createdBy: "r2",
    createdAt: ago(24 * 4),
    deadline: new Date(Date.now() + 20 * 24 * H).toISOString(),
    winners: [],
  },
  {
    id: "c3",
    title: "Обучение и адаптация сотрудников",
    question: "Какие форматы обучения помогут быстрее разбираться в товарных линейках и типовых задачах?",
    audience: "all",
    createdBy: "r4",
    createdAt: ago(24 * 40),
    deadline: ago(24 * 9),
    closedAt: ago(24 * 9),
    winners: [idOf(4)],
  },
];

export function buildSeed(): DB {
  const voters = SEED_USERS.map((u) => u.id);
  const feedback: Feedback[] = ITEMS.map((it) => {
    const id = idOf(it.code);
    const history: HistoryEntry[] = it.path.map(([status, h, by, note]) => ({ status, at: ago(h), by, note, sys: note ? GENERIC[note] : undefined }));
    const createdAt = history[0].at;
    // The first history entry records how the ticket was routed (dataset "условный ответственный").
    const ownerName = SEED_USERS.find((u) => u.id === it.assignee)?.name ?? "";
    const catRu = SEED_CATEGORIES.find((c) => c.id === it.category)?.name.ru ?? it.category;
    history[0].note = `Маршрут: «${catRu}» → ${ownerName}`;
    history[0].sys = { kind: "route", category: it.category, to: ownerName };
    const last = history[history.length - 1];
    const closed = it.status === "done" || it.status === "rejected" || it.status === "closed";
    const file = it.file ? SEED_FILES.find((f) => f.id === it.file!.id) : undefined;
    return {
      id,
      number: it.code,
      type: it.type,
      title: it.title,
      body: it.body,
      category: it.category,
      priority: it.priority,
      department: DEP[it.assignee],
      tags: it.tags,
      anonymous: false,
      authorId: it.author,
      status: it.status,
      history,
      resolution: closed && it.result ? { text: it.result, at: last.at, by: it.assignee } : undefined,
      assigneeId: it.assignee,
      nextAction: closed ? undefined : it.next,
      votes: voters.filter((v) => v !== it.author && v !== it.assignee).slice(0, it.votes),
      comments: (it.comments ?? []).map(([authorId, text, h, official], k) => ({ id: `c${it.code}-${k}`, authorId, text, at: ago(h), official })),
      followers: [it.author],
      attachments: file && it.file ? [{ id: file.id, name: file.name, size: Buffer.byteLength(file.content, "utf8"), type: file.type, at: ago(it.file.at), by: it.file.by }] : undefined,
      rating: it.rating ? { score: it.rating, at: last.at } : undefined,
      sentiment: it.type === "praise" ? "positive" : it.type === "problem" ? "negative" : "neutral",
      createdAt,
      updatedAt: last.at,
    };
  });
  // Tickets sent in answer to a campaign.
  const link: Record<string, number[]> = { c1: [1, 6, 15], c2: [10, 11, 12], c3: [4, 8] };
  Object.entries(link).forEach(([c, codes]) => codes.forEach((code) => {
    const f = feedback.find((x) => x.number === code);
    if (f) f.campaignId = c;
  }));
  return {
    version: 9,
    users: SEED_USERS,
    feedback,
    notifications: [
      { id: "n1", userId: "u3", feedbackId: idOf(5), kind: "clarify", at: ago(100), read: false },
      { id: "n2", userId: "u5", feedbackId: idOf(13), kind: "clarify", at: ago(150), read: false },
      { id: "n3", userId: "u1", feedbackId: idOf(4), kind: "status", status: "done", at: ago(300), read: true },
      { id: "n6", userId: "r1", feedbackId: idOf(1), kind: "assigned", at: ago(20), read: false },
    ],
    pulse: seedPulse(),
    campaigns: SEED_CAMPAIGNS,
    categories: SEED_CATEGORIES,
    settings: { fallbackAssigneeId: "r8" },
    embeddings: {},
    counter: ITEMS.length + 1,
  };
}
