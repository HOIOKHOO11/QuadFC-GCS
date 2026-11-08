'use client';

import { create } from 'zustand';
import type { Sev } from './protocol';
import type { VsDevice, VsPrompt, VsScanInfo, VsStress, VsTestKey } from './valsuite';
import { analyzeBattery, type BatteryInfo } from './battery';
import { baroAltitudeM, utcFromField, dateFromField, wrap360 } from './format';
import type { ChooserMsg, ChooserPort } from './serial';

export type ConnMode = 'off' | 'detect' | 'logger' | 'valsuite' | 'nmea' | 'sim' | 'replay';
export type ConnStatus = 'off' | 'connecting' | 'on';

export interface VsTestStatus { status: 'PASS' | 'FAIL' | 'NOT-RUN'; code?: string; at: number }

export interface VsState {
  fw: string;
  baud: number | null;
  boot: { reset?: string; clock?: string; lines?: string } | null;
  devices: VsDevice[];
  scan: VsScanInfo | null;
  tests: Partial<Record<VsTestKey, VsTestStatus>>;
  i2c: Record<string, number>;
  uart: Record<string, number>;
  calFlags: Record<string, number>;
  stress: VsStress | null;
  stressSummary: string[];
  verdict: string | null;
  prompt: VsPrompt | null;
  updatedAt: number;
}

const VS0: VsState = {
  fw: '', baud: null, boot: null, devices: [], scan: null, tests: {},
  i2c: {}, uart: {}, calFlags: {}, stress: null, stressSummary: [],
  verdict: null, prompt: null, updatedAt: 0,
};

export interface QEventRow {
  id: number;
  t: number;
  sev: Sev;
  title: string;
  detail?: string;
  action?: string;
  count: number;
}

export interface ConLine {
  id: number;
  t: number;
  dir: 'tx' | 'rx' | 'sys';
  text: string;
}

export interface Calib {
  gyro: { x: number; y: number; z: number } | null;
  accBias: { x: number; y: number; z: number } | null;
  accScale: { x: number; y: number; z: number } | null;
  magBias: { x: number; y: number; z: number } | null;
  magScale: { x: number; y: number; z: number } | null;
}

// ---------- COM port chooser (Electron shell) ----------
export interface ChooserState {
  open: boolean;
  requestId: number;
  ports: ChooserPort[];
  waitingNew: boolean;   // list empty → we keep waiting for a freshly plugged adapter
  note: string;          // transient Persian note (added/removed/refresh/…)
  remainingMs: number;   // chooser deadline for the countdown
  lastPicked: ChooserPort | null; // persists in-session; feeds the COM port label
  lastOutcome: '' | 'cancel' | 'timeout'; // read by engine on null request result
}

const CHOOSER0: ChooserState = {
  open: false, requestId: 0, ports: [], waitingNew: false, note: '',
  remainingMs: 0, lastPicked: null, lastOutcome: '',
};

const LAST_COM_KEY = 'qfc.lastCom';

export interface Telemetry {
  last: Record<string, number> | null;
  seq: number;
  fwMs: number;
  logElapsed: number;
  mpuOk: boolean; magOk: boolean; baroOk: boolean;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  mpuTempC: number;
  mx: number; my: number; mz: number;
  pPa: number; baroTempC: number; altBaroM: number;
  gpsFix: number; gpsQuality: number; gpsSats: number;
  hdop: number | null; lat: number | null; lon: number | null;
  altGpsM: number | null; speedKmh: number; courseDeg: number | null;
  utc: string; dateStr: string; gpsAgeMs: number; gpsFixAgeMs: number;
  rcMode: number; rcFrames: number; rcChCount: number; rcAgeMs: number;
  ch: number[];
  pa4Adc: number; pa4PinMv: number; vddMv: number; vbatMv: number;
  cnt: Record<string, number>;
}

export interface Attitude { roll: number; pitch: number; yaw: number | null }

