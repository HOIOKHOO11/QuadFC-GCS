'use client';

import { Card, KV } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { engine } from '@/lib/qfc/engine';
import { COMMANDS } from '@/lib/qfc/protocol';
import { VS_COMMANDS, VS_TEST_FA, VS_TEST_ORDER, type VsTestKey } from '@/lib/qfc/valsuite';
import { fmtInt } from '@/lib/qfc/format';
import { Stethoscope, TerminalSquare, ShieldCheck, FlaskConical, ClipboardCheck, ScanSearch, Gauge, BellRing } from 'lucide-react';

export function DiagTab() {
  const mode = useGS(s => s.conn.mode);
  if (mode === 'valsuite') return <VsDiag />;
  return <LoggerDiag />;
}

/* ============================ Logger v7 view ============================ */

function LoggerDiag() {
  const tel = useGS(s => s.tel);
  const events = useGS(s => s.events);
  const conn = useGS(s => s.conn);
  const on = conn.status === 'on';
  const errs = events.filter(e => e.sev === 'err' || e.sev === 'crit').slice(-6).reverse();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="سلامت باس و سنسورها (لاگر v7)" icon={<Stethoscope className="w-4 h-4 text-emerald-400" />}>
        <KV k="سنسورها" v="MPU6050 · HMC5883L · MS5611 (از فریم‌های D)" mono={false} />
        <KV k="شمارندهٔ خطای I2C" v={fmtInt(tel.cnt.i2cErr ?? 0)} color={(tel.cnt.i2cErr ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <KV k="NACK" v={fmtInt(tel.cnt.i2cNacks ?? 0)} />
        <KV k="بازیابی‌های باس" v={fmtInt(tel.cnt.i2cRec ?? 0)} />
        <KV k="سیم‌بندی فریمور" v="I2C: PB10=SCL، PB11=SDA" />
        <div className="mt-3 text-[11px] text-zinc-400 leading-6">
          هر ۵۰۰ms یک فریم کامل می‌آید؛ اگر آمار خطا صفر بماند یعنی باس پایدار است.
          برای دستورهای تعاملی لاگر از دکمه‌های کنار استفاده کن.
        </div>
      </Card>

      <Card title="فرمان‌های لاگر v7" icon={<TerminalSquare className="w-4 h-4 text-emerald-400" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COMMANDS.map(c => (
            <button
              key={c.cmd}
              onClick={() => engine.send(c.cmd)}
              disabled={!on}
              title={`${c.fa} — ${c.desc}`}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-2 text-right hover:border-emerald-800 hover:bg-emerald-950/30 disabled:opacity-40 transition-colors"
            >
              <span className="font-mono text-sm text-emerald-400 w-5 text-center">{c.cmd}</span>
              <span className="text-xs text-zinc-300">{c.fa}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-3 leading-5">
          اگر برد سوئیت اعتبارسنجی v4.0 را اجرا کند، این لیست خودکار به منوی همان فریمور عوض می‌شود.
        </p>
      </Card>

      <Card title="شمارنده‌های UART و RC" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
        <KV k="GPS بایت دریافتی" v={fmtInt(tel.cnt.gpsRxBytes ?? 0)} />
        <KV k="GPS جملهٔ معتبر / خراب" v={`${fmtInt(tel.cnt.gpsValid ?? 0)} / ${fmtInt(tel.cnt.gpsBad ?? 0)}`} />
        <KV k="GPS UART: FE/NE/ORE/PE" v={`${fmtInt(tel.cnt.fe ?? 0)} / ${fmtInt(tel.cnt.ne ?? 0)} / ${fmtInt(tel.cnt.ore ?? 0)} / ${fmtInt(tel.cnt.pe ?? 0)}`} />
        <KV k="RC فریم بد / گلیچ PPM" v={`${fmtInt(tel.cnt.rcBad ?? 0)} / ${fmtInt(tel.cnt.ppmGlitch ?? 0)}`} />
        <KV k="iBUS: خطا / چک‌سام / ریزش" v={`${fmtInt(tel.cnt.ibusErr ?? 0)} / ${fmtInt(tel.cnt.ibusCrc ?? 0)} / ${fmtInt(tel.cnt.ibusDrop ?? 0)}`} />
        <KV k="HC-12 backpressure" v={fmtInt(tel.cnt.hc12Bp ?? 0)} />
        <KV k="HC-12 خطای دریافت" v={fmtInt(tel.cnt.hc12RxErr ?? 0)} />
        <KV k="رکوردهای لاگ (خلاصهٔ Q)" v={fmtInt(tel.cnt.logRecords ?? 0)} />
      </Card>

      <Card title="آخرین خطاهای جدی">
        {errs.length === 0 && <div className="text-xs text-emerald-400">خطای جدی ثبت نشده ✓</div>}
        <div className="space-y-2">
          {errs.map(e => (
            <div key={e.id} className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-2.5">
              <div className="text-xs font-semibold text-rose-300">{e.title} {e.count > 1 && <span className="text-rose-400/70">×{e.count}</span>}</div>
              {e.detail && <div className="text-[11px] text-zinc-300 mt-0.5">{e.detail}</div>}
              {e.action && <div className="text-[11px] text-amber-300 mt-1">اقدام: {e.action}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ======================= Validation Suite v4.0 view ====================== */

const TEST_BADGE: Record<string, string> = {
  PASS: 'bg-emerald-950/70 text-emerald-300 border-emerald-800',
  FAIL: 'bg-rose-950/70 text-rose-300 border-rose-800',
  'NOT-RUN': 'bg-zinc-900 text-zinc-400 border-zinc-700',
};

function VsDiag() {
  const vs = useGS(s => s.vs);
  const conn = useGS(s => s.conn);
  const on = conn.status === 'on';
  const stressPct = vs.stress ? Math.min(100, Math.round((vs.stress.t / 600) * 100)) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {vs.prompt && (
        <div className="lg:col-span-2 rounded-xl border border-amber-700 bg-amber-950/40 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200 mb-1.5">
            <BellRing className="w-4 h-4" /> فریمور منتظر پاسخ توست (پرامپت تعاملی)
          </div>
          <div dir="ltr" className="font-mono text-[11px] text-amber-100/80 mb-2 whitespace-pre-wrap">{vs.prompt.text}</div>
          <div className="flex flex-wrap gap-2">
            {vs.prompt.kind === 'y' && (
              <>
                <button onClick={() => engine.send('y')} className="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5">y — بله، جامپر وصل است</button>
                <button onClick={() => engine.send('')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">Enter — رد کردن</button>
              </>
            )}
            {vs.prompt.kind === 'enter' && (
              <button onClick={() => engine.send('')} className="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5">Enter — ادامه</button>
            )}
            {vs.prompt.kind === 'choice' && (
              <>
                <button onClick={() => engine.send('1')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">1 = بررسی AT</button>
                <button onClick={() => engine.send('2')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">2 = PING</button>
                <button onClick={() => engine.send('3')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">3 = STREAM</button>
              </>
            )}
          </div>
        </div>
      )}

      <Card title="وضعیت تست‌های سوئیت" icon={<ClipboardCheck className="w-4 h-4 text-cyan-400" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VS_TEST_ORDER.map(k => {
            const t = vs.tests[k as VsTestKey];
            return (
              <div key={k} className={`rounded-lg border px-2.5 py-2 ${t ? TEST_BADGE[t.status] : 'bg-zinc-950/60 border-zinc-800 text-zinc-500'}`}>
                <div className="text-xs font-semibold">{VS_TEST_FA[k]}</div>
                <div className="text-[10px] font-mono mt-0.5">
                  {t ? (t.status === 'FAIL' && t.code ? `${t.status} · ${t.code}` : t.status) : 'اجرا نشده'}
                </div>
              </div>
            );
          })}
        </div>
        {vs.verdict && (
          <div className={`mt-3 rounded-lg p-2.5 text-xs font-semibold ${vs.verdict === 'PASS' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'}`}>
            حکم نهایی: {vs.verdict === 'PASS' ? 'همهٔ تست‌های اجراشده پاس شد — گزارش قابل استناد' : 'پذیرفته نشد — ردی‌ها را با فرمان مربوط تکرار کن'}
          </div>
        )}
        {vs.boot && (
          <div className="mt-3 space-y-1">
            {vs.boot.reset && <KV k="دلیل ریست" v={vs.boot.reset} />}
            {vs.boot.clock && <KV k="کلاک" v={vs.boot.clock} />}
            {vs.boot.lines && <KV k="خطوط باس در راه‌اندازی" v={vs.boot.lines} />}
          </div>
        )}
        <p className="text-[10px] text-zinc-500 mt-2 leading-5">یادآوری فریمور: PASS ارتباطی ≠ درستیِ داده؛ اعداد هر تست را در کنسول ببین.</p>
      </Card>

      <Card title="فرمان‌های سوئیت v4.0" icon={<TerminalSquare className="w-4 h-4 text-cyan-400" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VS_COMMANDS.map(c => (
            <button
              key={c.cmd}
              onClick={() => engine.send(c.cmd)}
              disabled={!on}
              title={`${c.fa} — ${c.desc}`}
              className={`relative flex items-center gap-2 rounded-lg border bg-zinc-950/70 px-2.5 py-2 text-right disabled:opacity-40 transition-colors ${c.long ? 'border-amber-900 hover:border-amber-600 hover:bg-amber-950/30' : 'border-zinc-800 hover:border-cyan-800 hover:bg-cyan-950/30'}`}
            >
              <span className="font-mono text-sm text-cyan-400 w-5 text-center">{c.cmd}</span>
              <span className="text-xs text-zinc-300">{c.fa}</span>
              {c.interactive && <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cyan-500" title="تعاملی — پرامپت می‌پرسد" />}
              {c.long && <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-500" title="طولانی" />}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-3 leading-5">
          نقطهٔ فیروزه‌ای = فرمان تعاملی (پرامپت می‌پرسد و پاسخ از نوار زرد بالا یا کنسول فرستاده می‌شود).
          <span className="text-amber-400/90"> نقطهٔ کهربایی = تست طولانی (N: ۶۰ث — T: ۶۰۰ث)</span>.
        </p>
      </Card>

      <Card title="نتیجهٔ آخرین اسکن I2C" icon={<ScanSearch className="w-4 h-4 text-cyan-400" />}>
        {vs.scan ? (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {vs.scan.stable.length === 0 && <span className="text-xs text-zinc-500">هنوز نتیجه‌ای ثبت نشده — S را بزن.</span>}
              {vs.scan.stable.map(d => (
                <span key={d.addr} className="rounded-md border border-emerald-800 bg-emerald-950/50 text-emerald-300 font-mono text-[11px] px-2 py-1">
                  {d.addr} ×{d.n}
                </span>
              ))}
            </div>
            <KV k="ACK ناپایدار" v={vs.scan.unstable || '—'} color={vs.scan.unstable && vs.scan.unstable !== 'none' ? 'text-amber-400' : undefined} />
            <KV k="ACK ناشناس" v={vs.scan.unknown || '—'} color={vs.scan.unknown && vs.scan.unknown !== 'none' ? 'text-amber-400' : undefined} />
            <KV k="NACK کل / خطای تراکنش / بازیابی" v={`${fmtInt(vs.scan.nack)} / ${fmtInt(vs.scan.txErr)} / ${fmtInt(vs.scan.recov)}`} />
            {vs.scan.verdict && <KV k="نتیجه" v={vs.scan.verdict} color={vs.scan.verdict.startsWith('PASS') ? 'text-emerald-400' : 'text-rose-400'} />}
          </>
        ) : (
          <div className="text-xs text-zinc-500">با فرمان S اسکن کامل ۱۰دوری بگیر تا نتیجه اینجا ساخت‌یافته بیاید.</div>
        )}
        {vs.devices.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] text-zinc-400 mb-1.5">بازبینی دستگاه‌ها (re-check):</div>
            <div className="flex flex-wrap gap-1.5">
              {vs.devices.map((d, i) => (
                <span key={i} className={`rounded-md border font-mono text-[11px] px-2 py-1 ${d.ack ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                  {d.addr} {d.name} {d.ack ? 'ACK' : 'NACK'}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {(vs.stress || vs.stressSummary.length > 0) && (
        <Card title="تست فشار باس (T — ۶۰۰ ثانیه)" icon={<Gauge className="w-4 h-4 text-amber-400" />}>
          {vs.stress && (
            <>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
                <div className={`h-full transition-all ${vs.stress.t >= 600 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${stressPct}%` }} />
              </div>
              <KV k="پیشرفت" v={`${vs.stress.t}s / 600s (${stressPct}٪)`} />
              <KV k="شمارش MPU / MAG / BARO" v={`${fmtInt(vs.stress.mpu)} / ${fmtInt(vs.stress.mag)} / ${fmtInt(vs.stress.baro)}`} />
              <KV k="خطا / بازیابی / ریست MCU" v={`${fmtInt(vs.stress.err)} / ${fmtInt(vs.stress.recov)} / ${fmtInt(vs.stress.resets)}`}
                color={vs.stress.err > 0 || vs.stress.resets > 0 ? 'text-amber-400' : 'text-emerald-400'} />
            </>
          )}
          {vs.stressSummary.length > 0 && (
            <div dir="ltr" className="mt-3 rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 font-mono text-[11px] text-zinc-300 space-y-0.5">
              {vs.stressSummary.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </Card>
      )}

      <Card title="شمارنده‌ها و کالیبراسیون (گزارش P)" icon={<ShieldCheck className="w-4 h-4 text-cyan-400" />}>
        {Object.keys(vs.i2c).length === 0 && Object.keys(vs.uart).length === 0 && (
          <div className="text-xs text-zinc-500 mb-2">با فرمان P گزارش کامل بگیر تا شمارنده‌ها اینجا ساخت‌یافته بیایند.</div>
        )}
        {Object.keys(vs.i2c).length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] text-zinc-400 mb-1">I2C:</div>
            <div className="grid grid-cols-2 gap-x-4">
              <KV k="errors" v={fmtInt(vs.i2c.errors)} color={(vs.i2c.errors ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'} />
              <KV k="nack_addr" v={fmtInt(vs.i2c.nackAddr)} />
              <KV k="nack_data" v={fmtInt(vs.i2c.nackData)} />
              <KV k="timeout" v={fmtInt(vs.i2c.timeout)} />
              <KV k="arlo" v={fmtInt(vs.i2c.arlo)} />
              <KV k="berr" v={fmtInt(vs.i2c.berr)} />
              <KV k="ovr" v={fmtInt(vs.i2c.ovr)} />
              <KV k="probes" v={fmtInt(vs.i2c.probes)} />
              <KV k="busy_heals" v={fmtInt(vs.i2c.busyHeals)} />
              <KV k="recov attempts/ok" v={`${fmtInt(vs.i2c.recovAttempts)} / ${fmtInt(vs.i2c.recovOk)}`} />
            </div>
          </div>
        )}
        {Object.keys(vs.uart).length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] text-zinc-400 mb-1">UART1:</div>
            <div className="grid grid-cols-2 gap-x-4">
              <KV k="noise" v={fmtInt(vs.uart.noise)} />
              <KV k="framing" v={fmtInt(vs.uart.framing)} />
              <KV k="overrun" v={fmtInt(vs.uart.overrun)} />
              <KV k="parity" v={fmtInt(vs.uart.parity)} />
            </div>
          </div>
        )}
        {Object.keys(vs.calFlags).length > 0 && (
          <div>
            <div className="text-[11px] text-zinc-400 mb-1">کالیبراسیون در RAM:</div>
            <KV k="ژیرو / شتاب۶وجهی / قطب‌نما" v={`${vs.calFlags.gyro} / ${vs.calFlags.acc6} / ${vs.calFlags.mag}`}
              color={Object.values(vs.calFlags).every(v => v === 1) ? 'text-emerald-400' : undefined} />
            <div className="text-[10px] text-zinc-500 mt-1.5">با ریست برد از دست می‌روند — خروجی G/X/K را از کنسول ذخیره کن.</div>
          </div>
        )}
        {vs.fw && <KV k="فریمور" v={vs.fw} mono={false} />}
      </Card>

      <Card title="راهنمای سوئیت" icon={<FlaskConical className="w-4 h-4 text-cyan-400" />}>
        <div className="text-[11px] text-zinc-300 leading-6">
          این فریمور فقط سخت‌افزار را اعتبارسنجی می‌کند و هیچ خروجی موتوری ندارد (PB6..PB9 امن است).
          ترتیب پیشنهادی: <span className="font-mono text-cyan-300">S → M → H → B → I</span> بعد
          <span className="font-mono text-cyan-300"> G → X → K</span> و در انتها
          <span className="font-mono text-amber-300"> T</span> (۶۰۰ ثانیه) و
          <span className="font-mono text-cyan-300"> P</span> برای گزارش قابل استناد.
          همهٔ خروجی‌ها به‌صورت ساخت‌یافته همین‌جا و در تب رویدادها هم تفسیر فارسی می‌شوند.
        </div>
      </Card>
    </div>
  );
}
