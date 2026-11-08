'use client';

import dynamic from 'next/dynamic';
import { Card, KV } from '../ui-helpers';
import { Horizon } from '../instruments/Horizon';
import { Chart } from '../instruments/Chart';
import { useGS } from '@/lib/qfc/store';
import { fmt } from '@/lib/qfc/format';
import { Box } from 'lucide-react';

const Quad3D = dynamic(() => import('../Quad3D').then(m => m.Quad3D), {
  ssr: false,
  loading: () => <div className="w-full h-[380px] rounded-lg border border-zinc-800 bg-zinc-950 animate-pulse" />,
});

export function Attitude3DTab() {
  const att = useGS(s => s.att);
  const hist = useGS(s => s.hist);
  const conn = useGS(s => s.conn);
  const tel = useGS(s => s.tel);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="مدل سه‌بعدی کواد" icon={<Box className="w-4 h-4 text-emerald-400" />} className="lg:col-span-2">
        <Quad3D />
        <p className="text-[11px] text-zinc-500 mt-2 leading-5">
          بینی قرمز = جلوی کواد. با ماوس بچرخان/زوم کن. دَم ملخ‌ها با آمدن داده سرعت می‌گیرد.
          رول/پیچ از شتاب‌سنج، یاو از مگنتومتر (جبران‌شده با رول/پیچ) می‌آید.
        </p>
      </Card>

      <div className="space-y-4">
        <Card title="افق مصنوعی">
          <div className="flex justify-center">
            <Horizon roll={att.roll} pitch={att.pitch} size={200} />
          </div>
        </Card>
        <Card title="زاویه‌ها">
          <KV k="رول (Roll)" v={`${fmt(att.roll)}°`} />
          <KV k="پیچ (Pitch)" v={`${fmt(att.pitch)}°`} />
          <KV k="یاو (Yaw / Heading)" v={att.yaw !== null ? `${fmt(att.yaw)}°` : '—'} />
          <KV k="وضعیت داده" v={Date.now() - conn.lastRxAt < 2500 ? 'زنده' : 'قطع'} color={Date.now() - conn.lastRxAt < 2500 ? 'text-emerald-400' : 'text-amber-400'} />
          {tel.last && <KV k="نمونه‌های MPU در پنجره" v={String(tel.last.mpu_samples)} />}
        </Card>
      </div>

      <Card title="ژیروسکوپ (خام)" className="lg:col-span-2">
        <Chart
          series={[
            { name: 'gx', color: '#f87171', values: hist.gyr.map(p => p.x) },
            { name: 'gy', color: '#34d399', values: hist.gyr.map(p => p.y) },
            { name: 'gz', color: '#22d3ee', values: hist.gyr.map(p => p.z) },
          ]}
          height={130}
        />
        <p className="text-[10px] text-zinc-500 mt-1">واحد: شمارندهٔ خام — با پیکربندی پیش‌فرض ±250°/s، 131 شمارنده = 1 درجه بر ثانیه.</p>
      </Card>
      <Card title="شتاب‌سنج (خام)">
        <Chart
          series={[
            { name: 'ax', color: '#f87171', values: hist.acc.map(p => p.x) },
            { name: 'ay', color: '#34d399', values: hist.acc.map(p => p.y) },
            { name: 'az', color: '#22d3ee', values: hist.acc.map(p => p.z) },
          ]}
          height={130}
        />
        <p className="text-[10px] text-zinc-500 mt-1">واحد: شمارندهٔ خام — ±2g، 16384 شمارنده = 1g.</p>
      </Card>
    </div>
  );
}
