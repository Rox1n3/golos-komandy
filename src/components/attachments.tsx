"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet,
  FileText, FileVideo, Paperclip, Presentation, Upload, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "./providers";
import { Card } from "./ui/primitives";
import { MAX_FILES, MAX_FILE_MB, type Attachment, type FeedbackView } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------- helpers */

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase().slice(0, 5) : "");

const KINDS: { test: RegExp; icon: LucideIcon; tone: string }[] = [
  { test: /^(png|jpe?g|gif|webp|avif|bmp|heic|svg|tiff?)$/, icon: FileImage, tone: "#7c4ddb" },
  { test: /^pdf$/, icon: FileText, tone: "#d92b21" },
  { test: /^(xlsx?|csv|ods|numbers)$/, icon: FileSpreadsheet, tone: "#12805c" },
  { test: /^(docx?|odt|rtf|txt|md|pages)$/, icon: FileText, tone: "#1f6fd1" },
  { test: /^(pptx?|odp|key)$/, icon: Presentation, tone: "#c2570c" },
  { test: /^(mp4|mov|avi|mkv|webm|m4v)$/, icon: FileVideo, tone: "#0e7490" },
  { test: /^(mp3|wav|ogg|m4a|aac|flac|opus)$/, icon: FileAudio, tone: "#a21caf" },
  { test: /^(zip|rar|7z|tar|gz|bz2)$/, icon: FileArchive, tone: "#8a5a00" },
  { test: /^(dwg|dxf|ifc|rvt|step|stp|skp)$/, icon: FileCode, tone: "#334155" },
  { test: /^(json|xml|js|ts|py|sql|html|css|yml|yaml|log)$/, icon: FileCode, tone: "#475569" },
];

export function fileKind(name: string) {
  const e = ext(name);
  return KINDS.find((k) => k.test.test(e)) ?? { icon: File, tone: "#6b6b6b" };
}

export const isImage = (type: string, name = "") => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(type) || /^(png|jpe?g|gif|webp|avif)$/.test(ext(name));

export function formatSize(bytes: number, locale: string) {
  const [kb, mb] = locale === "kk" ? ["КБ", "МБ"] : ["КБ", "МБ"];
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${kb}`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} ${mb}`;
}

const fileUrl = (a: Attachment, download = false) => `/api/files/${a.id}${download ? "?download=1" : ""}`;

