'use client';

import { useState } from 'react';
import { Card, SEV_STYLE } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { timeStr } from '@/lib/qfc/format';
import { BellRing, Trash2 } from 'lucide-react';

const FILTERS = [
  { key: 'all', fa: 'همه' },
  { key: 'crit', fa: 'بحرانی' },
  { key: 'err', fa: 'خطا' },
  { key: 'warn', fa: 'هشدار' },
  { key: 'ok', fa: 'موفق' },
  { key: 'info', fa: 'اطلاع' },
] as const;

export function EventsTab() {
  const events = useGS(s => s.events);
  const clearEvents = useGS(s => s.clearEvents);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const shown = events.filter(e => filter === 'all' || e.sev === filter);
  const counts = {
    crit: events.filter(e => e.sev === 'crit').length,
    err: events.filter(e => e.sev === 'err').length,
    warn: events.filter(e => e.sev === 'warn').length,
  };

  return (
    <div className="grid gap-4">
      <Card title="رویدادها و خطاهای هوشمند (فارسی)" icon={<BellRing className="w-4 h-4 text-emerald-400" />}
        actions={
          <button onClick={clearEvents} className="text-[11px] text-zinc-400 hover:text-rose-400 flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> پاک‌کردن
          </button>
        }>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTERS.map(f => {
            const n = f.key === 'all' ? events.length : events.filter(e => e.sev === f.key).length;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${filter === f.key ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'}`}>
                {f.fa} ({n})
              </button>
            );
          })}
          <div className="flex-1" />
          {counts.crit > 0 && <span className="text-[11px] text-rose-400">{counts.crit} بحرانی</span>}
          {counts.err > 0 && <span className="text-[11px] text-orange-400">{counts.err} خطا</span>}
          {counts.warn > 0 && <span className="text-[11px] text-amber-400">{counts.warn} هشدار</span>}
        </div>

        <div className="space-y-2 max-h-[540px] overflow-y-auto pl-1">
          {shown.length === 0 && <div className="text-xs text-zinc-500 py-6 text-center">موردی در این دسته نیست.</div>}
          {shown.slice().reverse().map(e => {
            const st = SEV_STYLE[e.sev];
            return (
              <div key={e.id} className={`rounded-lg border p-3 ${st.chip}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">
                    {e.title} {e.count > 1 && <span className="opacity-70">×{e.count}</span>}
                  </div>
                  <span className="font-mono text-[10px] opacity-70">{timeStr(e.t)}</span>
                </div>
                {e.detail && <div className="text-[11px] mt-1 text-zinc-300">{e.detail}</div>}
                {e.action && (
                  <div className="text-[11px] mt-1.5 rounded bg-zinc-950/40 px-2 py-1 text-amber-200">
                    پیشنهاد: {e.action}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
