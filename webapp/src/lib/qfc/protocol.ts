// QuadFC Logger v7 protocol parser
// Frame format (from firmware binary string table):
//   D,<seq>,<ms>,... 94 comma-separated integers
//   N,$GPRMC,... / N,$GPGGA,...  (NMEA with prefix)
//   Human text lines: banner, [FAIL]/[WARN], #LOG_DONE, COMMANDS: ...

export const CSV_FIELDS = [
  'seq', 'ms', 'log_elapsed_ms',
  'mpu_ok', 'ax', 'ay', 'az', 'gx', 'gy', 'gz', 'mpu_temp_cC', 'mpu_samples',
  'ax_min', 'ax_max', 'ay_min', 'ay_max', 'az_min', 'az_max',
  'gx_min', 'gx_max', 'gy_min', 'gy_max', 'gz_min', 'gz_max',
  'mag_ok', 'mag_samples', 'mx', 'my', 'mz',
  'mx_min', 'mx_max', 'my_min', 'my_max', 'mz_min', 'mz_max',
  'baro_ok', 'baro_samples', 'p_pa', 'baro_temp_cC', 'baro_d1', 'baro_d2',
  'gps_fix', 'gps_gga_quality', 'gps_sats', 'hdop_centi', 'lat_e7', 'lon_e7',
  'altitude_cm', 'speed_cms', 'course_cdeg', 'utc_hhmmss_milli', 'date_ddmmyy',
  'gps_age_ms', 'gps_fix_age_ms',
  'rc_mode', 'rc_frames', 'rc_channels_count', 'rc_age_ms',
  'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8',
  'ch9', 'ch10', 'ch11', 'ch12', 'ch13', 'ch14',
  'pa4_adc', 'pa4_pin_mV', 'vdd_mV', 'pa4_source_mV',
  'i2c_err', 'i2c_nacks', 'i2c_recoveries',
  'gps_valid', 'gps_bad', 'gps_rx_bytes',
  'gps_uart_fe', 'gps_uart_ne', 'gps_uart_ore', 'gps_uart_pe',
  'gps_ring_overrun', 'nmea_q_overrun', 'hc12_tx_backpressure',
  'rc_bad', 'ppm_glitch', 'ibus_frame_err', 'ibus_checksum_err', 'ibus_frame_drops',
] as const;

export type Frame = Record<string, number>;

export function parseDFrame(line: string): Frame | null {
  if (!line.startsWith('D,')) return null;
  const parts = line.split(',');
  // parts[0]='D' then 94 numeric fields
  if (parts.length < CSV_FIELDS.length + 1) return null;
  const f: Frame = {};
  for (let i = 0; i < CSV_FIELDS.length; i++) {
    const v = Number(parts[i + 1]);
    f[CSV_FIELDS[i]] = isFinite(v) ? v : 0;
  }
  return f;
}

// ---------- Q summary frame (every 10 s) ----------
// Exact order from the v7 firmware binary string table:
//   #Q,ms,gps_rx_bytes,gps_valid,gps_bad,gps_uart_fe,gps_uart_ne,
//   gps_uart_ore,gps_uart_pe,gps_ring_overrun,nmea_q_overrun,i2c_err,
//   i2c_nacks,i2c_recoveries,rc_frames,rc_bad,ppm_glitch,ibus_frame_err,
//   ibus_checksum_err,log_records,hc12_rx_errors,hc12_tx_backpressure,
//   ibus_frame_drops
// (22 values; some terminals paste it without the leading '#')

export const Q_FIELDS = [
  'ms', 'gps_rx_bytes', 'gps_valid', 'gps_bad',
  'gps_uart_fe', 'gps_uart_ne', 'gps_uart_ore', 'gps_uart_pe',
  'gps_ring_overrun', 'nmea_q_overrun',
  'i2c_err', 'i2c_nacks', 'i2c_recoveries',
  'rc_frames', 'rc_bad', 'ppm_glitch',
  'ibus_frame_err', 'ibus_checksum_err', 'log_records',
  'hc12_rx_errors', 'hc12_tx_backpressure', 'ibus_frame_drops',
] as const;

