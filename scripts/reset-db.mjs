import { rmSync } from "node:fs";
rmSync(new URL("../data/db.json", import.meta.url), { force: true });
console.log("data/db.json удалён — демо-данные пересоздадутся при следующем запросе.");
