'use client';

import { Card, KV } from '../ui-helpers';
import { CellGauge } from '../instruments/CellGauge';
import { Chart } from '../instruments/Chart';
import { useGS } from '@/lib/qfc/store';
import { fmt, fmtInt } from '@/lib/qfc/format';
import { analyzeBattery } from '@/lib/qfc/battery';
import { BatteryCharging, Info } from 'lucide-react';

export function BatteryTab() {
  const tel = useGS(s => s.tel);
  const bat = useGS(s => s.bat);
  const hist = useGS(s => s.hist);

  // manual what-if: show detection result for any typed voltage
  const altV = analyzeBattery(tel.last ? tel.vbatMv : 0);

  const cellsInfo = bat.cells ? Array.from({ length: bat.cells }, (_, i) => bat.perCell!) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="باتری هوشمند" icon={<BatteryCharging className="w-4 h-4 text-emerald-400" />}>
        <CellGauge bat={bat} />
        <div className="mt-4 space-y-1">
          <KV k="ولتاژ اندازه‌گیری‌شده (pa4_source_mV)" v={`${fmtInt(tel.vbatMv)} mV`} />
          <KV k="ولتاژ هر سل" v={bat.perCell !== null ? `${fmt(bat.perCell, 3)} V` : '—'} />
          <KV k="تشخیص تعداد سل" v={bat.cells ? `${bat.cells} سل (${bat.label})` : 'نامشخص'} color={bat.cells ? 'text-emerald-400' : 'text-amber-400'} />
          <KV k="ADC خام / گره PA4" v={`${fmtInt(tel.pa4Adc)} / ${fmtInt(tel.pa4PinMv)} mV`} />
          <KV k="VDD تخمینی برد" v={`${fmtInt(tel.vddMv)} mV`} />
        </div>
        <div className="mt-4">
          <Chart title="تاریخچهٔ ولتاژ (V)" series={[{ name: 'Vbat', color: '#34d399', values: hist.bat.map(p => p.v) }]} height={110} digits={2} />
        </div>
        {cellsInfo.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-zinc-400 mb-1">وضعیت هر سل (از ولتاژ کل تخمین زده می‌شود — بالانس سل تکی اندازه‌گیری نمی‌شود)</div>
            <div className="flex gap-1.5">
              {cellsInfo.map((v, i) => (
                <div key={i} className="flex-1 rounded-md border border-zinc-800 bg-zinc-950/70 py-1.5 text-center">
                  <div className="text-[10px] text-zinc-500">سل {i + 1}</div>
                  <div className={`font-mono text-xs ${v < 3.5 ? 'text-rose-400' : v < 3.55 ? 'text-amber-400' : 'text-emerald-400'}`}>{v.toFixed(2)}V</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card title="چطور کار می‌کند؟" icon={<Info className="w-4 h-4 text-cyan-400" />}>
          <div className="text-xs text-zinc-300 leading-6 space-y-2">
            <p>
              سیم‌بندی سخت‌افزاری (طبق فریمور v7): باتری ← مقاومت <b className="font-mono">100k</b> ← گرهٔ PA4 ← مقاومت <b className="font-mono">33k</b> ← GND،
              و یک خازن 100nF از گره به GND. نسبت تقسیم 4.03:1 است؛ یعنی تا <b>4S کامل (16.8V → 4.17V روی پین)</b> امن است.
            </p>
            <p>
              تشخیص هوشمند: بازهٔ مجاز هر پیکربندی باند جدا دارد (2S: 6.6–8.56V، 3S: 9.9–12.84V، 4S: 13.2–17.1V) —
              پس مثلاً <b>11.3 ولت</b> بلافاصله یعنی <b>3S</b>. درصد هم از منحنی شارژ لیتیوم-پلیمر (غیرخطی) روی «ولتاژ هر سل» حساب می‌شود.
            </p>
            <p>
              هشدارها: زیر ۲۵٪ هشدار کهربایی و زیر ۱۰٪ بحرانی قرمز (چشمک‌زن). ولتاژ هر سل زیر 3.5V هم جدا هشدار دارد.
            </p>
          </div>
        </Card>
        <Card title="مثال زندهٔ تشخیص">
          <div className="text-xs text-zinc-400 leading-6">
            الان با ولتاژ <b className="font-mono text-zinc-100">{tel.vbatMv ? `${fmtInt(tel.vbatMv)} mV` : '—'}</b> نتیجه: {' '}
            <b className={altV.cells ? 'text-emerald-400' : 'text-amber-400'}>
              {altV.cells ? `${altV.label} — ${altV.percent}% — هر سل ${altV.perCell?.toFixed(2)}V` : altV.stateFa}
            </b>
            <br />
            (خودت گفتی باتری فعلی 2S است — اگر ولتاژ خوانده‌شده با انتظارت فرق دارد، اتصال مقسّم به باتری را چک کن.)
          </div>
        </Card>
      </div>
    </div>
  );
}
