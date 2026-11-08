'use client';

import { Card, KV } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { fmt, fmtInt } from '@/lib/qfc/format';
import { Radio } from 'lucide-react';

const CH_COLORS = ['#34d399', '#22d3ee', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#4ade80', '#60a5fa', '#fb923c', '#e879f9', '#2dd4bf', '#facc15', '#94a3b8', '#fca5a5'];

export function RCTab() {
  const tel = useGS(s => s.tel);
  const has = tel.rcFrames > 0 && (Date.now() - 0) >= 0; // presence decided by frames count
  const fresh = tel.rcAgeMs >= 0 && tel.rcAgeMs < 600;
  const modeFa = tel.rcMode === 1 ? 'PPM' : tel.rcMode === 2 ? 'iBUS' : tel.rcMode === 0 ? 'خاموش' : '—';

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="گیرنده رادیوکنترل (PA0)" icon={<Radio className="w-4 h-4 text-emerald-400" />} className="lg:col-span-2">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className={`rounded-lg px-3 py-1.5 font-mono text-sm border ${fresh ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
            {modeFa}
          </span>
          <KV k="فریم‌های دریافتی" v={fmtInt(tel.rcFrames)} />
          <KV k="تعداد کانال" v={fmtInt(tel.rcChCount)} />
          <KV k="عمر آخرین فریم" v={tel.rcAgeMs >= 0 ? `${fmtInt(tel.rcAgeMs)} ms` : '—'} color={fresh ? 'text-emerald-400' : 'text-amber-400'} />
        </div>

        {!has && (
          <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs text-cyan-200 leading-6">
            هنوز گیرنده‌ای وصل نیست — خودت گفتی بعداً وصلش می‌کنی. هر وقت خروجی گیرنده (PPM یا iBUS) به <b className="font-mono">PA0</b> رسید،
            این تب خودکار زنده می‌شود. فقط یادت باشد مُد درست را با فرمان <b className="font-mono">p</b> (PPM) یا <b className="font-mono">i</b> (iBUS) ست کنی.
          </div>
        )}

        <div className="space-y-2 mt-4">
          {(tel.ch.length ? tel.ch : Array.from({ length: 14 }, () => 0)).map((v, i) => {
            const active = v >= 800 && v <= 2200;
            const pos = active ? Math.max(0, Math.min(100, ((v - 800) / (2200 - 800)) * 100)) : 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-500 w-9">CH{i + 1}</span>
                <div className="relative flex-1 h-5 rounded bg-zinc-950 border border-zinc-800 overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                  {active && <div className="absolute inset-y-0.5 rounded-sm" style={{ width: `${pos}%`, background: `${CH_COLORS[i % 14]}33`, borderLeft: `2px solid ${CH_COLORS[i % 14]}` }} />}
                  <div className="absolute inset-y-0" style={{ left: `calc(${pos}% - 1px)`, width: 2, background: active ? CH_COLORS[i % 14] : 'transparent' }} />
                </div>
                <span className={`font-mono text-[10px] w-14 text-right ${active ? 'text-zinc-200' : 'text-zinc-600'}`}>{active ? `${fmtInt(v)}µs` : '—'}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-500 mt-2">مقیاس 800–2200 میکروثانیه؛ خط عمودی وسط = 1500 (خنثی). کانال‌های بدون پالس خاکستری‌اند.</p>
      </Card>

      <Card title="عیب‌یابی گیرنده">
        <KV k="فریم بد" v={fmtInt(tel.cnt.rcBad ?? 0)} />
        <KV k="گلیچ PPM" v={fmtInt(tel.cnt.ppmGlitch ?? 0)} color={(tel.cnt.ppmGlitch ?? 0) > 0 ? 'text-amber-400' : undefined} />
        <KV k="iBUS خطا/چک‌سام/ریزش" v={`${fmtInt(tel.cnt.ibusErr ?? 0)}/${fmtInt(tel.cnt.ibusCrc ?? 0)}/${fmtInt(tel.cnt.ibusDrop ?? 0)}`} />
        <div className="mt-3 text-[11px] text-zinc-400 leading-6 space-y-2">
          <p><b className="text-zinc-200">سیم‌بندی PPM:</b> خروجی تک‌سیمهٔ گیرنده ← PA0، GND مشترک، تغذیه 5V/3.3V طبق گیرنده. (پین PA0 از 5V هم نمی‌سوزد ولی 3.3V منطقی‌تر است.)</p>
          <p><b className="text-zinc-200">اگر کانالی ثابت 1500 ماند:</b> یعنی همان کانال از گیرنده نمی‌آید — کانال‌بندی فرستنده یا پیکربندی خروجی گیرنده را چک کن.</p>
          <p><b className="text-zinc-200">گلیچ زیاد:</b> سیم بلند/تلوپله، GND مشترک ضعیف، یا تداخل — سیم را کوتاه کن و در کنار سیم‌های موتور نگذار.</p>
        </div>
      </Card>
    </div>
  );
}
