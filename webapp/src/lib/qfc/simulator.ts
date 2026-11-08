'use client';

// Synthetic telemetry generator: produces REAL logger-v7 frames (D, + N, NMEA)
// and feeds them through the normal parser, so the whole UI is exercised.

import type { Frame } from './protocol';

const FIELD_ORDER = [
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

function nmeaLine(body: string): string {
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`;
}

export class Simulator {
  private timer: number | null = null;
  private nmeaTimer: number | null = null;
  private seq = 1;
  private ms = 0;
  private t0 = Date.now();

  constructor(private emit: (line: string) => void) {}

  start(): void {
    this.stop();
    this.t0 = Date.now();
    this.seq = 1;
    this.ms = 500;
    this.emit('QuadFC HC-12 Hardware Logger v7.0 [SIM]');
    this.emit('STM32F103C8T6 | VALIDATION ONLY | NO MOTOR OUTPUT');
    this.timer = window.setInterval(() => this.tick(), 500);
    this.nmeaTimer = window.setInterval(() => this.emitNmea(), 1000);
  }

  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.nmeaTimer !== null) { window.clearInterval(this.nmeaTimer); this.nmeaTimer = null; }
  }

  private tick(): void {
    const t = (Date.now() - this.t0) / 1000;
    const roll = 11 * Math.sin(t * 0.9) + 1.5 * Math.sin(t * 4.3);
    const pitch = 7 * Math.sin(t * 0.6 + 1) + Math.sin(t * 3.7);
    const yaw = (t * 14) % 360;
    const rr = roll * Math.PI / 180, pr = pitch * Math.PI / 180;
    const g = 16384;
    const ax = Math.round(-g * Math.sin(pr) + (Math.random() - 0.5) * 120);
    const ay = Math.round(g * Math.sin(rr) * Math.cos(pr) + (Math.random() - 0.5) * 120);
    const az = Math.round(g * Math.cos(rr) * Math.cos(pr) + (Math.random() - 0.5) * 120);
    const gx = Math.round(roll * 0.8 + (Math.random() - 0.5) * 40);
    const gy = Math.round(pitch * 0.8 + (Math.random() - 0.5) * 40);
    const gz = Math.round((Math.random() - 0.5) * 30 + Math.cos(t * 0.9) * 60);
    const yr = yaw * Math.PI / 180;
    const mx = Math.round(Math.cos(yr) * 220 + 20);
    const my = Math.round(Math.sin(yr) * 220 - 35);
    const mz = Math.round(390 + 8 * Math.sin(t * 0.3));
    const alt = 1214 + 2.5 * Math.sin(t * 0.15);
    const pPa = Math.round(101325 * Math.pow(1 - alt / 44330, 5.255));
    const speedKmh = 6 + 4 * Math.sin(t * 0.4);
    const course = (yaw + 12) % 360;
    const vbat = 8120 - Math.round((t * 0.8) % 600); // slow 2S drain
    const chBase = (v: number) => Math.max(980, Math.min(2020, v));
    const f: Frame = {
      seq: this.seq++, ms: Math.round(this.ms += 500), log_elapsed_ms: Math.round((Date.now() - this.t0) % 300000),
      mpu_ok: 1, ax, ay, az, gx, gy, gz,
      mpu_temp_cC: Math.round(2750 + 30 * Math.sin(t * 0.05)), mpu_samples: 500,
      ax_min: ax - 60, ax_max: ax + 60, ay_min: ay - 60, ay_max: ay + 60, az_min: az - 60, az_max: az + 60,
      gx_min: gx - 30, gx_max: gx + 30, gy_min: gy - 30, gy_max: gy + 30, gz_min: gz - 30, gz_max: gz + 30,
      mag_ok: 1, mag_samples: 40, mx, my, mz,
      mx_min: mx - 15, mx_max: mx + 15, my_min: my - 15, my_max: my + 15, mz_min: mz - 15, mz_max: mz + 15,
      baro_ok: 1, baro_samples: 25,
      p_pa: pPa, baro_temp_cC: Math.round(2680 + 20 * Math.sin(t * 0.02)),
      baro_d1: Math.round(pPa * 7.9), baro_d2: 8411990,
      gps_fix: 1, gps_gga_quality: 1, gps_sats: 9, hdop_centi: 92,
      lat_e7: Math.round((35.715298 + 0.00002 * Math.sin(t * 0.1)) * 1e7),
      lon_e7: Math.round((51.404343 + 0.00002 * Math.cos(t * 0.1)) * 1e7),
      altitude_cm: Math.round(alt * 100), speed_cms: Math.round(speedKmh / 3.6 * 100),
      course_cdeg: Math.round(course * 10),
      utc_hhmmss_milli: (() => { const d = new Date(); return (d.getUTCHours() * 10000 + d.getUTCMinutes() * 100 + d.getUTCSeconds()) * 1000; })(),
      date_ddmmyy: (() => { const d = new Date(); return d.getUTCDate() * 10000 + (d.getUTCMonth() + 1) * 100 + (d.getUTCFullYear() % 100); })(),
      gps_age_ms: 120, gps_fix_age_ms: 120,
      rc_mode: 1, rc_frames: 250 * this.seq, rc_channels_count: 8, rc_age_ms: 20,
      ch1: chBase(1500 + roll * 12), ch2: chBase(1500 + pitch * 12), ch3: 1600, ch4: chBase(1500 + Math.sin(yr * Math.PI / 180) * 80),
      ch5: 1000, ch6: 2000, ch7: 1500, ch8: 1500, ch9: 0, ch10: 0, ch11: 0, ch12: 0, ch13: 0, ch14: 0,
      pa4_adc: Math.round(vbat / 4.03 / (3.3 / 4095)), pa4_pin_mV: Math.round(vbat / 4.03), vdd_mV: 3298,
      pa4_source_mV: vbat,
      i2c_err: 0, i2c_nacks: 0, i2c_recoveries: 0,
      gps_valid: 340 * this.seq, gps_bad: 0, gps_rx_bytes: 480 * this.seq,
      gps_uart_fe: 0, gps_uart_ne: 0, gps_uart_ore: 0, gps_uart_pe: 0,
      gps_ring_overrun: 0, nmea_q_overrun: 0, hc12_tx_backpressure: 0,
      rc_bad: 0, ppm_glitch: 0, ibus_frame_err: 0, ibus_checksum_err: 0, ibus_frame_drops: 0,
    };
    this.emit('D,' + FIELD_ORDER.map(k => f[k]).join(','));
  }

  private emitNmea(): void {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const utc = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.00`;
    const dt = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${String(d.getUTCFullYear() % 100)}`;
    const lat = 35.715298, lon = 51.404343;
    const latS = `${p2(Math.floor(lat))}${(lat % 1 * 60).toFixed(4).padStart(7, '0')},N`;
    const lonS = `${p2(Math.floor(lon))}${(lon % 1 * 60).toFixed(4).padStart(7, '0')},E`;
    this.emit('N,' + nmeaLine(`GPGGA,${utc},${latS},${lonS},1,09,0.9,1214.5,M,10.2,M,,`));
    this.emit('N,' + nmeaLine(`GPRMC,${utc},A,${latS},${lonS},12.5,214.3,${dt},,,A`));
  }
}

// =====================================================================
// VsSimulator — replays the REAL Validation Suite v4.0 output pattern
// (from quadfc_valsuite_v4 sources + docs/SAMPLE_LOGS.md) with
// compressed timing, including interactive prompts (G/X/K/U/W).
// =====================================================================
export class VsSimulator {
  private timers: number[] = [];
  private pend: ((input: string) => void) | null = null;

  constructor(private emit: (line: string) => void) {}

  start(): void {
    this.stop();
    this.seq([
      [0, () => {
        this.emit('==================================================');
        this.emit('  QuadFC Hardware Validation Suite v4.0  [SIM]');
        this.emit('  STM32F103C8T6 bare-metal @72MHz - VALIDATION ONLY');
        this.emit('  No motor / ESC / flight code exists in this build.');
        this.emit('==================================================');
        this.emit('Boot: reset flags RCC_CSR=0x0C000000 -> POR PINRST [cold power-up]');
        this.emit('Clock: SYSCLK=72000000Hz PCLK1=36000000Hz PCLK2=72000000Hz [OK]');
        this.emit('UART1 ready: 9600 8N1. Type ? for the command menu.');
        this.emit('I2C2 init done. Lines: SCL=H SDA=H');
      }],
      [400, () => {
        this.emit('[I2C] device re-check:');
        this.emit('  0x68 MPU6050 ACK');
        this.emit('  0x69 MPU6050(AD0=H) NACK');
        this.emit('  0x1E HMC5883L ACK');
        this.emit('  0x77 MS5611 ACK');
        this.emit('LED blinks while firmware runs (not a comm indicator).');
        this.emit('> ');
      }],
    ]);
  }

  stop(): void {
    this.timers.forEach(t => window.clearTimeout(t));
    this.timers = [];
    this.pend = null;
  }

  // schedule [delayMs, fn] steps sequentially
  private seq(steps: [number, () => void][]): void {
    let acc = 0;
    for (const [d, fn] of steps) {
      acc += d;
      const at = acc;
      this.timers.push(window.setTimeout(fn, at));
    }
  }

  private out(lines: string[]): void {
    this.seq(lines.map(l => [10, () => this.emit(l)] as [number, () => void]));
  }

  private ask(promptLines: string[], then: (input: string) => void): void {
    this.out(promptLines);
    this.pend = then;
  }

  handle(cmdRaw: string): void {
    const cmd = cmdRaw.trim();
    if (this.pend) {
      const p = this.pend;
      this.pend = null;
      p(cmd);
      return;
    }
    switch (cmd[0]) {
      case '?': this.menu(); break;
      case 'A': this.doScan(); this.seq([[400, () => this.doMpu()], [2600, () => this.doMag()], [2400, () => this.doBaro()], [2000, () => this.doUart(false)]]); break;
      case 'S': this.doScan(); break;
      case 'M': this.doMpu(); break;
      case 'G': this.doGyroCal(); break;
      case 'X': this.doAccel6(); break;
      case 'H': this.doMag(); break;
      case 'K': this.doCompassCal(); break;
      case 'B': this.doBaro(); break;
      case 'N': this.doBaro60(); break;
      case 'T': this.doStress(); break;
      case 'I': this.doRecovery(); break;
      case 'U': this.doUart(true); break;
      case 'W': this.ask(['[HC12] STAGE 2 wiring required (see GUIDE_STAGE2_FA.md)', '[HC12] 1=AT check 2=PING 3=STREAM - choose:'], sel => {
        if (sel === '1') this.doHc12At();
        else if (sel === '2') this.doHc12Ping();
        else if (sel === '3') this.doHc12Stream();
        else this.out(['[HC12] unknown choice', '> ']);
      }); break;
      case 'R': this.out(['[R] re-initializing I2C and re-running core tests', '[R] lines: SCL=H SDA=H']); this.doScan(); break;
      case 'P': this.doReport(); break;
      default: this.out([`Unknown command '${cmd[0] ?? ''}' (? for menu)`, '> ']);
    }
  }

  private menu(): void {
    this.out([
      '',
      'QuadFC Validation Suite v4.0 - commands:',
      ' ?  this menu                A  run all non-interactive diagnostics',
      ' S  full I2C scan (10 rounds)      M  MPU6050 diagnostics',
      ' G  gyro calibration (still)       X  accel 6-point calibration',
      ' H  HMC5883L + LOCK 3.1 check      K  compass calibration wizard',
      ' B  MS5611 PROM/CRC/compensation   T  shared-bus stress 600 s',
      ' I  I2C recovery test              U  UART diagnostics',
      ' W  HC-12 wireless test (STAGE 2)  R  re-init I2C + rerun core tests',
      ' P  print full validation report',
      '> ',
    ]);
  }

  private doScan(): void {
    this.out([
      '[I2C SCAN] rounds=10 range=0x08..0x77 (112 addresses)',
      'progress: ..........',
      '[I2C SCAN] result',
      'Stable ACKed: 0x1E(x10) 0x68(x10) 0x77(x10)',
      'Unstable ACKed: none',
      'Unknown ACKed: none',
      'Expected devices: MPU6050@0x68=ACK  HMC5883L@0x1E=ACK  MS5611@0x77=ACK',
      '0x69 not ACKed = normal when AD0=GND (not an error)',
      `NACK total=${1090 + Math.floor(Math.random() * 6)}  TXN errors=0  Bus recoveries=0`,
      'Lines idle: SCL=H SDA=H',
      'Scan verdict: PASS (bus OK, all expected devices ACK)',
      '> ',
    ]);
  }

  private doMpu(): void {
    const t = 2631 + Math.floor((Math.random() - 0.5) * 40);
    this.out([
      '[MPU6050 TEST]',
      '[MPU] addr=0x68 WHO_AM_I=0x68 (OK)',
      '[MPU] config verified by read-back (PWR/DIV/CFG/GYRO/ACCEL)',
      `[MPU] burst: ACC=(312,-248,16301) GYRO=(-42,17,-8) T=${t} x100C`,
      '[MPU] collecting 1000 samples (DRDY-gated)...',
      '.....',
      '[MPU] n=1000 elapsed=10012 ms measured_rate_x10=999 (nominal 100 Hz)',
      'axis     mean  min  max  sigma  LSB (converted)',
      'accX  mean=305 min=-1180 max=1780 sigma=12 LSB (18 milli-unit)',
      'accY  mean=-251 min=-1760 max=1210 sigma=11 LSB (-15 milli-unit)',
      'accZ  mean=16298 min=15120 max=17410 sigma=9 LSB (994 milli-unit)',
      'gyrX  mean=-41 min=-96 max=22 sigma=5 LSB (-313 milli-unit)',
      'gyrY  mean=17 min=-40 max=75 sigma=4 LSB (129 milli-unit)',
      'gyrZ  mean=-8 min=-64 max=48 sigma=4 LSB (-61 milli-unit)',
      'zero_frames=0  frame_errors=0',
      '[MPU] verdict: PASS',
      '> ',
    ]);
  }

  private doMag(): void {
    this.out([
      '[HMC5883L TEST]',
      "[MAG] ID='H43' raw=483433",
      '[MAG] config verified (CRA=0x18 CRB=0x20 MODE=0x00)',
      '[MAG] LOCK 3.1 special check (20 rapid read cycles)',
      '[MAG] LOCK_after_read=0/20  stale_data=0/20',
      '[MAG] collecting 300 samples...',
      '......',
      '[MAG] n=300 measured_rate_x10=748 (nominal 75 Hz)',
      '[MAG] X: min=-842 max=4150 span=4992 sigma=161 LSB',
      '[MAG] Y: min=-1290 max=3644 span=4934 sigma=155 LSB',
      '[MAG] Z: min=-3810 max=920 span=4730 sigma=148 LSB',
      '[MAG] zero_data=0  saturation=0',
      '[MAG] verdict: PASS',
      '[MAG] NOTE: heading not valid until K wizard passes.',
      '> ',
    ]);
  }

  private doBaro(): void {
    this.out([
      '[MS5611 TEST]',
      '[BARO] addr=0x77 ACK (no BMP280 signature)',
      '[BARO] PROM: 081C D1F4 D1E4 814D 760C 7D03 6B10 BBBF CRC=OK',
      '[BARO] repeat conversions x50 (OSR=4096, correct delays)',
      '.....',
      '[BARO] sample D1=6464448 D2=8072536',
      '[BARO] T: mean=2312 min=2308 max=2318 sigma_x100=2 (x100C)',
      '[BARO] P: mean=101312 min=101298 max=101326 sigma=6 Pa',
      '[BARO] verdict: PASS',
      '> ',
    ]);
  }

  private doGyroCal(): void {
    this.ask(['[GYRO CAL] Keep the board PERFECTLY STILL.', 'press Enter when ready (120s): '], () => {
      this.seq([
        [600, () => this.emit('[GYRO CAL] collecting 2000 samples...')],
        [1200, () => {
          this.emit('[GYRO CAL] gx_bias=-41 gy_bias=17 gz_bias=-8 (LSB)');
          this.emit('[GYRO CAL] sigma=6 LSB (limit 30)');
          this.emit('[GYRO CAL] verdict: PASS (coefficients in RAM, exported above)');
          this.emit('[GYRO CAL] NOTE: CALIBRATION PASS != FLIGHT READY');
          this.emit('> ');
        }],
      ]);
    });
  }

  private doAccel6(): void {
    const faces = ['+Z down', '-Z down', '+X down', '-X down', '+Y down', '-Y down'];
    let step = 0;
    this.out(['[ACCEL 6-POINT CAL] one face at a time, board STILL on a flat block.']);
    const askFace = () => {
      if (step >= 6) {
        this.out([
          '[ACCEL CAL] scale: 0.994 1.003 0.991 (limits 0.85..1.15)',
          '[ACCEL CAL] verdict: PASS (offsets+scale in RAM, exported above)',
          '[ACCEL CAL] NOTE: CALIBRATION PASS != FLIGHT READY',
          '> ',
        ]);
        return;
      }
      this.ask([`[ACCEL CAL] face ${step + 1}/6 (${faces[step]}) then press Enter (120s): `], () => { step++; askFace(); });
    };
    askFace();
  }

  private doCompassCal(): void {
    this.ask(['[COMPASS CAL WIZARD]', 'Rotate the board slowly through ALL orientations.', ' - press Enter to start (120s): '], () => {
      this.seq([
        [500, () => this.emit('[COMPASS CAL] collecting while you rotate... span grows: 1200/3400/4800')],
        [1400, () => {
          this.emit('[COMPASS CAL] X: min=-842 max=4150  Y: min=-1290 max=3644  Z: min=-3810 max=920');
          this.emit('[COMPASS CAL] Hard/Soft iron matrices stored in RAM, exported above.');
          this.emit('[COMPASS CAL] verdict: PASS (Hard/Soft Iron stored in RAM)');
          this.emit('[COMPASS CAL] NOTE: CALIBRATION PASS != FLIGHT READY');
          this.emit('> ');
        }],
      ]);
    });
  }

  private doBaro60(): void {
    this.seq([
      [0, () => this.emit('[BARO STABILITY] 60 s, do not touch the board...')],
      [1500, () => this.emit('[BARO STABILITY] t=30s P mean=101312 drift=2 Pa')],
      [3000, () => {
        this.emit('[BARO STABILITY] t=60s drift=4 Pa (limit 20)');
        this.emit('[BARO STABILITY] verdict: PASS');
        this.emit('> ');
      }],
    ]);
  }

  private doStress(): void {
    this.out(['[STRESS] starting 600 s shared-bus test - all sensors stay connected!', '[STRESS] MPU=DRDY 100Hz, MAG=75Hz, BARO=OSR1024 step machine']);
    for (let t = 30; t <= 570; t += 30) {
      const mpu = Math.round(t * 99.97), mag = Math.round(t * 74.98), baro = Math.round(t * 59.9);
      this.timers.push(window.setTimeout(() => this.emit(`[STRESS] t=${t}s mpu=${mpu} mag=${mag} baro=${baro} err=0 recov=0 resets=0`), 100 + t));
    }
    this.timers.push(window.setTimeout(() => {
      this.emit('[STRESS] t=600s mpu=59981 mag=44952 baro=35940 err=0 recov=0 resets=0');
      this.emit('[STRESS] finished. Summary:');
      this.emit('MPU : got=59981 expected=60000 missed=19 err=0 zero=0');
      this.emit('MAG : got=44952 expected=45000 missed=48 err=0 zero=0');
      this.emit('BARO: got=35940 expected~=36000 err=0');
      this.emit('[STRESS] I2C errors delta=0 recov attempts=0 ok=0');
      this.emit('[STRESS] MCU resets during test=0');
      this.emit('[STRESS] verdict: PASS (no stuck bus, no reset, loss < thresholds)');
      this.emit('[STRESS] NOTE: COMM PASS != DATA VALID PASS (see per-device tests)');
      this.emit('> ');
    }, 100 + 600 * 1.1 + 300));
  }

  private doRecovery(): void {
    this.out([
      '[I2C RECOVERY TEST]',
      '[I2C] phase 1: NACK storm on vacant address 0x2A x20 (bounded, no data phase)',
      '[I2C] nack_addr delta=20  errors delta=0',
      '[I2C] phase 2: forced SWRST heal + bus re-init (errata-safe sequence)',
      '[I2C] recov_attempts delta=1 recov_ok delta=1',
      '[I2C] lines after test: SCL=H SDA=H',
      '[I2C] phase 3: devices must still answer (recovery must not hide errors)',
      '[I2C] device re-check:',
      '  0x68 MPU6050 ACK',
      '  0x69 MPU6050(AD0=H) NACK',
      '  0x1E HMC5883L ACK',
      '  0x77 MS5611 ACK',
      '[I2C] NOTE: error counters above are NOT erased by recovery.',
      '[I2C RECOVERY] verdict: PASS',
      '> ',
    ]);
  }

  private doUart(interactive: boolean): void {
    const counters = () => {
      this.out([
        '[UART1] pattern sent. If PuTTY shows it identical, TX path is good.',
        '[UART1] RX counters: noise=0 framing=0 overrun=0 parity=0',
      ]);
      if (!interactive) {
        this.out(['[UART1] loopback skipped (no jumper) - TX/RX error counters still reported', '[UART1] verdict: PASS (see counters above)', '> ']);
      }
    };
    this.out(['[UART1 TEST]', '[UART1] PCLK2=72000000 BRR=7500 -> baud=9600 (integer divider, error ~0%)', '[UART1] TX pattern (printable, 64 bytes):', 'QUADFC-UART-PATTERN-0123456789-ABCDEF', 'QUADFC-UART-PATTERN-0123456789-ABCDEF', 'QUADFC-UART-PATTERN-0123456789-ABCDEF', 'QUADFC-UART-PATTERN-0123456789-ABCDEF']);
    if (!interactive) { counters(); return; }
    this.ask(['[UART1] Loopback test? Short PA9->PA10 with a jumper, then press y: '], ans => {
      if (ans === 'y' || ans === 'Y') {
        this.out(['[UART1] loopback: sending 32 bytes...', '[UART1] loopback matched=4/4 lines', '[UART1] verdict: PASS (see counters above)', '> ']);
      } else {
        counters();
        this.out(['[UART1] verdict: PASS (see counters above)', '> ']);
      }
    });
  }

  private doHc12At(): void {
    this.ask(['[HC12 AT] entry requires the SET pin grounded (manual jumper).', '[HC12 AT] Ground HC-12 SET now, then press Enter (120s): '], () => {
      this.out([
        '[HC12 AT] sending AT / AT+V / AT+RX ...',
        '  < OK',
        '  < HC-12 V2.3, FU3, 9600, CH001, 20dBm',
        '[HC12 AT] Required match: FU3, Baud 9600, same CH, same RF power.',
        '[HC12 AT] verdict: PASS (config printed above)',
        '> ',
      ]);
    });
  }

  private doHc12Ping(): void {
    this.out([
      '[HC12 PING] 100 pings, 1s timeout each (compressed in simulator)...',
      '[HC12 PING] replies=99 loss=1% crc_err=0 rtt_min=28ms rtt_avg=41ms',
      '[HC12 PING] verdict: PASS',
      '> ',
    ]);
  }

  private doHc12Stream(): void {
    this.out([
      '[HC12 STREAM] sending 500 packets (30ms gap, compressed)...',
      '[HC12 STREAM] collect window (3 s quiet)...',
      '[HC12 STREAM] got=497 missing=0 duplicate=3 badcrc=0 loss=0.6%',
      '[HC12 STREAM] verdict: PASS',
      '> ',
    ]);
  }

  private doReport(): void {
    this.out([
      '================ VALIDATION REPORT ================',
      'Firmware: QuadFC Hardware Validation Suite v4.0',
      'Boot reset flags RCC_CSR=0x0C000000 -> POR PINRST [cold power-up]',
      'Since boot, new reset flags: none',
      '-- I2C counters (errors kept; recovery counted beside) --',
      'errors=2 nack_addr=1111 nack_data=0 timeout=0 arlo=0 berr=0 ovr=0 probes=1236',
      'busy_heals=1 sda_clears=0 recov_attempts=1 recov_ok=1',
      '-- UART counters --',
      'noise=0 framing=0 overrun=0 parity=0',
      '-- Test results --',
      'I2C-SCAN   : PASS',
      'MPU6050    : PASS',
      'GYRO-CAL   : PASS',
      'ACCEL-6PT  : PASS',
      'HMC5883L   : PASS',
      'COMPASS-CAL: PASS',
      'MS5611     : PASS',
      'BARO-60S   : PASS',
      'BUS-STRESS : PASS',
      'I2C-RECOVER: PASS',
      'UART       : PASS',
      'HC12-WL    : NOT-RUN',
      '-- Calibration data (RAM, exported by G/X/K) --',
      'gyro_bias_valid=1 accel6_valid=1 mag_cal_valid=1',
      'NOTE: CALIBRATION PASS != FLIGHT READY',
      '-- Final verdict --',
      'ALL RUN TESTS PASSED. Validation report may be quoted.',
      'NOTE: COMM PASS != DATA VALID PASS; compare measured',
      'values in the per-test logs, not only the PASS tags.',
      '===================================================',
      '> ',
    ]);
  }
}
