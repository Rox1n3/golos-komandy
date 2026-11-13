/**
 * Shared kit for the project tests: an isolated production server with a temporary database,
 * a request helper that acts as a demo user, and PASS/FAIL reporting.
 *
 * The server is built once into .next-test (again only when src/ changed) and started with DATA_DIR pointing to a
 * temporary folder, so the demo data in data/ is never touched. Pass `--base <url>` to test a running server instead.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = ".next-test";
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newestMtime(dir) {
  let max = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return max;
}

/**
 * Runs `fn(t)` against a test server and exits with code 1 if any check failed.
 * `t` has: base, call(user, method, url, body), check(name, ok, detail), skip(name, why), section(title).
 */
export async function runTests({ name, port, env = {} }, fn) {
  const args = process.argv.slice(2);
  const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
  const counts = { pass: 0, fail: 0, skip: 0 };
  let server = null;
  let dataDir = null;

  const t = {
    base: baseArg ?? `http://localhost:${port}`,
    isolated: !baseArg,
    section: (title) => console.log(`\n${title}`),
    check(label, ok, detail = "") {
      counts[ok ? "pass" : "fail"]++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n        ${String(detail).replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
    },
    skip(label, why) {
      counts.skip++;
      console.log(`  SKIP  ${label} — ${why}`);
    },
    /** Request as a demo user (user id from the seed; null = no session cookie). */
    async call(user, method, url, body) {
      const headers = {};
      if (user) headers.cookie = `uid=${user}`;
      let payload;
      if (body instanceof FormData) payload = body;
      else if (body !== undefined) {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
      const r = await fetch(t.base + url, { method, headers, body: payload });
      let json = null;
      try {
        json = await r.json();
      } catch {}
      return { status: r.status, json };
    },
  };

  try {
    if (!baseArg) {
      const buildId = path.join(ROOT, DIST, "BUILD_ID");
      const stale = !existsSync(buildId) || newestMtime(path.join(ROOT, "src")) > statSync(buildId).mtimeMs;
      if (args.includes("--rebuild") || stale) {
        console.log("Сборка приложения для теста…");
        const b = spawnSync(process.execPath, [NEXT, "build"], { cwd: ROOT, env: { ...process.env, NEXT_DIST_DIR: DIST }, stdio: "inherit" });
        if (b.status !== 0) throw new Error("сборка не удалась");
      }
      dataDir = mkdtempSync(path.join(tmpdir(), `golos-${name}-`));
      server = spawn(process.execPath, [NEXT, "start", "-p", String(port)], {
        cwd: ROOT,
        env: { ...process.env, NEXT_DIST_DIR: DIST, DATA_DIR: dataDir, ...env },
        stdio: "ignore",
      });
      let up = false;
      for (let i = 0; i < 120 && !up; i++) {
        try {
          up = (await fetch(t.base + "/api/me")).ok;
        } catch {}
        if (!up) await sleep(500);
      }
      if (!up) throw new Error("тестовый сервер не запустился");
    }
    console.log(`Сервер: ${t.base}${baseArg ? "" : " (изолированный, временная база)"}`);
    await fn(t);
  } catch (e) {
    counts.fail++;
    console.log(`\nОШИБКА ТЕСТА: ${e.message}`);
  } finally {
    if (server && server.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill("SIGTERM");
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(`\nИтого: ${counts.pass} пройдено, ${counts.fail} не пройдено, ${counts.skip} пропущено.`);
  process.exit(counts.fail ? 1 : 0);
}
