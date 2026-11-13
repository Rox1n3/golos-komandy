import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { UPLOADS, db } from "@/lib/db";

// Only formats a browser renders without running code are shown inline; HTML, SVG and the rest are downloaded.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/(mp4|webm|ogg)|audio\/[a-z0-9.+-]+|text\/plain)$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = db().feedback.flatMap((f) => f.attachments ?? []).find((x) => x.id === id);
  const file = path.join(UPLOADS, path.basename(id));
  if (!a || !existsSync(file)) return new Response("Not found", { status: 404 });
  const inline = INLINE.test(a.type) && new URL(req.url).searchParams.get("download") !== "1";
  const ascii = a.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(readFileSync(file), {
    headers: {
      "Content-Type": inline ? a.type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Content-Length": String(a.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
