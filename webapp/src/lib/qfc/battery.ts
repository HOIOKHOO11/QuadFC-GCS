// Smart LiPo battery analysis: cell-count detection + charge percent
// Ranges per chemistry (per cell): usable 3.30V .. full 4.20V (charger may reach 4.25V)
const NOMINAL_LO = 3.3;
const FULL_HI = 4.28; // includes fresh-off-charger cells

// Per-cell voltage -> percent (piecewise linear, LiPo approximation)
const TABLE: [number, number][] = [
  [3.27, 0], [3.5, 4], [3.55, 7], [3.6, 12], [3.65, 19], [3.7, 28],
  [3.75, 40], [3.77, 45], [3.8, 52], [3.82, 57], [3.85, 64], [3.87, 68],
  [3.9, 74], [3.92, 79], [3.95, 84], [3.98, 88], [4.0, 91], [4.03, 94],
  [4.06, 96], [4.1, 98], [4.15, 99.5], [4.2, 100],
];

export interface BatteryInfo {
  cells: number | null;
  label: string;          // e.g. "3S" or "؟"
  perCell: number | null; // volts
  percent: number | null; // 0..100
  state: 'ok' | 'warn' | 'crit' | 'unknown';
  stateFa: string;
}

function pctPerCell(v: number): number {
  if (v <= TABLE[0][0]) return 0;
  if (v >= TABLE[TABLE.length - 1][0]) return 100;
  for (let i = 1; i < TABLE.length; i++) {
    const [v1, p1] = TABLE[i];
    const [v0, p0] = TABLE[i - 1];
    if (v <= v1) return p0 + ((v - v0) / (v1 - v0)) * (p1 - p0);
  }
  return 0;
}

export function analyzeBattery(vbatMv: number): BatteryInfo {
  if (!isFinite(vbatMv) || vbatMv <= 100) {
    return { cells: null, label: '؟', perCell: null, percent: null, state: 'unknown', stateFa: 'بدون داده' };
  }
  const v = vbatMv / 1000;
  let cells: number | null = null;
  for (const n of [2, 3, 4, 5, 6]) {
    if (v >= n * NOMINAL_LO - 0.06 && v <= n * FULL_HI) { cells = n; break; }
  }
  if (cells === null) {
    // below 2S floor => nearly dead or divider not connected
    if (v < 2 * NOMINAL_LO) {
      return { cells: null, label: '؟', perCell: null, percent: 0, state: 'crit', stateFa: 'خیلی خالی / بدون منبع' };
    }
    return { cells: null, label: '؟', perCell: null, percent: null, state: 'unknown', stateFa: 'نامشخص' };
  }
  const perCell = v / cells;
  const percent = Math.round(pctPerCell(perCell));
  let state: BatteryInfo['state'] = 'ok';
  let stateFa = 'سلامت';
  if (percent < 10 || perCell < 3.4) { state = 'crit'; stateFa = 'بحرانی — باتری را شارژ کن'; }
  else if (percent < 25 || perCell < 3.55) { state = 'warn'; stateFa = 'کم — به‌زودی شارژ'; }
  return { cells, label: `${cells}S`, perCell, percent, state, stateFa };
}
