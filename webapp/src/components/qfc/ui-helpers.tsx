'use client';

import type { ReactNode } from 'react';

export function Card({ title, icon, children, className = '', actions }: {
  title?: string; icon?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ${className}`} aria-label={title}>
      {(title || actions) && (
        <header className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            {icon}{title}
          </h3>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function KV({ k, v, mono = true, color }: { k: string; v: ReactNode; mono?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-xs text-zinc-400">{k}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''} ${color ?? 'text-zinc-100'}`}>{v}</span>
    </div>
  );
}

export function Dot({ ok, warn, label }: { ok?: boolean; warn?: boolean; label: string }) {
  const color = ok === undefined && warn === undefined ? 'bg-zinc-600'
    : ok ? 'bg-emerald-500' : warn ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color} ${!ok && !warn && (ok !== undefined || warn !== undefined) ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-zinc-300">{label}</span>
    </span>
  );
}

export function Stale({ lastRxAt, children }: { lastRxAt: number; children: ReactNode }) {
  const stale = lastRxAt === 0 || Date.now() - lastRxAt > 3000;
  if (!stale) return <>{children}</>;
  return (
    <div className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
      جریان داده قطع است — آخرین بسته بیش از ۳ ثانیه پیش بوده.
    </div>
  );
}

export const SEV_STYLE: Record<string, { chip: string; label: string }> = {
  ok: { chip: 'bg-emerald-950/70 text-emerald-300 border-emerald-800', label: 'موفق' },
  info: { chip: 'bg-cyan-950/70 text-cyan-300 border-cyan-800', label: 'اطلاع' },
  warn: { chip: 'bg-amber-950/70 text-amber-300 border-amber-800', label: 'هشدار' },
  err: { chip: 'bg-orange-950/70 text-orange-300 border-orange-800', label: 'خطا' },
  crit: { chip: 'bg-rose-950/80 text-rose-300 border-rose-800', label: 'بحرانی' },
};
