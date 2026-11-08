'use client';

import { useEffect, useRef } from 'react';

export interface ChartSeries {
  name: string;
  color: string;
  values: number[]; // oldest -> newest; NaN allowed (gap)
}

// Lightweight live canvas chart (no deps, DPR-aware, autoscale or fixed range)
export function Chart({
  series, height = 120, min, max, unit = '', digits = 1, title,
}: {
  series: ChartSeries[];
  height?: number;
  min?: number;
  max?: number;
  unit?: string;
  digits?: number;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 320;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    let lo = min ?? Infinity;
    let hi = max ?? -Infinity;
    if (min === undefined || max === undefined) {
      for (const s of series) for (const v of s.values) {
        if (!isFinite(v)) continue;
        if (min === undefined && v < lo) lo = v;
        if (max === undefined && v > hi) hi = v;
      }
    }
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;

    // grid
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = (height - 4) * i / 3 + 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const n = Math.max(...series.map(s => s.values.length), 2);
    const x = (i: number) => (i / (n - 1)) * (w - 2) + 1;
    const y = (v: number) => height - 3 - ((v - lo) / (hi - lo)) * (height - 6);

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      s.values.forEach((v, i) => {
        if (!isFinite(v)) { started = false; return; }
        if (!started) { ctx.moveTo(x(i), y(v)); started = true; }
        else ctx.lineTo(x(i), y(v));
      });
      ctx.stroke();
    }

    // min/max labels
    ctx.fillStyle = '#71717a';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(hi.toFixed(digits), 3, 11);
    ctx.fillText(lo.toFixed(digits), 3, height - 3);
  }, [series, height, min, max, digits]);

  const latest = (vals: number[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (isFinite(vals[i])) return vals[i];
    return NaN;
  };

  return (
    <div className="w-full">
      {(title || series.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
          {title && <span className="text-xs text-zinc-400">{title}</span>}
          {series.map(s => (
            <span key={s.name} className="flex items-center gap-1 text-[11px] text-zinc-300">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name}
              <b className="font-mono text-zinc-100">{isFinite(latest(s.values)) ? latest(s.values).toFixed(digits) : '—'}{unit}</b>
            </span>
          ))}
        </div>
      )}
      <canvas ref={ref} style={{ width: '100%', height }} className="rounded-md bg-zinc-950/70 border border-zinc-800" />
    </div>
  );
}
