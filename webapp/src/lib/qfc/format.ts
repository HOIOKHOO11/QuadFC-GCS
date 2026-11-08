// Small formatting helpers (Persian UI, Latin digits for telemetry)

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function fmt(v: number | null | undefined, digits = 1, dash = '—'): string {
  if (v === null || v === undefined || !isFinite(v)) return dash;
  return v.toFixed(digits);
}

export function fmtInt(v: number | null | undefined, dash = '—'): string {
  if (v === null || v === undefined || !isFinite(v)) return dash;
  return Math.round(v).toLocaleString('en-US');
}

export function timeStr(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function msUp(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m % 60)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

const DIRS_FA = ['شمال', 'شمال‌شرقی', 'شرق', 'جنوب‌شرقی', 'جنوب', 'جنوب‌غربی', 'غرب', 'شمال‌غربی'];

export function headingDirFa(deg: number | null): string {
  if (deg === null || !isFinite(deg)) return '—';
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return DIRS_FA[i];
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function latLonStr(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null || lat === 0 || lon === 0) return '—';
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function utcFromField(f: number): string {
  // utc_hhmmss_milli e.g. 123519120 -> 12:35:19
  if (!f || f <= 0) return '';
  const hh = Math.floor(f / 10000000) % 100;
  const mm = Math.floor(f / 100000) % 100;
  const ss = Math.floor(f / 1000) % 100;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

export function dateFromField(f: number): string {
  // date_ddmmyy e.g. 91126 -> 2026-11-09
  if (!f || f <= 0) return '';
  const s = String(f).padStart(6, '0');
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yy = s.slice(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

export function baroAltitudeM(pPa: number, p0Pa: number): number {
  if (!pPa || pPa <= 30000 || pPa > 120000) return NaN;
  return 44330 * (1 - Math.pow(pPa / p0Pa, 0.1902949572));
}
