// QuadFC Hardware Validation Suite v4.0 — line parser + command table (WEB GCS side)
// Source of truth: quadfc_valsuite_v4/src/{cli,scanner,mpu6050,hmc5883l,ms5611,busstress,hc12,report}.c
// This firmware is TEXT/INTERACTIVE (menu-driven) on USART1 @ 9600 8N1.
// The web GCS must ADAPT to whatever is on the board — never the other way around.

import type { Sev } from './protocol';

export interface QEvent { sev: Sev; title: string; detail?: string; action?: string }

export type VsTestKey =
  | 'SCAN' | 'MPU' | 'GYRO' | 'ACC6' | 'MAG' | 'MAGCAL'
  | 'BARO' | 'BARO60' | 'STRESS' | 'I2CREC' | 'UART' | 'HC12';

export const VS_TEST_FA: Record<VsTestKey, string> = {
  SCAN: 'اسکن کامل I2C',
  MPU: 'آزمون MPU6050',
  GYRO: 'کالیبراسیون ژیرو',
  ACC6: 'کالیبراسیون ۶وجهی شتاب',
  MAG: 'آزمون HMC5883L',
  MAGCAL: 'جادوگر قطب‌نما',
  BARO: 'آزمون MS5611',
  BARO60: 'پایداری بارومتر ۶۰ثانیه',
  STRESS: 'فشار باس ۶۰۰ثانیه',
  I2CREC: 'بازیابی I2C',
  UART: 'آزمون UART1',
  HC12: 'رادیو HC-12',
};

export const VS_TEST_ORDER: VsTestKey[] = [
  'SCAN', 'MPU', 'GYRO', 'ACC6', 'MAG', 'MAGCAL', 'BARO', 'BARO60', 'STRESS', 'I2CREC', 'UART', 'HC12',
];

// names as printed inside the "P" VALIDATION REPORT table
const REPORT_KEY: Record<string, VsTestKey> = {
  'I2C-SCAN': 'SCAN', 'MPU6050': 'MPU', 'GYRO-CAL': 'GYRO', 'ACCEL-6PT': 'ACC6',
  'HMC5883L': 'MAG', 'COMPASS-CAL': 'MAGCAL', 'MS5611': 'BARO', 'BARO-60S': 'BARO60',
  'BUS-STRESS': 'STRESS', 'I2C-RECOVER': 'I2CREC', 'UART': 'UART', 'HC12-WL': 'HC12',
};

// names as printed in "[XXX] verdict:" lines
const VERDICT_KEY: Record<string, VsTestKey> = {
  'MPU': 'MPU', 'MAG': 'MAG', 'BARO': 'BARO', 'BARO STABILITY': 'BARO60',
  'GYRO CAL': 'GYRO', 'ACCEL CAL': 'ACC6', 'COMPASS CAL': 'MAGCAL',
  'STRESS': 'STRESS', 'I2C RECOVERY': 'I2CREC', 'UART1': 'UART',
  'HC12 AT': 'HC12', 'HC12 PING': 'HC12', 'HC12 STREAM': 'HC12',
};

export interface VsCommand { cmd: string; fa: string; desc: string; long?: boolean; interactive?: boolean }

export const VS_COMMANDS: VsCommand[] = [
  { cmd: '?', fa: 'راهنما', desc: 'چاپ منوی فرمان‌ها' },
  { cmd: 'A', fa: 'تست‌های اصلی', desc: 'اسکن + MPU + MAG + BARO + UART پشت‌سرهم' },
  { cmd: 'S', fa: 'اسکن I2C', desc: '۱۰ دور کامل 0x08..0x77' },
  { cmd: 'M', fa: 'MPU6050', desc: 'هویت + کانفیگ + آمار ۱۰۰۰ نمونه' },
  { cmd: 'G', fa: 'کالیبره ژیرو', desc: 'تعاملی — برد کاملاً ساکن، Enter', interactive: true },
  { cmd: 'X', fa: 'کالیبره ۶وجهی', desc: 'تعاملی — ۶ وجه، هرکدام Enter', interactive: true },
  { cmd: 'H', fa: 'HMC5883L', desc: 'هویت + LOCK 3.1 + ۳۰۰ نمونه' },
  { cmd: 'K', fa: 'جادوگر قطب‌نما', desc: 'تعاملی — چرخش کامل برد', interactive: true },
  { cmd: 'B', fa: 'MS5611', desc: 'PROM/CRC + ۵۰ تبدیل با تأخیر درست' },
  { cmd: 'N', fa: 'پایداری بارو', desc: '۶۰ ثانیه سکون کامل', long: true },
  { cmd: 'T', fa: 'فشار باس', desc: '۶۰۰ ثانیه تست هم‌زمان هر سه سنسور', long: true },
  { cmd: 'I', fa: 'بازیابی I2C', desc: 'طوفان NACK + التیام SWRST + بازبینی' },
  { cmd: 'U', fa: 'UART1', desc: 'الگوی TX + شمارنده‌ها (loopback اختیاری)', interactive: true },
  { cmd: 'W', fa: 'HC-12', desc: 'زیرمنو: 1=AT  2=PING  3=STREAM', interactive: true },
  { cmd: 'R', fa: 'ری‌اینیت', desc: 'ریست I2C + تکرار تست‌های اصلی' },
  { cmd: 'P', fa: 'گزارش کامل', desc: 'جدول نتایج + شمارنده‌ها + حکم نهایی' },
];