/** Upload with progress (fetch has no upload progress, XHR does). */
export function uploadFiles(feedbackId: string, files: File[], code: string | undefined, onProgress?: (p: number) => void) {
  return new Promise<FeedbackView>((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f, f.name));
    if (code) form.append("code", code);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/feedback/${feedbackId}/attachments`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}

/** Validates new files against the size/count limits and reports problems as toasts. */
function useFilePicker(existing: number, onAccept: (files: File[]) => void) {
  const { t } = useI18n();
  return (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const ok = files.filter((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(t("files.tooBig", { name: f.name, mb: MAX_FILE_MB }));
        return false;
      }
      return true;
    });
    const room = MAX_FILES - existing;
    if (ok.length > room) toast.error(t("files.tooMany", { n: MAX_FILES }));
    if (room > 0 && ok.length) onAccept(ok.slice(0, room));
  };
}

/* ----------------------------------------------------------------------------- tile */

function FileTile({
  name, size, preview, href, onRemove, onOpen, progress,
}: {
  name: string;
  size: number;
  preview?: string;
  href?: string;
  onRemove?: () => void;
  onOpen?: () => void;
  progress?: number;
}) {
  const { d, locale } = useI18n();
  const [broken, setBroken] = useState(false);
  const kind = fileKind(name);
  const Icon = kind.icon;
  const e = ext(name);
  const body = (
    <>
      <span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden border-b border-line bg-surface-2">
        {preview && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" onError={() => setBroken(true)} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex flex-col items-center gap-1.5">
            <Icon className="size-8" strokeWidth={1.5} style={{ color: kind.tone }} />
            {e && (
              <span className="rounded-[3px] px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: kind.tone }}>
                {e}
              </span>
            )}
          </span>
        )}
        {progress !== undefined && progress < 1 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
            <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="block px-2.5 py-2 text-left">
        <span className="block truncate text-[13px] font-medium" title={name}>{name}</span>
        <span className="block text-[11px] tabular-nums text-muted">{formatSize(size, locale)}</span>
      </span>
    </>
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.18 }}
      className="group relative overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-ink/30"
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="block w-full">{body}</button>
      ) : href ? (
        <a href={href} target="_blank" rel="noreferrer" className="block">{body}</a>
      ) : (
        <div>{body}</div>
      )}
      <span className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {href && (
          <a href={href.includes("?") ? href : `${href}?download=1`} download className="grid size-7 place-items-center rounded-full bg-black/70 text-white hover:bg-black" aria-label={d.files.download} title={d.files.download}>
            <Download className="size-3.5" />
          </a>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded-full bg-black/70 text-white hover:bg-accent" aria-label={d.files.remove} title={d.files.remove}>
            <X className="size-3.5" />
          </button>
        )}
      </span>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------- drop zone */

function DropZone({ onFiles, compact, disabled }: { onFiles: (f: FileList | File[] | null) => void; compact?: boolean; disabled?: boolean }) {
  const { d, t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex items-center gap-4 rounded-md border border-dashed px-4 transition-colors",
        compact ? "py-3" : "py-5",
        over ? "border-accent bg-accent-soft/60" : "border-line bg-surface-2/50 hover:border-ink/30",
        disabled && "opacity-60",
      )}
    >
      <span className={cn("grid shrink-0 place-items-center rounded-full border border-line bg-surface transition-transform", compact ? "size-9" : "size-11", over && "scale-110 border-accent text-accent")}>
        <Upload className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 text-sm">
        <span className="block">
          {d.files.drop}{" "}
          <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="font-semibold text-accent underline-offset-2 hover:underline">
            {d.files.browse}
          </button>
        </span>
        {!compact && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t("files.hint", { n: MAX_FILES, mb: MAX_FILE_MB })}</span>}
      </span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Screenshots pasted with Ctrl+V anywhere on the page become attachments (the most common way to show a bug). */
function usePasteFiles(onFiles: (f: File[]) => void, enabled = true) {
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      cb.current(files.map((f, i) => (f.name && f.name !== "image.png" ? f : new window.File([f], `screenshot-${stamp}${i ? `-${i}` : ""}.png`, { type: f.type }))));
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  }, [enabled]);
}

/* ----------------------------------------------------------------------------- submit form picker */

/** File picker for the new-ticket form: files stay local until the ticket is created. */
export function FilePicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const { d } = useI18n();
  const accept = useFilePicker(files.length, (add) => onChange([...files, ...add]));
  usePasteFiles(accept);
  const previews = useMemo(() => files.map((f) => (isImage(f.type, f.name) ? URL.createObjectURL(f) : undefined)), [files]);
  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <Paperclip className="size-4 text-muted" /> {d.files.title}
        {files.length > 0 && <span className="text-xs font-normal text-muted tabular-nums">{files.length}/{MAX_FILES}</span>}
      </p>
      <DropZone onFiles={accept} compact={files.length > 0} disabled={files.length >= MAX_FILES} />
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <FileTile key={`${f.name}-${f.size}-${f.lastModified}`} name={f.name} size={f.size} preview={previews[i]} onRemove={() => onChange(files.filter((_, k) => k !== i))} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------- ticket attachments */

/** Attachments card on the ticket page: gallery for images, tiles for everything else, upload for the author and reviewers. */
export function TicketFiles({ f, setF, code, canEdit }: { f: FeedbackView; setF: (f: FeedbackView) => void; code?: string; canEdit: boolean }) {
  const { d } = useI18n();
  const list = f.attachments ?? [];
  const [busy, setBusy] = useState<number | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const images = list.filter((a) => isImage(a.type, a.name));

  const send = useFilePicker(list.length, async (files) => {
    setBusy(0);
    try {
      setF(await uploadFiles(f.id, files, code, setBusy));
      toast.success(d.files.uploaded);
    } catch {
      toast.error(d.files.failed);
    } finally {
      setBusy(null);
    }
  });
  usePasteFiles(send, canEdit);

  const remove = async (a: Attachment) => {
    try {
      const q = new URLSearchParams({ file: a.id, ...(code ? { code } : {}) });
      const r = await fetch(`/api/feedback/${f.id}/attachments?${q}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setF(await r.json());
      toast.success(d.files.removed);
    } catch {
      toast.error(d.common.error);
    }
  };

  if (!list.length && !canEdit) return null;

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Paperclip className="size-4" /> {d.files.title}
        <span className="text-sm font-normal text-muted">{list.length}</span>
      </h2>
      {list.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {list.map((a) => {
              const img = isImage(a.type, a.name);
              return (
                <FileTile
                  key={a.id}
                  name={a.name}
                  size={a.size}
                  preview={img ? fileUrl(a) : undefined}
                  href={fileUrl(a)}
                  onOpen={img ? () => setViewer(images.indexOf(a)) : undefined}
                  onRemove={canEdit ? () => remove(a) : undefined}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}
      {canEdit && list.length < MAX_FILES && (
        <div className="mt-4">
          {busy !== null ? (
            <div className="rounded-md border border-line px-4 py-3 text-sm">
              <p className="flex justify-between">
                {d.files.uploading} <span className="tabular-nums text-muted">{Math.round(busy * 100)}%</span>
              </p>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(busy * 100)}%` }} />
              </span>
            </div>
          ) : (
            <DropZone onFiles={send} compact={list.length > 0} />
          )}
        </div>
      )}
      <Lightbox images={images} index={viewer} onIndex={setViewer} />
    </Card>
  );
}

function Lightbox({ images, index, onIndex }: { images: Attachment[]; index: number | null; onIndex: (i: number | null) => void }) {
  const { d, locale } = useI18n();
  const a = index !== null ? images[index] : null;
  useEffect(() => {
    if (index === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, images.length, onIndex]);
  return (
    <AnimatePresence>
      {a && index !== null && (
        <motion.div className="fixed inset-0 z-[60] flex flex-col bg-black/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <span className="min-w-0 flex-1 truncate text-sm">
              {a.name} <span className="text-white/50">· {formatSize(a.size, locale)} · {index + 1}/{images.length}</span>
            </span>
            <a href={fileUrl(a)} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-md hover:bg-white/10" aria-label={d.files.open} title={d.files.open}>
              <ExternalLink className="size-4" />
            </a>
            <a href={fileUrl(a, true)} download className="grid size-9 place-items-center rounded-md hover:bg-white/10" aria-label={d.files.download} title={d.files.download}>
              <Download className="size-4" />
            </a>
            <button onClick={() => onIndex(null)} className="grid size-9 place-items-center rounded-md hover:bg-white/10" aria-label={d.common.close}>
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={() => onIndex(null)}>
            <motion.img
              key={a.id}
              src={fileUrl(a)}
              alt={a.name}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            {images.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length); }} className="absolute left-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="prev">
                  <ChevronLeft className="size-5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % images.length); }} className="absolute right-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="next">
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

