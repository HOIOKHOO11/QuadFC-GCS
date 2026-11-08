'use client';

import { Card, KV } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { fmt, fmtInt, latLonStr } from '@/lib/qfc/format';
import { Satellite, Signal } from 'lucide-react';

const FIX_FA = ['بدون فیکس', 'GPS', 'DGPS', 'PPS', 'RTK دقیق', 'RTK شناور', 'تخمینی'];

export function GpsTab() {
  const tel = useGS(s => s.tel);

  const fixFa = tel.gpsQuality > 0 ? (FIX_FA[tel.gpsQuality] ?? `کیفیت ${tel.gpsQuality}`) : (tel.gpsFix ? 'دارد' : 'بدون فیکس');
  const ageOk = tel.gpsAgeMs >= 0 && tel.gpsAgeMs < 2000;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="وضعیت گیرنده" icon={<Satellite className="w-4 h-4 text-emerald-400" />}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`rounded-lg px-3 py-2 font-mono text-xl ${tel.gpsFix ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900' : 'bg-rose-950/60 text-rose-400 border border-rose-900'}`}>
            {tel.gpsFix ? 'FIX' : 'NO FIX'}
          </div>
          <div>
            <div className="text-sm text-zinc-200">{fixFa}</div>
            <div className="text-[11px] text-zinc-500">ماهواره‌های استفاده‌شده: {fmtInt(tel.gpsSats)}</div>
          </div>
        </div>
        <KV k="موقعیت" v={latLonStr(tel.lat, tel.lon)} />
        <KV k="ارتفاع" v={tel.altGpsM !== null ? `${fmt(tel.altGpsM)} m` : '—'} />
        <KV k="HDOP" v={tel.hdop !== null ? fmt(tel.hdop, 2) : '—'} color={tel.hdop !== null && tel.hdop > 2.5 ? 'text-amber-400' : undefined} />
        <KV k="سرعت" v={`${fmt(tel.speedKmh)} km/h`} />
        <KV k="سمت" v={tel.courseDeg !== null ? `${fmt(tel.courseDeg)}°` : '—'} />
        <KV k="زمان UTC / تاریخ" v={`${tel.utc || '—'} / ${tel.dateStr || '—'}`} />
        <KV k="عمر داده GPS" v={tel.gpsAgeMs >= 0 ? `${fmtInt(tel.gpsAgeMs)} ms` : '—'} color={ageOk ? 'text-emerald-400' : 'text-amber-400'} />
        <KV k="عمر آخرین فیکس" v={tel.gpsFixAgeMs >= 0 ? `${fmtInt(tel.gpsFixAgeMs)} ms` : '—'} />
      </Card>

      <Card title="پرتو ماهواره‌ها (Sky Plot)" icon={<Signal className="w-4 h-4 text-emerald-400" />}>
        <SkyPlotPlaceholder />
      </Card>

      <Card title="شمارنده‌های لینک GPS" icon={<Signal className="w-4 h-4 text-emerald-400" />}>
        <KV k="جمله‌های معتبر" v={fmtInt(tel.cnt.gpsValid ?? 0)} />
        <KV k="جمله‌های خراب" v={fmtInt(tel.cnt.gpsBad ?? 0)} color={(tel.cnt.gpsBad ?? 0) > 0 ? 'text-amber-400' : undefined} />
        <KV k="بایت دریافتی" v={fmtInt(tel.cnt.gpsRxBytes ?? 0)} />
        <KV k="UART FE/NE/ORE/PE" v={`${tel.cnt.fe ?? 0}/${tel.cnt.ne ?? 0}/${tel.cnt.ore ?? 0}/${tel.cnt.pe ?? 0}`} />
        <KV k="سرریز رینگ‌بافر" v={fmtInt(tel.cnt.ringOvr ?? 0)} />
        <KV k="سرریز صف NMEA" v={fmtInt(tel.cnt.nmeaQOvr ?? 0)} />
        <div className="mt-3 text-[11px] text-zinc-400 leading-6">
          GPS با <b className="font-mono">USART2</b> وصل است: <b className="font-mono">PA3 ← TX ماژول</b>، <b className="font-mono">PA2 → RX ماژول</b>، 9600-8N1.
          فریمور فقط RMC/GGA را تحلیل می‌کند و آن‌ها را با پیشوند <b className="font-mono">N,</b> روی لینک می‌فرستد.
          از آنجا که جملهٔ GSV (محل و SNR ماهواره‌ها) ارسال نمی‌شود، آسمان‌نما تا افزودن پشتیبانی GSV در فریمور خالی می‌ماند.
        </div>
      </Card>
    </div>
  );
}

function SkyPlotPlaceholder() {
  const sats = useGS(s => s.tel.gpsSats);
  const c = 90, R = 80;
  return (
    <div className="flex flex-col items-center">
      <svg width={190} height={190} viewBox="0 0 190 190" dir="ltr" className="select-none">
        <circle cx={c} cy={c} r={R} fill="#101013" stroke="#3f3f46" />
        <circle cx={c} cy={c} r={R * 0.66} fill="none" stroke="#27272a" />
        <circle cx={c} cy={c} r={R * 0.33} fill="none" stroke="#27272a" />
        <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="#27272a" />
        <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="#27272a" />
        <text x={c} y={10} fontSize={10} fill="#f87171" textAnchor="middle">N</text>
        <text x={c} y={186} fontSize={10} fill="#a1a1aa" textAnchor="middle">S</text>
        <text x={5} y={c + 3} fontSize={10} fill="#a1a1aa">W</text>
        <text x={175} y={c + 3} fontSize={10} fill="#a1a1aa">E</text>
        {sats > 0 && (
          <text x={c} y={c - 4} fontSize={11} fill="#34d399" textAnchor="middle">{sats} ماهواره</text>
        )}
      </svg>
      <p className="text-xs text-zinc-500 text-center mt-2 leading-5 max-w-60">
        محل دقیق ماهواره‌ها (آزیموت/ارتفاع) داخل جمله‌های GSV است که فریمور v7 فعلاً ارسال نمی‌کند.
        به‌محض فعال‌شدن GSV در فریمور، این نمودار خودکار پر می‌شود.
      </p>
    </div>
  );
}
