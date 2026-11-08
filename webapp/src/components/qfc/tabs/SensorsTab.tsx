'use client';

import { useState } from 'react';
import { Card, KV } from '../ui-helpers';
import { Chart } from '../instruments/Chart';
import { Compass } from '../instruments/Compass';
import { useGS } from '@/lib/qfc/store';
import { fmt, fmtInt } from '@/lib/qfc/format';
import { Microchip, Magnet, CloudSun } from 'lucide-react';
import type { Calib } from '@/lib/qfc/store';

export function SensorsTab() {
  const tel = useGS(s => s.tel);
  const hist = useGS(s => s.hist);
  const att = useGS(s => s.att);
  const cal = useGS(s => s.cal);
  const [showAll, setShowAll] = useState(false);

  const g = (v: number) => v / 16384;
  const dps = (v: number) => v / 131;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="شتاب‌سنج MPU6050" icon={<Microchip className="w-4 h-4 text-emerald-400" />}>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <AxisBox label="ax" raw={tel.ax} conv={`${fmt(g(tel.ax), 3)} g`} />
          <AxisBox label="ay" raw={tel.ay} conv={`${fmt(g(tel.ay), 3)} g`} />
          <AxisBox label="az" raw={tel.az} conv={`${fmt(g(tel.az), 3)} g`} />
        </div>
        <Chart
          series={[
            { name: 'ax', color: '#f87171', values: hist.acc.map(p => p.x) },
            { name: 'ay', color: '#34d399', values: hist.acc.map(p => p.y) },
            { name: 'az', color: '#22d3ee', values: hist.acc.map(p => p.z) },
          ]}
          height={110}
        />
        {cal.accBias && (
          <p className="text-[11px] text-zinc-400 mt-2">
            با آفست ذخیره‌شده: ax={fmt(tel.ax - cal.accBias.x)} · ay={fmt(tel.ay - cal.accBias.y)} · az={fmt(tel.az - cal.accBias.z)}
            {cal.accScale && ` (با مقیاس: ${fmt((tel.ax - cal.accBias.x) * cal.accScale.x, 4)} g و …)`}
          </p>
        )}
        <p className="text-[10px] text-zinc-500 mt-1">پیکربندی فریمور: ±2g → 16384 شمارنده = 1g · دمای MPU: {fmt(tel.mpuTempC)} °C</p>
      </Card>

      <Card title="ژیروسکوپ MPU6050" icon={<Microchip className="w-4 h-4 text-emerald-400" />}>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <AxisBox label="gx" raw={tel.gx} conv={`${fmt(dps(tel.gx), 1)} °/s`} />
          <AxisBox label="gy" raw={tel.gy} conv={`${fmt(dps(tel.gy), 1)} °/s`} />
          <AxisBox label="gz" raw={tel.gz} conv={`${fmt(dps(tel.gz), 1)} °/s`} />
        </div>
        <Chart
          series={[
            { name: 'gx', color: '#f87171', values: hist.gyr.map(p => p.x) },
            { name: 'gy', color: '#34d399', values: hist.gyr.map(p => p.y) },
            { name: 'gz', color: '#22d3ee', values: hist.gyr.map(p => p.z) },
          ]}
          height={110}
        />
        {cal.gyro && (
          <p className="text-[11px] text-zinc-400 mt-2">
            با بایاس ذخیره‌شده: gx={fmt(tel.gx - cal.gyro.x, 1)} · gy={fmt(tel.gy - cal.gyro.y, 1)} · gz={fmt(tel.gz - cal.gyro.z, 1)} (خام)
          </p>
        )}
        <p className="text-[10px] text-zinc-500 mt-1">±250°/s → 131 شمارنده = 1°/s (پیکربندی پیش‌فرض MPU)</p>
      </Card>

      <Card title="مگنتومتر HMC5883L — قطب‌نما" icon={<Magnet className="w-4 h-4 text-emerald-400" />}>
        <div className="flex flex-wrap items-center justify-around gap-3">
          <Compass heading={att.yaw} size={180} sub="جبران رول/پیچ" />
          <div className="grid grid-cols-3 gap-2">
            <AxisBox label="mx" raw={tel.mx} />
            <AxisBox label="my" raw={tel.my} />
            <AxisBox label="mz" raw={tel.mz} />
          </div>
        </div>
        <div className="mt-3">
          <Chart
            series={[
              { name: 'mx', color: '#f87171', values: hist.mg.map(p => p.x) },
              { name: 'my', color: '#34d399', values: hist.mg.map(p => p.y) },
              { name: 'mz', color: '#22d3ee', values: hist.mg.map(p => p.z) },
            ]}
            height={100}
          />
        </div>
        {cal.magBias && (
          <p className="text-[11px] text-zinc-400 mt-2">
            با آفست ذخیره‌شده: mx={fmt(tel.mx - cal.magBias.x)} · my={fmt(tel.my - cal.magBias.y)} · mz={fmt(tel.mz - cal.magBias.z)}
          </p>
        )}
        <p className="text-[10px] text-zinc-500 mt-1">شمارندهٔ خام HMC — گین پیش‌فرض 1090 LSB/Gauss. برای شمال درست، کالیبراسیون تب «کالیبراسیون» را انجام بده.</p>
      </Card>

      <Card title="بارومتر MS5611" icon={<CloudSun className="w-4 h-4 text-emerald-400" />}>
        <KV k="فشار" v={`${fmtInt(tel.pPa)} Pa (${fmt(tel.pPa / 100, 2)} hPa)`} />
        <KV k="دما" v={`${fmt(tel.baroTempC)} °C`} />
        <KV k="ارتفاع محاسبه‌شده" v={isFinite(tel.altBaroM) ? `${fmt(tel.altBaroM)} m` : '—'} />
        <KV k="D1 (فشار خام)" v={fmtInt(tel.last?.baro_d1)} />
        <KV k="D2 (دما خام)" v={fmtInt(tel.last?.baro_d2)} />
        <KV k="نمونه‌ها در پنجره" v={fmtInt(tel.last?.baro_samples)} />
        <div className="mt-3">
          <Chart
            title="ارتفاع بارومتر (m)"
            series={[{ name: 'alt', color: '#22d3ee', values: hist.alt.map(p => p.b) }]}
            height={100} digits={1}
          />
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          فرمول استاندارد جو: h = 44330×(1−(P/P₀)^0.1903) با P₀ از تنظیمات ({fmtInt(useGS.getState().settings.p0Pa)} Pa).
        </p>
      </Card>

      <Card title="همهٔ فیلدهای آخرین فریم D" className="lg:col-span-2"
        actions={
          <button className="text-[11px] text-cyan-400 hover:underline" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'نمایش خلاصه' : 'نمایش همهٔ ۹۴ فیلد'}
          </button>
        }>
        {!tel.last && <div className="text-xs text-zinc-500">هنوز فریمی نرسیده.</div>}
        {tel.last && (
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-x-4 ${showAll ? '' : 'max-h-40 overflow-y-auto'}`}>
            {Object.entries(tel.last)
              .filter(([k]) => showAll || !k.endsWith('_min') && !k.endsWith('_max'))
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 py-0.5 border-b border-zinc-800/50">
                  <span className="text-[10px] text-zinc-500 font-mono">{k}</span>
                  <span className="text-[10px] font-mono text-zinc-200">{typeof v === 'number' ? fmtInt(v) : String(v)}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AxisBox({ label, raw, conv }: { label: string; raw: number; conv?: string }) {
  return (
    <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 p-2 text-center">
      <div className="text-[10px] text-zinc-500 font-mono">{label}</div>
      <div className="font-mono text-sm text-zinc-100">{fmtInt(raw)}</div>
      {conv && <div className="text-[10px] text-emerald-400 font-mono">{conv}</div>}
    </div>
  );
}

export type { Calib };
