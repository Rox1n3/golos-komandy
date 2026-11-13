import { NextResponse } from "next/server";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UPLOADS, canProcess, db, mutate, toView, uid } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { MAX_FILES, MAX_FILE_MB, type Attachment, type Feedback, type User } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Author (by session or tracking code) and whoever may process the ticket add files; everyone else only reads them. */
function canEdit(f: Feedback, user: User, code?: string | null) {
  if (code) return code === f.trackingCode;
  return canProcess(user, f) || f.authorId === user.id;
}

// File names come from the user's disk: keep them readable but strip path parts and control characters.
const cleanName = (n: string) => n.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 160) || "file";

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  const form = await req.formData();
  const code = (form.get("code") as string | null) || null;
  const f = db().feedback.find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canEdit(f, user, code)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const files = form.getAll("files").filter((x): x is File => typeof x === "object" && "arrayBuffer" in x);
  if (!files.length) return NextResponse.json({ error: "empty" }, { status: 400 });
  if ((f.attachments?.length ?? 0) + files.length > MAX_FILES) return NextResponse.json({ error: "too_many" }, { status: 400 });
  if (files.some((x) => x.size > MAX_FILE_MB * 1024 * 1024)) return NextResponse.json({ error: "too_big" }, { status: 400 });

  if (!existsSync(UPLOADS)) mkdirSync(UPLOADS, { recursive: true });
  const asAnon = f.anonymous && (!!code || f.authorId === user.id);
  const added: Attachment[] = [];
  for (const file of files) {
    const a: Attachment = {
      id: uid("a") + uid(),
      name: cleanName(file.name),
      size: file.size,
      type: file.type || "application/octet-stream",
      at: new Date().toISOString(),
      by: asAnon ? null : user.id,
    };
    writeFileSync(path.join(UPLOADS, a.id), Buffer.from(await file.arrayBuffer()));
    added.push(a);
  }
  const updated = mutate((d) => {
    const t = d.feedback.find((x) => x.id === id)!;
    t.attachments = [...(t.attachments ?? []), ...added];
    t.updatedAt = new Date().toISOString();
    return t;
  });
  return NextResponse.json(toView(updated, code ? null : user, { viaCode: !!code }));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const user = await currentUser();
  const q = new URL(req.url).searchParams;
  const fileId = q.get("file");
  const code = q.get("code");
  const f = db().feedback.find((x) => x.id === id);
  if (!f || !fileId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canEdit(f, user, code)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Only a file of this very ticket may be removed (the id must not point to another ticket's file).
  if (!(f.attachments ?? []).some((a) => a.id === fileId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const updated = mutate((d) => {
    const t = d.feedback.find((x) => x.id === id)!;
    t.attachments = (t.attachments ?? []).filter((a) => a.id !== fileId);
    return t;
  });
  const p = path.join(UPLOADS, path.basename(fileId));
  if (existsSync(p)) unlinkSync(p);
  return NextResponse.json(toView(updated, code ? null : user, { viaCode: !!code }));
}
