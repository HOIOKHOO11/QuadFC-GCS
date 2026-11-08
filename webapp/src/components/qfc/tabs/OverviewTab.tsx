'use client';

import { Card, KV, Dot } from '../ui-helpers';
import { Horizon } from '../instruments/Horizon';
import { Compass } from '../instruments/Compass';
import { Chart } from '../instruments/Chart';
import { CellGauge } from '../instruments/CellGauge';
import { useGS } from '@/lib/qfc/store';
import { fmt, fmtInt, msUp, latLonStr } from '@/lib/qfc/format';
import { BatteryCharging, Compass as CompassIcon, Gauge, Mountain, Radio, Satellite, Waves, Activity } from 'lucide-react';

export function OverviewTab() {
  const tel = useGS(s => s.tel);
  const att = useGS(s => s.att);
  const bat = useGS(s => s.bat);
  const hist = useGS(s => s.hist);
  const conn = useGS(s => s.conn);
  const events = useGS(s => s.events);
  const fresh = Date.now() - conn.lastRxAt < 2500;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* attitude instruments */}
      <Card title="وضعیت پروازی" icon={<Activity className="w-4 h-4 text-emerald-400" />}>
        <div className="flex flex-wrap items-center justify-around gap-3">
          <Horizon roll={att.roll} pitch={att.pitch} size={170} />
          <Compass heading={att.yaw} size={170} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 py-2">
            <div className="text-[10px] text-zinc-500">رول</div>
            <div className="font-mono text-emerald-400">{fmt(att.roll)}°</div>
          </div>
          <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 py-2">
            <div className="text-[10px] text-zinc-500">پیچ</div>
            <div className="font-mono text-emerald-400">{fmt(att.pitch)}°</div>
          </div>
          <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 py-2">
            <div className="text-[10px] text-zinc-500">یاو (قطب‌نما)</div>
            <div className="font-mono text-emerald-400">{att.yaw !== null ? fmt(att.yaw) + '°' : '—'}</div>
          </div>
        </div>
      </Card>

      {/* battery */}
      <Card title="باتری (تشخیص هوشمند سلول)" icon={<BatteryCharging className="w-4 h-4 text-emerald-400" />}>
        <CellGauge bat={bat} />
        <div className="mt-3">
          <KV k="ولتاژ باتری (PA4، مقسّم 100k/33k)" v={`${fmtInt(tel.vbatMv)} mV`} />
          <KV k="ولتاژ گرهٔ PA4" v={`${fmtInt(tel.pa4PinMv)} mV`} />
          <KV k="VDD برد (تخمین Vrefint)" v={`${fmtInt(tel.vddMv)} mV`} />
          <KV k="ADC خام" v={fmtInt(tel.pa4Adc)} />
        </div>
        <div className="mt-3">
          <Chart series={[{ name: 'ولتاژ', color: '#34d399', values: hist.bat.map(p => p.v) }]} height={80} unit="V" digits={2} min={6} max={9} />
        </div>
      </Card>

      {/* altitude */}
      <Card title="ارتفاع — بارومتر vs GPS" icon={<Mountain className="w-4 h-4 text-emerald-400" />}>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 p-2 text-center">
            <div className="text-[10px] text-zinc-500">MS5611 (فشار هوا)</div>
            <div className="font-mono text-lg text-cyan-300">{isFinite(tel.altBaroM) ? fmt(tel.altBaroM) + ' m' : '—'}</div>
          </div>
          <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 p-2 text-center">
            <div className="text-[10px] text-zinc-500">GPS</div>
            <div className="font-mono text-lg text-cyan-300">{tel.altGpsM !== null ? fmt(tel.altGpsM) + ' m' : '—'}</div>
          </div>
        </div>
        <KV k="فشار" v={`${fmtInt(tel.pPa)} Pa`} />
        <KV k="دمای بارومتر" v={`${fmt(tel.baroTempC)} °C`} />
        <KV k="دمای MPU" v={`${fmt(tel.mpuTempC)} °C`} />
        {isFinite(tel.altBaroM) && tel.altGpsM !== null && (
          <KV k="اختلاف بارومتر−GPS" v={`${fmt(tel.altBaroM - tel.altGpsM)} m`} color={
            Math.abs(tel.altBaroM - tel.altGpsM) > 50 ? 'text-amber-400' : 'text-zinc-100'
          } />
        )}
        <div className="mt-3">
          <Chart
            series={[
              { name: 'بارومتر', color: '#22d3ee', values: hist.alt.map(p => p.b) },
              { name: 'GPS', color: '#fbbf24', values: hist.alt.map(p => p.g) },
            ]}
            height={90} unit="m" digits={0}
          />
        </div>
      </Card>

      {/* sensors health */}
      <Card title="سلامت سنسورها و باس" icon={<Waves className="w-4 h-4 text-emerald-400" />}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Dot ok={tel.mpuOk ? true : fresh ? false : undefined} label="MPU6050 (0x68)" />
            <Dot ok={tel.magOk ? true : fresh ? false : undefined} label="HMC5883L (0x1E)" />
            <Dot ok={tel.baroOk ? true : fresh ? false : undefined} label="MS5611 (0x77)" />
          </div>
          <KV k="خطاهای I2C" v={fmtInt(tel.cnt.i2cErr ?? 0)} color={(tel.cnt.i2cErr ?? 0) > 0 ? 'text-amber-400' : undefined} />
          <KV k="NACK ها" v={fmtInt(tel.cnt.i2cNacks ?? 0)} />
          <KV k="بازیابی‌های باس" v={fmtInt(tel.cnt.i2cRec ?? 0)} />
          <KV k="رکورد دریافتی (seq)" v={fmtInt(tel.seq >= 0 ? tel.seq : null)} />
          <KV k="آپ‌تایم فریمور" v={tel.fwMs >= 0 ? msUp(tel.fwMs) : '—'} />
          <KV k="مدت لاگ" v={tel.logElapsed >= 0 ? msUp(tel.logElapsed) : '—'} />
        </div>
      </Card>

      {/* gps */}
      <Card title="GPS" icon={<Satellite className="w-4 h-4 text-emerald-400" />}>
        <div className="space-y-1">
          <KV k="فیکس" v={tel.gpsFix ? (tel.gpsFix >= 2 ? '3D' : 'دارد') : 'ندارد'} color={tel.gpsFix ? 'text-emerald-400' : 'text-rose-400'} />
          <KV k="ماهواره‌ها" v={fmtInt(tel.gpsSats)} />
          <KV k="موقعیت" v={latLonStr(tel.lat, tel.lon)} />
          <KV k="HDOP" v={tel.hdop !== null ? fmt(tel.hdop, 2) : '—'} />
          <KV k="سرعت" v={`${fmt(tel.speedKmh)} km/h`} />
          <KV k="سمت" v={tel.courseDeg !== null ? `${fmt(tel.courseDeg)}°` : '—'} />
          <KV k="UTC" v={`${tel.utc} ${tel.dateStr}`} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
          <Radio className="w-3.5 h-3.5" /> GPS روی USART2 (PA2/PA3) — جمله‌ها از مسیر HC-12 می‌آیند.
        </div>
      </Card>

      {/* events */}
      <Card title="آخرین رویدادها و خطاها" icon={<Gauge className="w-4 h-4 text-emerald-400" />}>
        {!fresh && <div className="text-xs text-zinc-500 mb-2">جریان داده فعال نیست — اتصال، شبیه‌ساز یا بازپخش را روشن کن.</div>}
        <div className="space-y-2 max-h-56 overflow-y-auto pl-1">
          {events.length === 0 && <div className="text-xs text-zinc-500">هنوز رویدادی نیست.</div>}
          {events.slice(-8).reverse().map(e => (
            <div key={e.id} className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-[10px] text-zinc-500">{new Date(e.t).toLocaleTimeString('en-GB')}</span>
              <span className="text-xs leading-5 text-zinc-200">
                {e.count > 1 && <b className="text-zinc-500">×{e.count} </b>}{e.title}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
