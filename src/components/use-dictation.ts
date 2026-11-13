"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Voice input that works in every modern browser (Chrome, Edge, Firefox, Safari, Yandex Browser).
 *
 * The browser only records audio with MediaRecorder; the server transcribes it with OpenAI in the
 * interface language (Kazakh when the UI is Kazakh, Russian otherwise). Browser speech recognition is
 * used only as a last resort when MediaRecorder is missing.
 */

export type DictationMessages = {
  unsupported: string;
  denied: string;
  noMic: string;
  insecure: string;
  notHeard: string;
  unavailable: string;
  error: string;
};

const MAX_SECONDS = 120;

/** First container the browser can record: webm/opus (Chrome, Firefox, Edge), mp4 (Safari), ogg. */
function pickMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null;
};

export function useDictation(locale: string, onText: (t: string) => void, m: DictationMessages) {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const speech = useRef<SpeechRec | null>(null);
  const timers = useRef<{ tick?: number; raf?: number; ctx?: AudioContext }>({});
  // Loudest input level seen during the recording; -1 when the browser cannot measure it.
  const peakRef = useRef(-1);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const lang = locale === "kk" ? "kk" : "ru";

  const cleanup = useCallback(() => {
    window.clearInterval(timers.current.tick);
    if (timers.current.raf) cancelAnimationFrame(timers.current.raf);
    timers.current.ctx?.close().catch(() => {});
    timers.current = {};
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLevel(0);
  }, []);

  const send = useCallback(
    async (blob: Blob) => {
      if (blob.size < 1200) return toast.message(m.notHeard);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "speech");
        fd.append("lang", lang);
        const r = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
        if (r.status === 503) return toast.error(m.unavailable);
        if (!r.ok) throw new Error(String(r.status));
        const { text } = (await r.json()) as { text: string };
        if (text) onTextRef.current(text);
        else toast.message(m.notHeard);
      } catch {
        toast.error(m.error);
      } finally {
        setBusy(false);
      }
    },
    [lang, m],
  );

  /** Fallback for browsers without MediaRecorder: built-in speech recognition, if any. */
  const startSpeechApi = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return toast.error(m.unsupported);
    const r = new Ctor();
    r.lang = lang === "kk" ? "kk-KZ" : "ru-RU";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onTextRef.current(e.results[i][0].transcript.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      toast.error(e?.error === "not-allowed" ? m.denied : m.error);
    };
    speech.current = r;
    r.start();
    setListening(true);
  }, [lang, m]);

  const start = useCallback(async () => {
    if (!window.isSecureContext) return toast.error(m.insecure);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return startSpeechApi();
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      return toast.error(name === "NotAllowedError" || name === "SecurityError" ? m.denied : name === "NotFoundError" || name === "OverconstrainedError" ? m.noMic : m.error);
    }
    stream.current = s;
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      cleanup();
      return startSpeechApi();
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
      const peak = peakRef.current;
      cleanup();
      setListening(false);
      rec.current = null;
      // Silence never goes to the server: speech models "hallucinate" text on empty audio.
      if (peak >= 0 && peak < 0.04) return toast.message(m.notHeard);
      void send(blob);
    };
    rec.current = r;
    peakRef.current = -1;
    r.start(250);
    setSeconds(0);
    setListening(true);

    // Timer with an automatic stop, so a forgotten microphone does not record forever.
    const t0 = Date.now();
    timers.current.tick = window.setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setSeconds(sec);
      if (sec >= MAX_SECONDS && rec.current?.state === "recording") rec.current.stop();
    }, 250);

    // Live input level, so the user sees that the microphone actually hears them.
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          const lv = Math.min(1, peak / 64);
          peakRef.current = Math.max(peakRef.current, lv);
          setLevel(lv);
          timers.current.raf = requestAnimationFrame(loop);
        };
        timers.current.ctx = ctx;
        loop();
      }
    } catch {}
  }, [cleanup, m, send, startSpeechApi]);

  const stop = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
    speech.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (busy) return;
    if (listening) stop();
    else void start();
  }, [busy, listening, start, stop]);

  // Stop the microphone when the language changes or the component unmounts.
  useEffect(
    () => () => {
      if (rec.current?.state === "recording") {
        rec.current.onstop = null;
        rec.current.stop();
      }
      speech.current?.stop();
      cleanup();
    },
    [locale, cleanup],
  );

  return { listening, busy, seconds, level, toggle, stop };
}

export const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
