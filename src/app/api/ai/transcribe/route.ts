import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { transcribe } from "@/lib/ai";

const MAX_BYTES = 24 * 1024 * 1024; // OpenAI accepts up to 25 MB per file

// Extension must match the container, otherwise the transcription API rejects the file.
function extFor(type: string) {
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

/** Voice input for any browser: the client records audio with MediaRecorder, the server turns it into text. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!allow(`ai:${user.id}`)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size < 500) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });
  const lang = form?.get("lang") === "kk" ? "kk" : "ru";
  const type = audio.type || "audio/webm";
  const text = await transcribe(audio, `speech.${extFor(type)}`, lang);
  if (text === null) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ text });
}