export interface VsPrompt { text: string; kind: 'y' | 'enter' | 'choice' }

export interface VsDevice { addr: string; name: string; ack: boolean }

export interface VsScanInfo {
  stable: { addr: string; n: number }[];
  unstable: string;
  unknown: string;
  nack: number | null;
  txErr: number | null;
  recov: number | null;
  verdict: string;
}

export interface VsStress {
  t: number; mpu: number; mag: number; baro: number;
  err: number; recov: number; resets: number;
}

export interface VsPatch {
  fw?: string;
  baud?: number | null;
  boot?: { reset?: string; clock?: string; lines?: string };
  scan?: Partial<VsScanInfo>;
  scanFresh?: boolean;
  tests?: Record<string, { status: 'PASS' | 'FAIL' | 'NOT-RUN'; code?: string }>;
  i2c?: Record<string, number>;
  uart?: Record<string, number>;
  calFlags?: Record<string, number>;
  stress?: VsStress | null;
  stressSummaryAppend?: string;
  devicesAppend?: VsDevice[];
  verdict?: string | null;
}

export interface VsParseResult {
  events: QEvent[];
  patch: VsPatch;
  prompt?: VsPrompt | null; // undefined = no change, null = clear prompt (back to CLI)
}

export function isVsLine(line: string): boolean {
  return /Validation Suite|VALIDATION REPORT|Stable ACKed|SYSCLK=/i.test(line);
}

export function isLoggerIdLine(line: string): boolean {
  // case-sensitive on purpose: logger v7 prints "COMMANDS:" uppercase,
  // the v4.0 menu prints "commands:" lowercase
  return /Hardware Logger|Logger v\d/.test(line) || /COMMANDS:/.test(line);
}

function stableList(s: string): { addr: string; n: number }[] {
  const out: { addr: string; n: number }[] = [];
  for (const m of s.matchAll(/0x([0-9A-Fa-f]{2})\(x(\d+)\)/g)) {
    out.push({ addr: `0x${m[1].toUpperCase()}`, n: Number(m[2]) });
  }
  return out;
}

function resetFlagEvent(text: string): QEvent | null {
  if (/IWDG|WWDG|HARD|SOFT|LUMP/i.test(text)) {
    return {
      sev: 'warn',
      title: 'ریست غیرعادی ثبت شده (واچ‌داگ/نرم‌افزاری)',
      detail: text,
      action: 'اگر تکرار شد، پایدار بودن تغذیه 3.3V و سیم GND USB را بررسی کن.',
    };
  }
  if (/POR|PINRST/i.test(text)) {
    return { sev: 'info', title: 'ریست آغاز کار: روشن/خاموش کامل برد', detail: text };
  }
  return null;
}