export function parseQFrame(line: string): Frame | null {
  const m = line.match(/^#?Q,(-?\d+(?:,-?\d+){10,})$/);
  if (!m) return null;
  const parts = m[1].split(',');
  if (parts.length < Q_FIELDS.length) return null;
  const f: Frame = {};
  for (let i = 0; i < Q_FIELDS.length; i++) {
    const v = Number(parts[i]);
    f[Q_FIELDS[i]] = isFinite(v) ? v : 0;
  }
  return f;
}

// ---------- NMEA ----------

export interface NmeaData {
  valid: boolean;
  fix: number;          // GGA quality (0=none) / RMC A=1
  sats: number;
  hdop: number | null;
  lat: number | null; lon: number | null;
  altM: number | null;
  speedKmh: number | null;
  courseDeg: number | null;
  utc: string;
  date: string;
  kind: string;
}

function nmeaChecksumOk(body: string): boolean {
  const star = body.lastIndexOf('*');
  if (star < 2) return false;
  const hex = body.slice(star + 1, star + 3);
  if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return false;
  let cs = 0;
  for (let i = 1; i < star; i++) cs ^= body.charCodeAt(i);
  return cs === parseInt(hex, 16);
}

function nmeaCoord(v: string, hemi: string): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  // ddmm.mmmm
  const deg = Math.floor(n / 100);
  const min = n - deg * 100;
  let out = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') out = -out;
  return out;
}

export function parseNmea(raw: string): NmeaData | null {
  let line = raw.trim();
  if (line.startsWith('N,')) line = line.slice(2);
  if (!line.startsWith('$')) return null;
  if (!nmeaChecksumOk(line)) return null;
  const star = line.lastIndexOf('*');
  const body = line.slice(1, star);
  const p = body.split(',');
  const talker = p[0].slice(0, 2);
  const type = p[0].slice(2);
  const d: NmeaData = {
    valid: false, fix: 0, sats: 0, hdop: null, lat: null, lon: null,
    altM: null, speedKmh: null, courseDeg: null, utc: '', date: '', kind: `${talker}${type}`,
  };
  if (type === 'GGA') {
    d.utc = p[1] ? `${p[1].slice(0, 2)}:${p[1].slice(2, 4)}:${p[1].slice(4, 6)}` : '';
    d.fix = parseInt(p[6] || '0', 10) || 0;
    d.sats = parseInt(p[7] || '0', 10) || 0;
    d.hdop = p[8] ? parseFloat(p[8]) : null;
    d.lat = nmeaCoord(p[2], p[3]);
    d.lon = nmeaCoord(p[4], p[5]);
    d.altM = p[9] ? parseFloat(p[9]) : null;
    d.valid = d.fix > 0;
  } else if (type === 'RMC') {
    d.valid = p[2] === 'A';
    d.fix = d.valid ? 1 : 0;
    d.utc = p[1] ? `${p[1].slice(0, 2)}:${p[1].slice(2, 4)}:${p[1].slice(4, 6)}` : '';
    d.lat = nmeaCoord(p[3], p[4]);
    d.lon = nmeaCoord(p[5], p[6]);
    if (p[7]) d.speedKmh = parseFloat(p[7]) * 1.852;
    if (p[8]) d.courseDeg = parseFloat(p[8]);
    if (p[9] && p[9].length === 6) d.date = `20${p[9].slice(4)}-${p[9].slice(2, 4)}-${p[9].slice(0, 2)}`;
  } else {
    return null; // GSA/GSV/VTG etc. not needed for now
  }
  return d;
}

// ---------- Log text splitting (paste/replay) ----------