const T0: Telemetry = {
  last: null, seq: -1, fwMs: -1, logElapsed: -1,
  mpuOk: false, magOk: false, baroOk: false,
  ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, mpuTempC: NaN,
  mx: 0, my: 0, mz: 0,
  pPa: 0, baroTempC: NaN, altBaroM: NaN,
  gpsFix: 0, gpsQuality: 0, gpsSats: 0,
  hdop: null, lat: null, lon: null, altGpsM: null, speedKmh: 0, courseDeg: null,
  utc: '', dateStr: '', gpsAgeMs: -1, gpsFixAgeMs: -1,
  rcMode: -1, rcFrames: 0, rcChCount: 0, rcAgeMs: -1, ch: [],
  pa4Adc: 0, pa4PinMv: 0, vddMv: 0, vbatMv: 0,
  cnt: {},
};

const HCAP = 360;
const ring = <T,>(arr: T[], item: T, cap = HCAP): T[] => {
  const out = arr.length >= cap ? arr.slice(arr.length - cap + 1) : arr.slice();
  out.push(item);
  return out;
};

interface GS {
  tel: Telemetry;
  att: Attitude;
  bat: BatteryInfo;
  conn: {
    status: ConnStatus; mode: ConnMode;
    portLabel: string; baud: number;
    fps: number; lastRxAt: number; bootAt: number;
    probeLog: string[];
  };
  events: QEventRow[];
  cons: ConLine[];
  hist: {
    alt: { t: number; b: number; g: number }[];
    bat: { t: number; v: number }[];
    acc: { t: number; x: number; y: number; z: number }[];
    gyr: { t: number; x: number; y: number; z: number }[];
    mg: { t: number; x: number; y: number; z: number }[];
  };
  trail: { lat: number; lon: number }[];
  settings: { declDeg: number; p0Pa: number; baudPref: number };
  cal: Calib;
  calSaveNote: string;
  vs: VsState;
  chooser: ChooserState;

  vsReset: () => void;
  vsApply: (p: import('./valsuite').VsPatch & { prompt?: VsPrompt | null }) => void;
  pushEvent: (e: { sev: Sev; title: string; detail?: string; action?: string }) => void;
  pushCon: (dir: ConLine['dir'], text: string) => void;
  clearEvents: () => void;
  clearCon: () => void;
  setConn: (p: Partial<GS['conn']>) => void;
  pushProbe: (s: string) => void;
  setSettings: (p: Partial<GS['settings']>) => void;
  setCal: (p: Partial<Calib>) => void;
  applyFrame: (f: Record<string, number>, declDeg: number, p0Pa: number) => void;
  applyNmea: (d: import('./protocol').NmeaData) => void;
  applyQ: (q: Record<string, number>) => void;
  resetTelemetry: () => void;
  chooserApply: (msg: ChooserMsg) => void;
  chooserDismiss: () => void;
}

let evId = 1, conId = 1;

