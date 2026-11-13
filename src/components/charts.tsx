"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------- helpers */

/** Container width, so the SVG is drawn at real pixel size and text never stretches. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Rounded axis maximum with at most ~5 ticks (1, 2, 5 × 10ⁿ steps). */
function niceScale(max: number) {
  const raw = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/**
 * Smooth monotone curve (Fritsch–Carlson, like d3.curveMonotoneX):
 * it never overshoots the data, so a flat week stays flat and nothing dips below zero.
 */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const slope = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const m = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/* ----------------------------------------------------------------------------- line chart */

export type LineSeries = { key: string; label: string; values: number[]; style: "solid" | "dashed" };

/**
 * Two-series trend chart: the solid series gets an area fill, the dashed one is a reference line.
 * Hover shows a guide, dots and a tooltip for the week.
 */
export function TrendChart({ labels, series, height = 260, tooltipTitle }: { labels: string[]; series: LineSeries[]; height?: number; tooltipTitle?: (i: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 40, r: 16, t: 14, b: 34 };
  const W = Math.max(width, 280);
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const { top, ticks } = useMemo(() => niceScale(Math.max(...series.flatMap((s) => s.values))), [series]);
  const n = labels.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
    const line = smoothPath(pts);
    return { ...s, pts, line, area: `${line} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z` };
  });
  const gid = useMemo(() => `area-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div ref={ref} className="relative select-none">
      {width > 0 && (
        <svg
          width={W}
          height={H}
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            const i = Math.round(((px - pad.l) / iw) * (n - 1));
            setHover(i >= 0 && i < n ? i : null);
          }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grid + y labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 5"} />
              <text x={pad.l - 12} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">{t}</text>
            </g>
          ))}
          {/* x labels */}
          {labels.map((l, i) => (
            <text key={l + i} x={x(i)} y={H - 10} textAnchor="middle" className={cn("fill-[var(--muted)] text-[11px]", hover === i && "fill-[var(--ink)] font-semibold")}>
              {l}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted)" strokeOpacity="0.5" />}
          {paths.map((p) =>
            p.style === "solid" ? (
              <g key={p.key}>
                <motion.path d={p.area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} />
                <motion.path d={p.line} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
              </g>
            ) : (
              <motion.path key={p.key} d={p.line} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 6" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
            ),
          )}
          {hover !== null &&
            paths.map((p) => (
              <circle key={p.key} cx={p.pts[hover][0]} cy={p.pts[hover][1]} r={4.5} fill="var(--surface)" stroke={p.style === "solid" ? "var(--ink)" : "var(--muted)"} strokeWidth={2} />
            ))}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-max rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), W - 150) }}
        >
          <p className="font-medium">{tooltipTitle ? tooltipTitle(hover) : labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-muted">
              <Swatch style={s.style} /> {s.label}: <span className="font-semibold text-ink tabular-nums">{s.values[hover]}</span>
            </p>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-center gap-5 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <Swatch style={s.style} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Swatch({ style }: { style: LineSeries["style"] }) {
  return style === "solid" ? (
    <span className="inline-block h-[3px] w-4 rounded-full bg-ink" />
  ) : (
    <span className="inline-block w-4 border-t-2 border-dashed border-muted" />
  );
}

/* ----------------------------------------------------------------------------- donut */

const DONUT_COLORS = ["var(--accent)", "#1f6fd1", "#12805c", "#b46a00", "#7c4ddb", "#0e7490", "#db2777", "#64748d", "#a16207"];

/** Donut with a total in the middle and a legend with value and share. */
export function Donut({ rows, centerLabel, size = 210 }: { rows: { label: string; value: number }[]; centerLabel: string; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const stroke = 30;
  const r = (size - stroke) / 2 - 4;
  const C = 2 * Math.PI * r;
  const gap = rows.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = rows.map((row, i) => {
    const len = total ? (row.value / total) * C : 0;
    const seg = { ...row, i, color: DONUT_COLORS[i % DONUT_COLORS.length], dash: Math.max(0, len - gap), offset: -acc };
    acc += len;
    return seg;
  });
  const active = hover !== null ? segs[hover] : null;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
          {segs.map((s) => (
            <motion.circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.i ? stroke + 6 : stroke}
              strokeDashoffset={s.offset}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${s.dash} ${C}`, opacity: hover === null || hover === s.i ? 1 : 0.35 }}
              transition={{ duration: 0.9, delay: s.i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-[stroke-width]"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-4xl font-bold tabular-nums leading-none">{active ? active.value : total}</p>
            <p className="mt-1.5 max-w-[7.5rem] text-xs leading-tight text-muted">{active ? active.label : centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {segs.map((s) => (
          <li
            key={s.label}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            className={cn("flex items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors", hover === s.i && "bg-surface-2")}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
