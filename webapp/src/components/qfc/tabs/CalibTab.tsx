'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, KV } from '../ui-helpers';
import { useGS, type Calib } from '@/lib/qfc/store';
import { fmt, fmtInt } from '@/lib/qfc/format';
import { Crosshair, Download, Upload, RotateCcw, Play, Square, Save } from 'lucide-react';

type WizardKind = 'gyro' | 'accel' | 'mag';

interface WizardState {
  kind: WizardKind | null;
  running: boolean;
  samples: number;
  msg: string;
}

const ACCEL_FACES = [
  { fa: 'رو به بالا (عادی روی میز)', hint: 'صفحهٔ برد افقی، چیپ رو به سقف' },
  { fa: 'رو به پایین', hint: 'برد برعکس، چیپ رو به زمین' },
  { fa: 'X رو به بالا', hint: 'لبهٔ +X بالا (عمودی)' },
  { fa: 'X رو به پایین', hint: 'لبهٔ -X بالا' },
  { fa: 'Y رو به بالا', hint: 'لبهٔ +Y بالا (عمودی)' },
  { fa: 'Y رو به پایین', hint: 'لبهٔ -Y بالا' },
];

export function CalibTab() {
  const cal = useGS(s => s.cal);
  const setCal = useGS(s => s.setCal);
  const tel = useGS(s => s.tel);
  const [wiz, setWiz] = useState<WizardState>({ kind: null, running: false, samples: 0, msg: '' });
  const bufRef = useRef<{ ax: number[]; ay: number[]; az: number[]; gx: number[]; gy: number[]; gz: number[]; mx: number[]; my: number[]; mz: number[] }>({ ax: [], ay: [], az: [], gx: [], gy: [], gz: [], mx: [], my: [], mz: [] });
  const [faces, setFaces] = useState<Record<number, { ax: number; ay: number; az: number }>>({});
  const [fileNote, setFileNote] = useState('');

  // live sampling for gyro/mag wizards
  useTickSampling(wiz.running && (wiz.kind === 'gyro' || wiz.kind === 'mag'), wiz.kind, bufRef, (n) => setWiz(w => ({ ...w, samples: n })));

  const startGyro = () => {
    bufRef.current = { ax: [], ay: [], az: [], gx: [], gy: [], gz: [], mx: [], my: [], mz: [] };
    setWiz({ kind: 'gyro', running: true, samples: 0, msg: 'کواد را کاملاً بی‌حرکت نگه دار…' });
  };
  const startMag = () => {
    bufRef.current = { ax: [], ay: [], az: [], gx: [], gy: [], gz: [], mx: [], my: [], mz: [] };
    setWiz({ kind: 'mag', running: true, samples: 0, msg: 'کواد را آهسته در همهٔ جهت‌ها بچرخان (هر ۳ محور)…' });
  };
  const finish = () => {
    const buf = bufRef.current;
    if (wiz.kind === 'gyro' && buf.gx.length >= 20) {
      setCal({ gyro: { x: avg(buf.gx), y: avg(buf.gy), z: avg(buf.gz) } });
      setWiz({ kind: null, running: false, samples: 0, msg: 'بایاس ژیرو ذخیره شد ✓' });
    } else if (wiz.kind === 'mag' && buf.mx.length >= 40) {
      const mx = buf.mx, my = buf.my, mz = buf.mz;
      setCal({
        magBias: { x: (max(mx) + min(mx)) / 2, y: (max(my) + min(my)) / 2, z: (max(mz) + min(mz)) / 2 },
        magScale: { x: (max(mx) - min(mx)) / 2, y: (max(my) - min(my)) / 2, z: (max(mz) - min(mz)) / 2 },
      });
      setWiz({ kind: null, running: false, samples: 0, msg: 'آفست مگنتومتر ذخیره شد ✓ (الان قطب‌نما باید شمال واقعی را نشان بدهد)' });
    } else {
      setWiz(w => ({ ...w, running: false, msg: 'نمونه کافی نبود — دوباره تلاش کن.' }));
    }
  };
  const cancel = () => setWiz({ kind: null, running: false, samples: 0, msg: 'لغو شد.' });

  const captureFace = (i: number) => {
    if (!tel.last || !tel.mpuOk) return;
    const f = { ax: tel.ax, ay: tel.ay, az: tel.az };
    const nf = { ...faces, [i]: f };
    setFaces(nf);
    if (Object.keys(nf).length === 6) {
      // 6-point solve: bias=(max+min)/2, scale per axis from up/down pairs
      const up = nf[0], dn = nf[1], xp = nf[2], xn = nf[3], yp = nf[4], yn = nf[5];
      const bias = {
        x: (xp.ax + xn.ax) / 2, y: (yp.ay + yn.ay) / 2, z: (up.az + dn.az) / 2,
      };
      const scale = {
        x: Math.abs(xp.ax - xn.ax) / 32768 || 1,
        y: Math.abs(yp.ay - yn.ay) / 32768 || 1,
        z: Math.abs(up.az - dn.az) / 32768 || 1,
      };
      setCal({ accBias: bias, accScale: scale });
      setWiz({ kind: null, running: false, samples: 0, msg: 'کالیبراسیون ۶-جهتهٔ شتاب‌سنج ذخیره شد ✓' });
    }
  };

  const exportCal = () => {
    const blob = new Blob([JSON.stringify(cal, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quadfc_offsets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importCal = async (f: File | undefined) => {
    if (!f) return;
    try {
      const c = JSON.parse(await f.text()) as Calib;
      setCal(c);
      setFileNote(`آفست‌ها از «${f.name}» بارگذاری شد ✓`);
    } catch {
      setFileNote('فایل معتبر نبود ✗');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="کالیبراسیون ژیروسکوپ (بایاس سکون)" icon={<Crosshair className="w-4 h-4 text-emerald-400" />}>
        <ol className="text-xs text-zinc-300 leading-6 list-decimal pr-5 space-y-1 mb-3">
          <li>کواد را روی سطح صاف و بی‌لرزش بگذار.</li>
          <li>اتصال را وصل کن و جریان داده را روشن کن.</li>
          <li>«شروع» را بزن و ۸ ثانیه هیچ‌کس به آن نزند.</li>
          <li>«پایان و ذخیره» را بزن — میانگین = بایاس هر محور.</li>
        </ol>
        {wiz.kind === 'gyro' && wiz.running && (
          <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 mb-3">
            <div className="text-xs text-amber-300 animate-pulse">در حال نمونه‌برداری… {wiz.samples} نمونه</div>
            <div className="text-[11px] text-zinc-300 mt-1">{wiz.msg}</div>
            <div className="font-mono text-[11px] text-zinc-400 mt-1">
              gx={fmtInt(tel.gx)} gy={fmtInt(tel.gy)} gz={fmtInt(tel.gz)}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {!wiz.running ? <Button2 icon={<Play className="w-3.5 h-3.5" />} onClick={startGyro}>شروع</Button2>
            : <>
              <Button2 icon={<Save className="w-3.5 h-3.5" />} onClick={finish} primary>پایان و ذخیره</Button2>
              <Button2 icon={<Square className="w-3.5 h-3.5" />} onClick={cancel}>لغو</Button2>
            </>}
        </div>
        {cal.gyro && <div className="mt-3"><KV k="بایاس ذخیره‌شده" v={`gx=${fmt(cal.gyro.x, 1)} gy=${fmt(cal.gyro.y, 1)} gz=${fmt(cal.gyro.z, 1)}`} /></div>}
      </Card>

      <Card title="کالیبراسیون شتاب‌سنج (۶-جهته)" icon={<Crosshair className="w-4 h-4 text-emerald-400" />}>
        <ol className="text-xs text-zinc-300 leading-6 list-decimal pr-5 space-y-1 mb-3">
          <li>کواد را در هر ۶ وضعیت زیر بگیر، چند ثانیه ساکن نگه دار و «ثبت» بزن.</li>
          <li>بعد از هر ثبت، تیک سبز می‌خورد؛ هر ۶ تا که شد خودکار حل و ذخیره می‌شود.</li>
        </ol>
        <div className="space-y-2">
          {ACCEL_FACES.map((f, i) => {
            const done = !!faces[i];
            return (
              <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${done ? 'border-emerald-800 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-950/70'}`}>
                <div>
                  <div className="text-xs text-zinc-200">{i + 1}. {f.fa} {done && <span className="text-emerald-400">✓ ثبت شد</span>}</div>
                  <div className="text-[10px] text-zinc-500">{f.hint}</div>
                </div>
                {!done && <Button2 onClick={() => captureFace(i)} small>ثبت</Button2>}
              </div>
            );
          })}
        </div>
        {cal.accBias && (
          <div className="mt-3">
            <KV k="بایاس شتاب‌سنج" v={`x=${fmt(cal.accBias.x)} y=${fmt(cal.accBias.y)} z=${fmt(cal.accBias.z)}`} />
          </div>
        )}
      </Card>

      <Card title="کالیبراسیون مگنتومتر (چرخش آزاد)" icon={<Crosshair className="w-4 h-4 text-emerald-400" />}>
        <ol className="text-xs text-zinc-300 leading-6 list-decimal pr-5 space-y-1 mb-3">
          <li>از آهن‌ربا، موتور و فلزات بزرگ دور شو (همین لپ‌تاپ هم میدان دارد).</li>
          <li>«شروع» را بزن و کواد را ~۳۰ ثانیه در همهٔ جهت‌ها آهسته بچرخان (حرکت ۸ بزرگ در هوا).</li>
          <li>«پایان و ذخیره» — بایاس = (بیشینه+کمینه)/2 هر محور.</li>
        </ol>
        {wiz.kind === 'mag' && wiz.running && (
          <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 mb-3">
            <div className="text-xs text-amber-300 animate-pulse">در حال جمع‌کردن نقاط… {wiz.samples} نمونه</div>
            <div className="font-mono text-[11px] text-zinc-400 mt-1">
              mx={fmtInt(tel.mx)} my={fmtInt(tel.my)} mz={fmtInt(tel.mz)}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {!wiz.running ? <Button2 icon={<Play className="w-3.5 h-3.5" />} onClick={startMag}>شروع</Button2>
            : <>
              <Button2 icon={<Save className="w-3.5 h-3.5" />} onClick={finish} primary>پایان و ذخیره</Button2>
              <Button2 icon={<Square className="w-3.5 h-3.5" />} onClick={cancel}>لغو</Button2>
            </>}
        </div>
        {cal.magBias && (
          <div className="mt-3">
            <KV k="آفست ذخیره‌شده" v={`x=${fmt(cal.magBias.x)} y=${fmt(cal.magBias.y)} z=${fmt(cal.magBias.z)}`} />
          </div>
        )}
      </Card>

      <Card title="ذخیره/بارگذاری آفست‌ها" icon={<Save className="w-4 h-4 text-emerald-400" />}>
        <p className="text-xs text-zinc-400 leading-6 mb-3">
          آفست‌ها خودکار در همین مرورگر ذخیره می‌شوند (localStorage) و در نمایش مقادیر خام اعمال می‌شوند.
          برای انتقال به دستگاه دیگر، خروجی JSON بگیر یا فایل قبلی را برگردان.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button2 icon={<Download className="w-3.5 h-3.5" />} onClick={exportCal}>خروجی JSON</Button2>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 cursor-pointer hover:border-zinc-500">
            <Upload className="w-3.5 h-3.5" /> بارگذاری
            <input type="file" accept="application/json" className="hidden" onChange={e => void importCal(e.target.files?.[0])} />
          </label>
          <Button2 icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setCal({ gyro: null, accBias: null, accScale: null, magBias: null, magScale: null })}>پاک‌کردن همه</Button2>
        </div>
        {wiz.msg && <div className="mt-3 text-xs text-emerald-400">{wiz.msg}</div>}
        {fileNote && <div className="mt-1 text-xs text-cyan-400">{fileNote}</div>}
      </Card>
    </div>
  );
}

function avg(a: number[]): number { return a.reduce((s, v) => s + v, 0) / Math.max(1, a.length); }
function min(a: number[]): number { return a.reduce((m, v) => Math.min(m, v), Infinity); }
function max(a: number[]): number { return a.reduce((m, v) => Math.max(m, v), -Infinity); }

function Button2({ children, onClick, icon, primary, small }: {
  children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; primary?: boolean; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 ${small ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} transition-colors ${primary ? 'border-emerald-700 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800/60' : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'}`}
    >
      {icon}{children}
    </button>
  );
}

// sample loop: pushes current frame values into ref while wizard runs
function useTickSampling(
  running: boolean,
  kind: WizardKind | null,
  bufRef: React.MutableRefObject<{ ax: number[]; ay: number[]; az: number[]; gx: number[]; gy: number[]; gz: number[]; mx: number[]; my: number[]; mz: number[] }>,
  onCount: (n: number) => void,
) {
  const flags = useRef({ running, kind });
  useEffect(() => { flags.current = { running, kind }; });
  const lastSeq = useRef(-1);
  useEffect(() => {
    const unsub = useGS.subscribe(() => {
      const { running: on, kind: k } = flags.current;
      if (!on) return;
      const { tel } = useGS.getState();
      if (!tel.last || tel.seq === lastSeq.current) return;
      lastSeq.current = tel.seq;
      const b = bufRef.current;
      b.ax.push(tel.ax); b.ay.push(tel.ay); b.az.push(tel.az);
      b.gx.push(tel.gx); b.gy.push(tel.gy); b.gz.push(tel.gz);
      b.mx.push(tel.mx); b.my.push(tel.my); b.mz.push(tel.mz);
      onCount(k === 'mag' ? b.mx.length : b.gx.length);
    });
    return unsub;
  }, []);
}
