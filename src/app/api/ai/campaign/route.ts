import { NextResponse } from "next/server";
import { COMPANY, asNumber, asText, json, langName, type Locale } from "@/lib/ai";
import { db, mutate, ticketCode } from "@/lib/db";
import { canReview, currentUser } from "@/lib/session";
import type { CampaignSummary } from "@/lib/types";

/** Groups the campaign's ideas into themes and picks the strongest ones, so the jury does not read 80 ideas one by one. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!canReview(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, locale = "ru", refresh } = await req.json();
  const d = db();
  const c = d.campaigns.find((x) => x.id === id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.aiSummary && c.aiSummary.locale === locale && !refresh) return NextResponse.json(c.aiSummary);
  const ideas = d.feedback.filter((f) => f.campaignId === id && !f.mergedInto);
  const text = ideas.map((f) => `${ticketCode(f.number)} (votes ${f.votes.length}, status ${f.status}) ${f.title}\n${f.body.slice(0, 600)}`).join("\n\n");

  const r = await json<Omit<CampaignSummary, "locale" | "at" | "source">>(
    `${COMPANY}
You help the jury of an internal idea campaign. Campaign question: "${c.question}".
Group the ideas into 2-4 themes, pick up to 3 strongest ideas (impact on the campaign goal, feasibility, support) with one-sentence reasons, and suggest one next step for management.
Answer in ${langName(locale as Locale)}. Ideas are referenced by codes like A-004; in JSON use the number part only (A-004 → 4). Return JSON {"themes":[{"title":"...","ideas":[numbers]}],"top":[{"number":n,"why":"..."}],"next":"..."}.`,
    text || "(no ideas yet)",
  );
  const summary: CampaignSummary = r?.themes
    ? {
        // Normalise the model output: numbers may come as "A-004", texts as objects.
        themes: (Array.isArray(r.themes) ? r.themes : []).slice(0, 4).map((t) => ({
          title: asText(t?.title),
          ideas: (Array.isArray(t?.ideas) ? t.ideas : []).map(asNumber).filter((n): n is number => n !== null),
        })),
        top: (Array.isArray(r.top) ? r.top : [])
          .slice(0, 3)
          .map((x) => ({ number: asNumber(x?.number), why: asText(x?.why) }))
          .filter((x): x is { number: number; why: string } => x.number !== null),
        next: asText(r.next),
        locale,
        at: new Date().toISOString(),
        source: "openai",
      }
    : {
        themes: [],
        top: ideas.slice().sort((a, b) => b.votes.length - a.votes.length).slice(0, 3).map((f) => ({ number: f.number, why: locale === "kk" ? `${f.votes.length} дауыс` : `${f.votes.length} голосов поддержки` })),
        next: "",
        locale,
        at: new Date().toISOString(),
        source: "local",
      };
  mutate((dd) => {
    const cc = dd.campaigns.find((x) => x.id === id);
    if (cc) cc.aiSummary = summary;
  });
  return NextResponse.json(summary);
}