// Removes PuTTY wrap padding + RTL marks, then recovers D-frames and NMEA in order.
export function splitLogTokens(text: string): string[] {
  const clean = text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  const merged = clean.replace(/[ \t]+/g, '').replace(/\r/g, '').replace(/\n/g, '');
  type Tok = { i: number; s: string };
  const toks: Tok[] = [];
  for (const m of merged.matchAll(/D,-?\d+(?:,-?\d+){20,}/g)) toks.push({ i: m.index!, s: m[0] });
  for (const m of merged.matchAll(/#?Q,-?\d+(?:,-?\d+){15,}/g)) toks.push({ i: m.index!, s: m[0] });
  for (const m of merged.matchAll(/N,\$[ -~]{10,}?\*[0-9A-Fa-f]{2}/g)) toks.push({ i: m.index!, s: m[0] });
  toks.sort((a, b) => a.i - b.i);
  return toks.map(t => t.s);
}

// Live lines may carry stray spaces / control chars
export function cleanLiveLine(line: string): string {
  return line.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

// ---------- Persian smart-event dictionary ----------

export type Sev = 'ok' | 'info' | 'warn' | 'err' | 'crit';
export interface QEvent {
  sev: Sev; title: string; detail?: string; action?: string;
}

interface Rule { re: RegExp; ev: (m: RegExpMatchArray) => QEvent | null }

const RULES: Rule[] = [
  {
    re: /QuadFC .*Logger v([\d.]+)/,
    ev: m => ({
      sev: 'ok',
      title: `اتصال با لاگر سخت‌افزاری v${m[1]} برقرار شد`,
      detail: 'فریم‌های D، هر ۵۰۰ میلی‌ثانیه یک رکورد کامل می‌فرستد.',
    }),
  },
  {
    re: /NO MOTOR OUTPUT/,
    ev: () => ({ sev: 'info', title: 'حالت فقط-تست (بدون موتور)', detail: 'این فریمور به هیچ پین موتوری خروجی نمی‌دهد — PB6..PB9 دست‌نخورده است.' }),
  },
  {
    re: /HSI FALLBACK/,
    ev: () => ({
      sev: 'crit', title: 'کریستال خارجی کار نمی‌کند — روی کلاک داخلی افتاده!',
      detail: 'فرکانس دقیق UART و تایمرها خراب می‌شود.',
      action: 'سیم‌کشی/لحیم کریستال 8MHz و دو خازن 22pF را چک کن؛ مدار OSC-IN/OUT.',
    }),
  },
  {
    re: /\[FAIL\] SCL\/SDA stuck low/i,
    ev: () => ({
      sev: 'crit', title: 'خطوط I2C روی زمین گیر کرده‌اند',
      detail: 'یکی از دستگاه‌ها یا سیم‌کشی، SCL/SDA را پایین نگه داشته است.',
      action: '۱) پول‌آپ 4.7k به 3.3V روی PB10 و PB11. ۲) سیم‌های باس را کوتاه کن. ۳) ماژول‌ها را تک‌تک جدا کن تا مقصر پیدا شود.',
    }),
  },
  {
    re: /BUS NOT IDLE; trying 9-clock recovery/i,
    ev: () => ({
      sev: 'warn', title: 'باس I2C آزاد نبود — بازیابی ۹-پالس اجرا شد',
      detail: 'یک دستگاه وسط ارسال قفل شده بود؛ فریمور تلاش کرد آزادش کند.',
    }),
  },
  {
    re: /suspicious ACK count/i,
    ev: () => ({
      sev: 'crit', title: 'ACK های دروغین روی باس! نتیجه اسکن قابل اعتماد نیست',
      detail: 'تعداد دستگاه‌های شناسایی‌شده از انتظار خیلی بیشتر است (آدرس‌های خیالی).',
      action: 'کامل برق را قطع کن (۱۰ ثانیه، نه فقط RESET) و دوباره اسکن بگیر. اگر نرفت: همه ماژول‌ها را جدا کن و با باس خالی اسکن کن.',
    }),
  },
  {
    re: /Expected for this build: ([^.]*)/,
    ev: m => ({ sev: 'info', title: 'دستگاه‌های مورد انتظار روی باس', detail: `آدرس‌های معمول: ${m[1]}` }),
  },
  {
    re: /PROM CRC OK/,
    ev: () => ({ sev: 'ok', title: 'بارومتر MS5611 سالم است', detail: 'مجموعه PROM و CRC درست خوانده شد.' }),
  },
  {
    re: /NOT DETECTED\/PROM CRC FAIL/,
    ev: () => ({
      sev: 'err', title: 'سنسور روی باس شناسایی نشد (یا CRC خراب)',
      action: 'سیم‌کشی و تغذیه ماژول را چک کن؛ ماژول را از باس جدا و دوباره وصل کن.',
    }),
  },
  {
    re: /NOT DETECTED\/NOT HMC ID/,
    ev: () => ({
      sev: 'err', title: 'مگنتومتر HMC5883L شناسایی نشد',
      detail: 'شناسهٔ ID نباید «H43» برگردد.',
      action: 'آدرس 0x1E و اتصال ماژول را چک کن.',
    }),
  },
  {
    re: /\[WARN\] receiver frames absent\/stale/i,
    ev: () => ({
      sev: 'info', title: 'گیرنده RC دیتا نمی‌فرستد (یا وصل نیست)',
      detail: 'ورودی RC روی PA0 است (PPM یا iBUS).',
      action: 'خروجی گیرنده را به PA0 بده و مُد را با فرمان p (PPM) یا i (iBUS) ست کن.',
    }),
  },
  {
    re: /VDD estimate outside broad range/i,
    ev: () => ({
      sev: 'warn', title: 'تخمین ولتاژ 3.3V خارج از محدوده است',
      detail: 'تخمین از ولتاژ مرجع داخلی ADC انجام می‌شود.',
      action: 'با مولتی‌متر 3.3V برد را اندازه بگیر.',
    }),
  },
  {
    re: /PA4 ADC near full scale/i,
    ev: () => ({
      sev: 'warn', title: 'ورودی ADC باتری نزدیک سقف است',
      detail: 'ولتاژ گرهٔ PA4 نباید از 3.3V بیشتر شود.',
      action: 'مقسّم (100k/33k) را چک کن؛ ورودی بالای مقسّم وصل است نه خروجی آن.',
    }),
  },
  {
    re: /\[RC\] input mode set to PPM/i,
    ev: () => ({ sev: 'ok', title: 'ورودی RC روی PPM تنظیم شد (PA0)' }),
  },
  {
    re: /\[RC\] input mode set to iBUS/i,
    ev: () => ({ sev: 'ok', title: 'ورودی RC روی iBUS تنظیم شد (PA0)' }),
  },
  {
    re: /#LOG_DONE,records=(\d+)/,
    ev: m => ({ sev: 'ok', title: `یک دورهٔ ۵ دقیقه‌ای لاگ کامل شد (${m[1]} رکورد)`, detail: 'برای دورهٔ جدید فرمان L را بفرست.' }),
  },
  {
    re: /#LOG_STOP/,
    ev: () => ({ sev: 'warn', title: 'لاگ متوقف شد', action: 'با فرمان L دوباره شروع کن.' }),
  },
  {
    re: /\[FAIL\]\s*(.+)/,
    ev: m => ({ sev: 'err', title: 'خطای سخت‌افزاری گزارش شد', detail: m[1].trim() }),
  },
  {
    re: /\[WARN\]\s*(.+)/,
    ev: m => ({ sev: 'warn', title: 'هشدار فریمور', detail: m[1].trim() }),
  },
];

export function interpretText(line: string): QEvent[] {
  const out: QEvent[] = [];
  for (const r of RULES) {
    const m = line.match(r.re);
    if (m) {
      const ev = r.ev(m);
      if (ev) out.push(ev);
    }
  }
  return out;
}

// ---------- commands of logger v7 ----------
export const COMMANDS: { cmd: string; fa: string; desc: string; danger?: boolean }[] = [
  { cmd: '?', fa: 'راهنما', desc: 'چاپ لیست فرمان‌ها' },
  { cmd: 'd', fa: 'عیب‌یابی', desc: 'گزارش کامل سنسورها و باس' },
  { cmd: 's', fa: 'اسکن I2C', desc: 'اسکن ۳ دور PB10/PB11' },
  { cmd: 'g', fa: 'گزارش GPS', desc: 'وضعیت USART2 و جمله‌های NMEA' },
  { cmd: 'r', fa: 'گزارش RC', desc: 'فریم‌ها، کانال‌ها و خطاهای گیرنده' },
  { cmd: 'v', fa: 'ولتاژ', desc: 'ADC باتری روی PA4 و تخمین VDD' },
  { cmd: 'p', fa: 'مُد PPM', desc: 'ورودی RC = PPM روی PA0' },
  { cmd: 'i', fa: 'مُد iBUS', desc: 'ورودی RC = iBUS روی PA0' },
  { cmd: 'L', fa: 'شروع لاگ', desc: 'شروع دوبارهٔ لاگ ۵ دقیقه‌ای' },
  { cmd: 'x', fa: 'توقف لاگ', desc: 'توقف ارسال فریم‌ها' },
  { cmd: 'c', fa: 'صفر کردن شمارنده‌ها', desc: 'ریست شمارنده‌های خطا' },
  { cmd: 't', fa: 'تست RGB', desc: 'چشمک LED روی PA6/PA7/PB0' },
];
