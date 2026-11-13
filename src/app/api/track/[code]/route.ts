import { NextResponse } from "next/server";
import { db, toView } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const norm = decodeURIComponent(code).trim().toUpperCase();
  const f = db().feedback.find((x) => x.trackingCode && x.trackingCode === norm);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toView(f, null, { viaCode: true }));
}
