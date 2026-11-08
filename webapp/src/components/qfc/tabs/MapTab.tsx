'use client';

import dynamic from 'next/dynamic';
import { Card, KV } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { fmt, latLonStr } from '@/lib/qfc/format';
import { Map as MapIcon } from 'lucide-react';

const MapView = dynamic(() => import('../MapView').then(m => m.MapView), {
  ssr: false,
  loading: () => <div className="w-full h-[420px] rounded-lg border border-zinc-800 bg-zinc-950 animate-pulse" />,
});

export function MapTab() {
  const tel = useGS(s => s.tel);
  const trail = useGS(s => s.trail);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="لوکیشن زنده روی نقشه" icon={<MapIcon className="w-4 h-4 text-emerald-400" />} className="lg:col-span-2">
        <div className="h-[440px]">
          <MapView />
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="مختصات">
          <KV k="عرض جغرافیایی" v={tel.lat !== null ? tel.lat.toFixed(7) : '—'} />
          <KV k="طول جغرافیایی" v={tel.lon !== null ? tel.lon.toFixed(7) : '—'} />
          <KV k="ارتفاع GPS" v={tel.altGpsM !== null ? `${fmt(tel.altGpsM)} m` : '—'} />
          <KV k="HDOP (کیفیت هندسی)" v={tel.hdop !== null ? fmt(tel.hdop, 2) : '—'} />
          <KV k="سرعت" v={`${fmt(tel.speedKmh)} km/h`} />
          <KV k="سمت (Course)" v={tel.courseDeg !== null ? `${fmt(tel.courseDeg)}°` : '—'} />
          <KV k="تعداد نقاط مسیر" v={fmtInt0(trail.length)} />
        </Card>
        <Card title="راهنما">
          <ul className="text-xs text-zinc-400 leading-6 list-disc pr-4 space-y-1">
            <li>فلش سبز = موقعیت و سمت کواد؛ دایرهٔ کم‌رنگ = عدم‌قطعیت (~HDOP×3.5m).</li>
            <li>خط سبز = مسیر طی‌شده (تا ۱۲۰۰ نقطه).</li>
            <li>دکمهٔ «دنبال‌کردن» بالا-چپ نقشه برای قفل روی کواد.</li>
            <li>نقشه به اینترنت (کاشی OpenStreetMap) نیاز دارد.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function fmtInt0(n: number): string {
  return n.toLocaleString('en-US');
}
