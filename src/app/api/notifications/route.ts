import { NextResponse } from "next/server";
import { db, mutate, sweepEscalations, ticketCode } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  sweepEscalations();
  const d = db();
  const list = d.notifications
    .filter((n) => n.userId === user.id)
    .slice(0, 20)
    .map((n) => {
      const f = d.feedback.find((x) => x.id === n.feedbackId);
      return { ...n, title: f?.title ?? "", number: f?.number, code: f ? ticketCode(f.number) : undefined };
    });
  return NextResponse.json(list);
}

export async function POST() {
  const user = await currentUser();
  mutate((d) => d.notifications.forEach((n) => { if (n.userId === user.id) n.read = true; }));
  return NextResponse.json({ ok: true });
}
