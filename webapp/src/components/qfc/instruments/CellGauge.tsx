'use client';

import type { BatteryInfo } from '@/lib/qfc/battery';

const COLORS: Record<BatteryInfo['state'], string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-400',
  crit: 'bg-rose-500 animate-pulse',
  unknown: 'bg-zinc-600',
};
const TEXT: Record<BatteryInfo['state'], string> = {
  ok: 'text-emerald-400', warn: 'text-amber-400', crit: 'text-rose-400', unknown: 'text-zinc-400',
};

export function CellGauge({ bat, compact = false }: { bat: BatteryInfo; compact?: boolean }) {
  const pct = bat.percent ?? 0;
  const nCells = bat.cells ?? 0;
  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-2xl font-bold ${TEXT[bat.state]}`}>
            {bat.percent !== null ? `${bat.percent}%` : '—'}
          </span>
          <span className={`text-sm font-semibold px-1.5 rounded ${TEXT[bat.state]} bg-zinc-800/80`}>{bat.label}</span>
        </div>
        <div className="text-xs text-zinc-400">{bat.stateFa}</div>
      </div>
      {/* battery body */}
      <div className="relative h-6 w-full rounded-md border-2 border-zinc-600 bg-zinc-900 overflow-hidden">
        <div className={`h-full transition-all duration-500 ${COLORS[bat.state]}`} style={{ width: `${bat.percent !== null ? Math.max(2, pct) : 0}%` }} />
        {/* cell separators */}
        {nCells > 1 && (
          <div className="absolute inset-0 flex">
            {Array.from({ length: nCells }).map((_, i) => (
              <div key={i} className="flex-1 border-l border-zinc-950/70 first:border-l-0" />
            ))}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[11px] text-zinc-100 drop-shadow">
            {bat.cells && bat.perCell !== null ? `${(nCells * bat.perCell).toFixed(2)}V` : '—'}
          </span>
        </div>
      </div>
      {!compact && (
        <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
          <span>هر سل: {bat.perCell !== null ? `${bat.perCell.toFixed(3)}V` : '—'}</span>
          <span>{nCells ? `${nCells} سلول تشخیص داده شد` : 'تعداد سل تشخیص داده نشد'}</span>
        </div>
      )}
    </div>
  );
}