export const useGS = create<GS>((set, get) => ({
  tel: { ...T0, ch: [] },
  att: { roll: 0, pitch: 0, yaw: null },
  bat: analyzeBattery(0),
  conn: { status: 'off', mode: 'off', portLabel: '', baud: 0, fps: 0, lastRxAt: 0, bootAt: 0, probeLog: [] },
  events: [],
  cons: [],
  hist: { alt: [], bat: [], acc: [], gyr: [], mg: [] },
  trail: [],
  settings: { declDeg: 4.7, p0Pa: 101325, baudPref: 9600 },
  cal: { gyro: null, accBias: null, accScale: null, magBias: null, magScale: null },
  calSaveNote: '',
  vs: { ...VS0 },
  chooser: { ...CHOOSER0, ports: [] },

  vsReset: () => set({ vs: { ...VS0, tests: {}, i2c: {}, uart: {}, calFlags: {}, devices: [], stressSummary: [] } }),
  vsApply: (p) => {
    const cur = get().vs;
    const next: VsState = {
      ...cur,
      ...p,
      tests: { ...cur.tests, ...(p.tests ?? {}) },
      i2c: { ...cur.i2c, ...(p.i2c ?? {}) },
      uart: { ...cur.uart, ...(p.uart ?? {}) },
      scan: p.scan ? { ...(cur.scan ?? { stable: [], unstable: 'none', unknown: 'none', nack: null, txErr: null, recov: null, verdict: '' }), ...p.scan } : cur.scan,
      boot: p.boot ? { ...(cur.boot ?? {}), ...p.boot } : cur.boot,
    };
    if (p.devicesAppend) next.devices = [...cur.devices, ...p.devicesAppend];
    if (p.stressSummaryAppend) next.stressSummary = [...cur.stressSummary, p.stressSummaryAppend].slice(-6);
    if (p.scanFresh) next.scan = null;
    if ('prompt' in p) next.prompt = p.prompt ?? null;
    next.updatedAt = Date.now();
    for (const [k, v] of Object.entries(next.tests)) {
      if (v && !v.at) next.tests[k as VsTestKey] = { ...v, at: next.updatedAt };
    }
    set({ vs: next });
  },

  pushEvent: (e) => {
    const events = get().events;
    const prev = events[events.length - 1];
    // dedup identical title within 3s -> bump count
    if (prev && prev.title === e.title && Date.now() - prev.t < 3000) {
      const copy = events.slice();
      copy[copy.length - 1] = { ...prev, count: prev.count + 1, t: Date.now() };
      set({ events: copy });
      return;
    }
    set({ events: ring(events, { id: evId++, t: Date.now(), count: 1, ...e }, 250) });
  },

  pushCon: (dir, text) => set({ cons: ring(get().cons, { id: conId++, t: Date.now(), dir, text }, 2000) }),
  clearEvents: () => set({ events: [] }),
  clearCon: () => set({ cons: [] }),
  setConn: (p) => set({ conn: { ...get().conn, ...p } }),
  pushProbe: (s) => set({ conn: { ...get().conn, probeLog: [...get().conn.probeLog.slice(-8), s] } }),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    try { localStorage.setItem('qfc.settings', JSON.stringify(settings)); } catch { /* ignore */ }
  },
  setCal: (p) => {
    const cal = { ...get().cal, ...p };
    set({ cal, calSaveNote: '' });
    try { localStorage.setItem('qfc.cal', JSON.stringify(cal)); } catch { /* ignore */ }
  },

  applyFrame: (f, declDeg, p0Pa) => {
    const prev = get().tel;
    const now = Date.now();
    const t = now;
    const altB = baroAltitudeM(f.p_pa, p0Pa);
    const hdop = f.hdop_centi > 0 && f.hdop_centi < 9900 ? f.hdop_centi / 100 : null;
    const lat = f.lat_e7 !== 0 ? f.lat_e7 / 1e7 : null;
    const lon = f.lon_e7 !== 0 ? f.lon_e7 / 1e7 : null;
    const course = f.course_cdeg > 0 ? wrap360(f.course_cdeg / 10) : null;
    const tel: Telemetry = {
      last: f,
      seq: f.seq, fwMs: f.ms, logElapsed: f.log_elapsed_ms,
      mpuOk: f.mpu_ok === 1, magOk: f.mag_ok === 1, baroOk: f.baro_ok === 1,
      ax: f.ax, ay: f.ay, az: f.az, gx: f.gx, gy: f.gy, gz: f.gz,
      mpuTempC: f.mpu_temp_cC / 100,
      mx: f.mx, my: f.my, mz: f.mz,
      pPa: f.p_pa, baroTempC: f.baro_temp_cC / 100, altBaroM: isFinite(altB) ? altB : NaN,
      gpsFix: f.gps_fix, gpsQuality: f.gps_gga_quality, gpsSats: f.gps_sats,
      hdop, lat, lon,
      altGpsM: f.altitude_cm !== 0 ? f.altitude_cm / 100 : null,
      speedKmh: (f.speed_cms / 100) * 3.6,
      courseDeg: course,
      utc: utcFromField(f.utc_hhmmss_milli) || prev.utc,
      dateStr: dateFromField(f.date_ddmmyy) || prev.dateStr,
      gpsAgeMs: f.gps_age_ms, gpsFixAgeMs: f.gps_fix_age_ms,
      rcMode: f.rc_mode, rcFrames: f.rc_frames, rcChCount: f.rc_channels_count, rcAgeMs: f.rc_age_ms,
      ch: Array.from({ length: 14 }, (_, i) => f[`ch${i + 1}`] ?? 0),
      pa4Adc: f.pa4_adc, pa4PinMv: f.pa4_pin_mV, vddMv: f.vdd_mV, vbatMv: f.pa4_source_mV,
      cnt: {
        i2cErr: f.i2c_err, i2cNacks: f.i2c_nacks, i2cRec: f.i2c_recoveries,
        gpsValid: f.gps_valid, gpsBad: f.gps_bad, gpsRxBytes: f.gps_rx_bytes,
        fe: f.gps_uart_fe, ne: f.gps_uart_ne, ore: f.gps_uart_ore, pe: f.gps_uart_pe,
        ringOvr: f.gps_ring_overrun, nmeaQOvr: f.nmea_q_overrun, hc12Bp: f.hc12_tx_backpressure,
        rcBad: f.rc_bad, ppmGlitch: f.ppm_glitch,
        ibusErr: f.ibus_frame_err, ibusCrc: f.ibus_checksum_err, ibusDrop: f.ibus_frame_drops,
      },
    };

    // attitude from accel (+ mag heading, tilt compensated)
    const roll = Math.atan2(tel.ay, tel.az) * (180 / Math.PI);
    const pitch = Math.atan2(-tel.ax, Math.sqrt(tel.ay * tel.ay + tel.az * tel.az)) * (180 / Math.PI);
    let yaw = get().att.yaw;
    if (tel.magOk && (f.mx !== 0 || f.my !== 0)) {
      const ax = tel.ax / 16384, ay = tel.ay / 16384, az = tel.az / 16384;
      const norm = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      const r = Math.atan2(ay / norm, az / norm);
      const p = Math.asin(Math.max(-1, Math.min(1, ax / norm)));
      const mx = tel.mx, my = tel.my, mz = tel.mz;
      const Xh = mx * Math.cos(p) + my * Math.sin(r) * Math.sin(p) + mz * Math.cos(r) * Math.sin(p);
      const Yh = -my * Math.cos(r) + mz * Math.sin(r);
      let h = Math.atan2(Yh, Xh) * (180 / Math.PI) + declDeg;
      yaw = wrap360(h);
    }

    // histories
    const hist = get().hist;
    const newHist = {
      alt: ring(hist.alt, { t, b: tel.altBaroM, g: tel.altGpsM ?? NaN }),
      bat: ring(hist.bat, { t, v: tel.vbatMv / 1000 }),
      acc: ring(hist.acc, { t, x: tel.ax, y: tel.ay, z: tel.az }),
      gyr: ring(hist.gyr, { t, x: tel.gx, y: tel.gy, z: tel.gz }),
      mg: ring(hist.mg, { t, x: tel.mx, y: tel.my, z: tel.mz }),
    };

    // trail
    let trail = get().trail;
    if (lat !== null && lon !== null) {
      const lastP = trail[trail.length - 1];
      if (!lastP || Math.abs(lastP.lat - lat) > 1e-7 || Math.abs(lastP.lon - lon) > 1e-7) {
        trail = ring(trail, { lat, lon }, 1200);
      }
    }

    // battery
    const bat = analyzeBattery(tel.vbatMv);
    const prevBat = get().bat;
    if (bat.cells !== null && prevBat.cells !== null && bat.percent !== null && prevBat.percent !== null) {
      const pb = prevBat.percent, cb = bat.percent;
      if (pb >= 25 && cb < 25) get().pushEvent({ sev: 'warn', title: `باتری زیر ۲۵٪ رسید (${bat.label} — ${tel.vbatMv}mV)`, action: 'برای فرود امن برنامه‌ریزی کن.' });
      if (pb >= 10 && cb < 10) get().pushEvent({ sev: 'crit', title: 'باتری زیر ۱۰٪ — بحرانی!', action: 'فوراً فرود بیا.' });
    }

    // GPS fix transitions
    if (tel.gpsFix > 0 && prev.gpsFix === 0 && prev.seq >= 0) {
      get().pushEvent({ sev: 'ok', title: `GPS فیکس گرفت (${tel.gpsSats} ماهواره)` });
    } else if (tel.gpsFix === 0 && prev.gpsFix > 0 && prev.seq >= 0) {
      get().pushEvent({ sev: 'warn', title: 'فیکس GPS از دست رفت', action: 'آسمان باز یا آنتن GPS را چک کن.' });
    }

    // counter-delta events
    const pc = prev.cnt, c = tel.cnt;
    if (prev.seq >= 0) {
      if ((c.i2cErr ?? 0) > (pc.i2cErr ?? 0)) get().pushEvent({ sev: 'warn', title: 'خطای I2C ثبت شد', detail: `شمارنده: ${c.i2cErr}` });
      if ((c.ppmGlitch ?? 0) > (pc.ppmGlitch ?? 0)) get().pushEvent({ sev: 'warn', title: 'پالس معیوب PPM (glitch)', detail: 'لبه‌های ورودی PA0 تمیز نیستند — سیم کوتاه‌تر/گاند بهتر.' });
      if ((c.hc12Bp ?? 0) > (pc.hc12Bp ?? 0)) get().pushEvent({ sev: 'info', title: 'HC-12 عقب افتاد (backpressure)', detail: 'لینک رادیویی اشباع شده — فاصله/مزاحمت.' });
      if ((c.ore ?? 0) > (pc.ore ?? 0) || (c.fe ?? 0) > (pc.fe ?? 0) || (c.ne ?? 0) > (pc.ne ?? 0)) {
        get().pushEvent({ sev: 'warn', title: 'خطای UART روی دریافت GPS', detail: `FE=${c.fe} NE=${c.ne} ORE=${c.ore}` });
      }
    }

    set({ tel, att: { roll, pitch, yaw }, hist: newHist, trail, bat });
  },

  applyNmea: (d) => {
    const tel = { ...get().tel };
    if (d.utc) tel.utc = d.utc;
    if (d.date) tel.dateStr = d.date;
    if (d.lat !== null && d.lat !== 0) tel.lat = d.lat;
    if (d.lon !== null && d.lon !== 0) tel.lon = d.lon;
    if (d.hdop !== null) tel.hdop = d.hdop < 90 ? d.hdop : tel.hdop;
    if (d.sats) tel.gpsSats = d.sats;
    if (d.fix) tel.gpsFix = Math.max(tel.gpsFix, 1);
    if (d.altM !== null) tel.altGpsM = d.altM;
    if (d.speedKmh !== null) tel.speedKmh = d.speedKmh * 1.0;
    if (d.courseDeg !== null) tel.courseDeg = d.courseDeg;
    set({ tel });
    let trail = get().trail;
    if (d.valid && d.lat !== null && d.lon !== null) {
      const lastP = trail[trail.length - 1];
      if (!lastP || Math.abs(lastP.lat - d.lat) > 1e-7 || Math.abs(lastP.lon - d.lon) > 1e-7) {
        trail = ring(trail, { lat: d.lat, lon: d.lon }, 1200);
        set({ trail });
      }
    }
  },

  // Q summary frame (logger v7, every 10 s) — merge health counters.
  // Silent except a guarded I2C-error warn: covers gaps when D frames pause
  // (e.g. after a finished 5-min log window) but Q keeps coming.
  applyQ: (q) => {
    const prev = get().tel;
    const cnt = { ...prev.cnt };
    cnt.i2cErr = q.i2c_err; cnt.i2cNacks = q.i2c_nacks; cnt.i2cRec = q.i2c_recoveries;
    cnt.gpsValid = q.gps_valid; cnt.gpsBad = q.gps_bad; cnt.gpsRxBytes = q.gps_rx_bytes;
    cnt.fe = q.gps_uart_fe; cnt.ne = q.gps_uart_ne; cnt.ore = q.gps_uart_ore; cnt.pe = q.gps_uart_pe;
    cnt.ringOvr = q.gps_ring_overrun; cnt.nmeaQOvr = q.nmea_q_overrun;
    cnt.hc12Bp = q.hc12_tx_backpressure; cnt.hc12RxErr = q.hc12_rx_errors;
    cnt.rcBad = q.rc_bad; cnt.ppmGlitch = q.ppm_glitch;
    cnt.ibusErr = q.ibus_frame_err; cnt.ibusCrc = q.ibus_checksum_err; cnt.ibusDrop = q.ibus_frame_drops;
    cnt.logRecords = q.log_records;
    if (prev.cnt.i2cErr !== undefined && (cnt.i2cErr ?? 0) > (prev.cnt.i2cErr ?? 0)) {
      get().pushEvent({ sev: 'warn', title: 'خطای I2C ثبت شد', detail: `شمارنده: ${cnt.i2cErr}` });
    }
    if (prev.cnt.hc12RxErr !== undefined && (cnt.hc12RxErr ?? 0) > (prev.cnt.hc12RxErr ?? 0)) {
      get().pushEvent({ sev: 'warn', title: 'خطای دریافت HC-12 ثبت شد', detail: `شمارنده: ${cnt.hc12RxErr}` });
    }
    set({ tel: { ...prev, fwMs: q.ms, rcFrames: q.rc_frames, cnt } });
  },

  resetTelemetry: () => set({
    tel: { ...T0, ch: [] },
    att: { roll: 0, pitch: 0, yaw: null },
    bat: analyzeBattery(0),
    hist: { alt: [], bat: [], acc: [], gyr: [], mg: [] },
    trail: [],
  }),

  // messages pushed from the Electron main-process ChooserHub ('qfc:chooser')
  chooserApply: (msg) => {
    const ch = get().chooser;
    switch (msg.type) {
      case 'open':
        set({ chooser: { ...ch, open: true, requestId: msg.requestId, ports: msg.ports, waitingNew: !!msg.waitingNew, note: '', remainingMs: msg.remainingMs, lastOutcome: '' } });
        break;
      case 'update': {
        if (msg.requestId !== ch.requestId) return;
        const note = msg.added ? `پورت جدید شناسایی شد: ${msg.added}`
          : msg.removed ? `${msg.removed} قطع شد`
          : ch.note;
        set({ chooser: { ...ch, ports: msg.ports, waitingNew: !!msg.waitingNew, note } });
        break;
      }
      case 'refreshing':
        set({ chooser: { ...ch, note: 'در حال بروزرسانی فهرست COM…' } });
        break;
      case 'note':
        if (msg.requestId === ch.requestId) set({ chooser: { ...ch, note: msg.text } });
        break;
      case 'timeout':
        if (msg.requestId === ch.requestId) set({ chooser: { ...ch, lastOutcome: 'timeout', note: 'هیچ پورت سریالی شناسایی نشد (مدت انتظار به پایان رسید)' } });
        break;
      case 'close': {
        const next: ChooserState = { ...ch, open: false, note: '' };
        if (msg.reason === 'picked' && msg.picked) {
          next.lastPicked = msg.picked;
          try { localStorage.setItem(LAST_COM_KEY, msg.picked.comName); } catch { /* ignore */ }
        }
        next.lastOutcome = msg.reason === 'timeout' ? 'timeout'
          : (msg.reason === 'cancel' || msg.reason === 'superseded') ? 'cancel' : '';
        set({ chooser: next });
        break;
      }
    }
  },

  chooserDismiss: () => set({ chooser: { ...get().chooser, open: false, note: '' } }),
}));

// load persisted settings/calibration (client only)
export function loadPersisted(): void {
  try {
    const s = localStorage.getItem('qfc.settings');
    if (s) useGS.getState().setSettings(JSON.parse(s));
    const c = localStorage.getItem('qfc.cal');
    if (c) useGS.setState({ cal: JSON.parse(c) });
  } catch { /* ignore */ }
}