export function parseVsLine(line: string): VsParseResult {
  const events: QEvent[] = [];
  const patch: VsPatch = {};
  let prompt: VsPrompt | null | undefined;
  let m: RegExpMatchArray | null;

  // ---- banner / boot ----
  if ((m = line.match(/QuadFC Hardware Validation Suite\s*(v[\d.]+)/))) {
    patch.fw = `QuadFC Hardware Validation Suite ${m[1]}`;
    events.push({ sev: 'ok', title: `فریمور روی برد: سوئیت اعتبارسنجی ${m[1]}`, detail: 'منویی/متنی، UART1 با 9600 8N1 — هیچ خروجی موتوری ندارد.' });
    return { events, patch };
  }
  if (/No motor \/ ESC \/ flight code|VALIDATION ONLY/.test(line)) {
    events.push({ sev: 'info', title: 'حالت فقط-اعتبارسنجی (بدون موتور)', detail: 'PB6..PB9 دست‌نخورده می‌ماند.' });
  }
  if ((m = line.match(/^Boot: reset flags\s+(\S+=0x[0-9A-Fa-f]+)\s*->\s*(.+)$/))) {
    patch.boot = { reset: `${m[1]} → ${m[2]}` };
    const ev = resetFlagEvent(line);
    if (ev) events.push(ev);
  }
  if ((m = line.match(/Clock: SYSCLK=(\d+)Hz PCLK1=(\d+)Hz PCLK2=(\d+)Hz \[([A-Za-z]+)\]/))) {
    const ok = m[4] === 'OK' && Number(m[1]) === 72000000;
    patch.boot = { clock: `SYSCLK=${(Number(m[1]) / 1e6).toFixed(0)}MHz PCLK1=${(Number(m[2]) / 1e6).toFixed(0)}MHz PCLK2=${(Number(m[3]) / 1e6).toFixed(0)}MHz [${m[4]}]` };
    if (!ok) {
      events.push({ sev: 'crit', title: 'کلاک برد مطابق پایهٔ قفل‌شده نیست!', detail: line, action: 'کریستال 8MHz خارجی و مسیر HSE/PLL را بررسی کن.' });
    }
  }
  if ((m = line.match(/UART1 ready: (\d+) 8N1/))) {
    patch.baud = Number(m[1]);
  }
  if ((m = line.match(/^I2C2 init done\. Lines: SCL=([HL]) SDA=([HL])/))) {
    patch.boot = { lines: `SCL=${m[1]} SDA=${m[2]}` };
    if (m[1] === 'L' || m[2] === 'L') {
      events.push({
        sev: 'crit', title: 'یک خط I2C هنگام راه‌اندازی روی زمین است!',
        action: 'پول‌آپ 4.7k به 3.3V روی PB10/PB11 و سیم‌کشی باس را چک کن؛ بعد فرمان I.',
      });
    }
  }
  if (/\[I2C\] WARNING: a bus line is LOW at boot/.test(line)) {
    events.push({ sev: 'crit', title: 'خط باس I2C پایین است — دستگاهی آن را نگه داشته', action: 'ماژول‌ها را تک‌تک جدا کن تا مقصر پیدا شود.' });
  }

  // ---- device re-check lists ----
  if ((m = line.match(/^\s\s0x([0-9A-Fa-f]{2})\s+(.+?)\s+(ACK|NACK)$/))) {
    patch.devicesAppend = [{ addr: `0x${m[1].toUpperCase()}`, name: m[2], ack: m[3] === 'ACK' }];
  }

  // ---- I2C scan ----
  if (/\[I2C SCAN\] rounds=(\d+)/.test(line)) {
    patch.scanFresh = true;
  }
  if ((m = line.match(/^Stable ACKed:(.*)$/))) {
    patch.scan = { stable: stableList(m[1]) };
    const list = patch.scan.stable!;
    events.push({
      sev: 'ok',
      title: `دستگاه‌های پایدار: ${list.map(d => `${d.addr}(×${d.n})`).join('  ') || 'هیچ'}`,
    });
  }
  if ((m = line.match(/^Unstable ACKed:\s*(.+)$/))) {
    patch.scan = { unstable: m[1].trim() };
    if (m[1].trim() !== 'none') {
      events.push({ sev: 'warn', title: 'ACK ناپایدار (دستگاه شبح)', detail: m[1].trim(), action: 'پاورسایکل کامل ۱۰ثانیه‌ای و اسکن دوباره با S.' });
    }
  }
  if ((m = line.match(/^Unknown ACKed:\s*(.+)$/))) {
    patch.scan = { unknown: m[1].trim() };
    if (m[1].trim() !== 'none') {
      events.push({ sev: 'warn', title: 'دستگاه ناشناس روی باس ACK می‌دهد', detail: m[1].trim() });
    }
  }
  if ((m = line.match(/^NACK total=(\d+)\s+TXN errors=(\d+)\s+Bus recoveries=(\d+)/))) {
    patch.scan = { nack: Number(m[1]), txErr: Number(m[2]), recov: Number(m[3]) };
    if (Number(m[2]) > 0) {
      events.push({ sev: 'warn', title: `خطای تراکنش I2C حین اسکن: ${m[2]}` });
    }
  }
  if ((m = line.match(/^Scan verdict: (PASS|FAIL)(.*)$/))) {
    patch.scan = { verdict: m[1] };
    events.push(m[1] === 'PASS'
      ? { sev: 'ok', title: 'اسکن I2C: پاس — باس و همهٔ دستگاه‌های انتظاری سالم', detail: m[2].trim() }
      : { sev: 'err', title: 'اسکن I2C: رد شد', detail: line });
  }

  // ---- per-test verdicts ----
  if ((m = line.match(/^\[(MPU|MAG|BARO|BARO STABILITY|GYRO CAL|ACCEL CAL|COMPASS CAL|STRESS|I2C RECOVERY|UART1|HC12 AT|HC12 PING|HC12 STREAM)\] verdict: (PASS|FAIL)/))) {
    const key = VERDICT_KEY[m[1]];
    patch.tests = { [key]: { status: m[2] as 'PASS' | 'FAIL' } };
    events.push(m[2] === 'PASS'
      ? { sev: 'ok', title: `${VS_TEST_FA[key]}: پاس` }
      : { sev: 'err', title: `${VS_TEST_FA[key]}: رد شد`, detail: 'جزئیات در تب کنسول؛ با P گزارش کامل بگیر.' });
  }

  // ---- hard fault signatures ----
  if ((m = line.match(/^\[F ([A-Z0-9-]+)/))) {
    events.push({ sev: 'err', title: `خطای باس I2C: ${m[1]}`, detail: line, action: 'شمارنده‌ها با P و سیم‌کشی/پول‌آپ را بررسی کن.' });
  }
  if (/\[MAG\] LATCH signature/.test(line)) {
    events.push({
      sev: 'crit', title: 'قفل 0xFF در HMC5883L (LATCH معروف)',
      detail: 'سنسور ACK می‌دهد ولی داده‌اش همه 0xFF است.',
      action: 'فقط تغذیهٔ سنسور را کامل قطع و وصل کن (پاورسایکل)، بعد H را دوباره بگیر.',
    });
  }
  if (/UNEXPECTED RESET FLAG RAISED/.test(line)) {
    events.push({ sev: 'err', title: 'ریست غیرمنتظرهٔ MCU حین تست!', detail: line });
  }
  if ((m = line.match(/^Unknown command '(.+)'/))) {
    events.push({ sev: 'info', title: `فریمور فرمان «${m[1]}» را نمی‌شناسد`, action: 'با ؟ منوی همین فریمور را ببین.' });
  }

  // ---- bus stress ----
  if ((m = line.match(/^\[STRESS\] t=(\d+)s mpu=(\d+) mag=(\d+) baro=(\d+) err=(\d+) recov=(\d+) resets=(\d+)/))) {
    patch.stress = { t: Number(m[1]), mpu: Number(m[2]), mag: Number(m[3]), baro: Number(m[4]), err: Number(m[5]), recov: Number(m[6]), resets: Number(m[7]) };
    if (Number(m[7]) > 0) events.push({ sev: 'crit', title: 'MCU حین تست فشار ریست شده!' });
    else if (Number(m[5]) > 0) events.push({ sev: 'warn', title: `خطای I2C حین تست فشار: جمع ${m[5]}` });
  }
  if ((m = line.match(/^(MPU|MAG|BARO)\s*:\s*got=(\d+) expected~?=(\d+)(?: missed=(\d+) err=(\d+) zero=(\d+))?/))) {
    patch.stressSummaryAppend = line;
  }

  // ---- P report ----
  if (/VALIDATION REPORT/.test(line)) {
    events.push({ sev: 'info', title: 'گزارش کامل اعتبارسنجی دریافت شد', detail: 'جدول نتایج در همین تب به‌صورت ساخت‌یافته نمایش داده می‌شود.' });
  }
  if ((m = line.match(/^([A-Z0-9-]+)\s+:\s+(PASS|FAIL|NOT-RUN)(?:\s+\((E_[A-Z0-9_]+)\))?/))) {
    const key = REPORT_KEY[m[1]];
    if (key) {
      patch.tests = { [key]: { status: m[2] as 'PASS' | 'FAIL' | 'NOT-RUN', code: m[3] } };
      if (m[2] === 'FAIL') {
        events.push({ sev: 'err', title: `${VS_TEST_FA[key]}: رد شد (${m[3] ?? 'بدون کد'})` });
      }
    }
  }
  if ((m = line.match(/^errors=(\d+) nack_addr=(\d+) nack_data=(\d+) timeout=(\d+) arlo=(\d+) berr=(\d+) ovr=(\d+) probes=(\d+)/))) {
    patch.i2c = { errors: +m[1], nackAddr: +m[2], nackData: +m[3], timeout: +m[4], arlo: +m[5], berr: +m[6], ovr: +m[7], probes: +m[8] };
  }
  if ((m = line.match(/^busy_heals=(\d+) sda_clears=(\d+) recov_attempts=(\d+) recov_ok=(\d+)/))) {
    patch.i2c = { busyHeals: +m[1], sdaClears: +m[2], recovAttempts: +m[3], recovOk: +m[4] };
  }
  if ((m = line.match(/^\[UART1\] RX counters: noise=(\d+) framing=(\d+) overrun=(\d+) parity=(\d+)/))) {
    patch.uart = { noise: +m[1], framing: +m[2], overrun: +m[3], parity: +m[4] };
    if (+m[1] + +m[2] + +m[3] + +m[4] > 0) {
      events.push({ sev: 'warn', title: 'شمارنده‌های خطای دریافت UART1 صفر نیست', detail: line });
    }
  }
  if ((m = line.match(/^noise=(\d+) framing=(\d+) overrun=(\d+) parity=(\d+)/))) {
    patch.uart = { noise: +m[1], framing: +m[2], overrun: +m[3], parity: +m[4] };
  }
  if ((m = line.match(/^gyro_bias_valid=(\d+) accel6_valid=(\d+) mag_cal_valid=(\d+)/))) {
    patch.calFlags = { gyro: +m[1], acc6: +m[2], mag: +m[3] };
    events.push({
      sev: +m[1] + +m[2] + +m[3] === 3 ? 'ok' : 'info',
      title: 'وضعیت داده‌های کالیبراسیون در RAM',
      detail: `ژیرو=${m[1]} شتاب۶وجهی=${m[2]} قطب‌نما=${m[3]} — با ریست برد از دست می‌روند (خروجی G/X/K را ذخیره کن).`,
    });
  }
  if (/^ALL RUN TESTS PASSED/.test(line)) {
    patch.verdict = 'PASS';
    events.push({ sev: 'ok', title: 'حکم نهایی: همهٔ تست‌های اجراشده پاس شد', detail: 'این گزارش قابل استناد است (COMM PASS ≠ DATA VALID PASS).' });
  }
  if ((m = line.match(/^VERDICT: NOT ACCEPTED - fails=(\d+) not_run=(\d+)/))) {
    patch.verdict = 'FAIL';
    events.push({ sev: 'crit', title: `حکم نهایی: پذیرفته نشد — ${m[1]} رد، ${m[2]} اجرا نشده`, detail: 'ردی‌ها را یکی‌یکی با فرمان مربوط تکرار کن.' });
  }

  // ---- interactive prompts (line flushed without newline) ----
  if (/press y:\s*$/i.test(line)) {
    prompt = { text: line, kind: 'y' };
    events.push({ sev: 'info', title: 'فریمور پرسید: جامپر loopback (PA9→PA10) وصل است؟', detail: 'y = بله / Enter = رد کردن' });
  } else if (/choose:\s*$/i.test(line)) {
    prompt = { text: line, kind: 'choice' };
    events.push({ sev: 'info', title: 'زیرمنوی HC-12: 1=AT  2=PING  3=STREAM', detail: 'پاسخ را از نوار زرد بالای کنسول بفرست.' });
  } else if (/(press Enter|\(\d+s\)):\s*$/i.test(line)) {
    prompt = { text: line, kind: 'enter' };
    events.push({ sev: 'info', title: 'فریمور منتظر Enter است', detail: line.slice(0, 90) });
  }
  if (/^>\s?$/.test(line)) {
    prompt = null; // CLI prompt again — wizard/test finished
  }

  return { events, patch, prompt };
}
