'use client';

import { useGS, loadPersisted } from './store';
import { SerialClient, cachedPorts, requestPort, portLabel, detectBaud, serialSupported, sleep } from './serial';
import { parseDFrame, parseQFrame, parseNmea, interpretText, splitLogTokens, cleanLiveLine } from './protocol';
import { parseVsLine, isLoggerIdLine } from './valsuite';
import { Simulator, VsSimulator } from './simulator';

class Engine {
  private client: SerialClient | null = null;
  private sim: Simulator | VsSimulator | null = null;
  private replayTimers: number[] = [];
  private fpsCount = 0;
  private fpsTimer: number | null = null;
  private silenceTimer: number | null = null;
  private port: SerialPort | null = null;
  private lastCounters = { i2cErr: 0, gpsBad: 0 };
  private curFw: 'logger' | 'valsuite' | null = null;

  init(): void {
    loadPersisted();
    // unknown delivery of 'disconnect' event
    if (serialSupported()) {
      navigator.serial.addEventListener('disconnect', () => {
        if (this.client?.isOpen) { void this.disconnect(); }
      });
    }
    this.fpsTimer = window.setInterval(() => {
      const st = useGS.getState().conn;
      if (st.mode !== 'off') useGS.getState().setConn({ fps: this.fpsCount });
      this.fpsCount = 0;
    }, 1000);
  }

  get busy(): boolean {
    return useGS.getState().conn.mode !== 'off';
  }

  // ---------- line intake ----------
  handleLine = (raw: string): void => {
    let line = cleanLiveLine(raw);
    if (!line) return;
    const wasCliPrompt = /^>\s*$/.test(line);
    line = line.replace(/^>\s*/, ''); // leftover CLI prompt residue from the menu firmware
    if (!line) {
      // a bare "> " line means the firmware is back at the command prompt
      if (wasCliPrompt) useGS.getState().vsApply({ prompt: null });
      return;
    }
    this.fpsCount++;
    const gs = useGS.getState();
    gs.setConn({ lastRxAt: Date.now() });

    // --- firmware self-identification (works at boot AND mid-session via '?') ---
    if (/Validation Suite/i.test(line)) this.switchFw('valsuite');
    else if (isLoggerIdLine(line)) this.switchFw('logger');

    const mode = useGS.getState().conn.mode;

    if (mode !== 'valsuite' && line.startsWith('D,')) {
      const f = parseDFrame(line);
      if (f) {
        this.switchFw('logger');
        gs.pushCon('rx', line.length > 220 ? line.slice(0, 220) + '…' : line);
        const { declDeg, p0Pa } = useGS.getState().settings;
        gs.applyFrame(f, declDeg, p0Pa);
        this.armSilenceWatch();
        return;
      }
    }
    // Q summary (every 10 s) — health/counters record of logger v7
    if (mode !== 'valsuite' && /^#?Q,/.test(line)) {
      const q = parseQFrame(line);
      if (q) {
        this.switchFw('logger');
        gs.pushCon('rx', line.length > 220 ? line.slice(0, 220) + '…' : line);
        gs.applyQ(q);
        return;
      }
    }
    const nmeaish = line.startsWith('N,$') || line.startsWith('$G');
    if (nmeaish && mode !== 'valsuite') {
      const d = parseNmea(line);
      gs.pushCon('rx', line);
      if (d && d.kind !== '') {
        if (gs.conn.mode === 'off' || gs.conn.mode === 'detect') {
          if (line.startsWith('N,')) this.switchFw('logger');
          else gs.setConn({ mode: 'nmea' });
        }
        gs.applyNmea(d);
      } else if (d === null && line.includes('*')) {
        gs.pushEvent({ sev: 'warn', title: 'جملهٔ NMEA با چک‌سام اشتباه', detail: line.slice(0, 60) });
      }
      return;
    }

    // plain text line
    gs.pushCon('rx', line);
    if (mode === 'valsuite') {
      const r = parseVsLine(line);
      if (Object.keys(r.patch).length) gs.vsApply(r.patch);
      if (r.prompt !== undefined) gs.vsApply({ prompt: r.prompt });
      for (const ev of r.events) gs.pushEvent(ev);
      return;
    }
    if ((mode === 'off' || mode === 'detect') && /Logger v|QuadFC|STM32F103|COMMANDS:/i.test(line)) {
      this.switchFw('logger');
    }
    for (const ev of interpretText(line)) gs.pushEvent(ev);
  };

  private switchFw(fw: 'logger' | 'valsuite'): void {
    if (this.curFw === fw) return;
    this.curFw = fw;
    const gs = useGS.getState();
    gs.vsReset();
    gs.setConn({ mode: fw });
    gs.pushEvent(fw === 'valsuite'
      ? { sev: 'ok', title: 'فریمور شناسایی شد: سوئیت اعتبارسنجی v4.0 (منویی)', detail: 'فرمان‌های این فریمور در تب «عیب‌یابی» و «کنسول» عوض شد.' }
      : { sev: 'ok', title: 'فریمور شناسایی شد: لاگر سخت‌افزاری v7 (CSV)', detail: 'فریم‌های D هر ۵۰۰ms + فرمان‌های d/s/g/r/v/L.' });
  }

  private armSilenceWatch(): void {
    if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => {
      const st = useGS.getState().conn;
      if (st.mode === 'logger' && Date.now() - st.lastRxAt > 2600) {
        this.send('L'); // restart logging after a finished/stopped 5-min window
        useGS.getState().pushEvent({
          sev: 'info', title: 'جریان داده قطع بود — فرمان L (شروع لاگ) فرستاده شد',
        });
      }
    }, 3000);
  }

  // ---------- connection ----------
  async connectAuto(): Promise<void> {
    const gs = useGS.getState();
    if (!serialSupported()) {
      gs.pushEvent({
        sev: 'crit', title: 'مرورگرت از Web Serial پشتیبانی نمی‌کند',
        detail: 'اتصال سریال فقط در Chrome / Edge نسخهٔ دسکتاپ کار می‌کند.',
        action: 'با Chrome یا Edge باز کن — یا از «شبیه‌ساز» و «بازپخش لاگ» استفاده کن.',
      });
      return;
    }
    gs.setConn({ status: 'connecting' });
    let ports = await cachedPorts();
    if (ports.length === 0) {
      const p = await requestPort();
      if (!p) { gs.setConn({ status: 'off' }); return; }
      ports = [p];
    }
    await this.openPort(ports[0]);
  }

  async connectManual(): Promise<void> {
    const gs = useGS.getState();
    if (!serialSupported()) {
      gs.pushEvent({ sev: 'crit', title: 'مرورگرت از Web Serial پشتیبانی نمی‌کند', action: 'از Chrome یا Edge دسکتاپ استفاده کن.' });
      return;
    }
    gs.setConn({ status: 'connecting' });
    const p = await requestPort();
    if (!p) { gs.setConn({ status: 'off' }); return; }
    await this.openPort(p);
  }

  private async openPort(port: SerialPort): Promise<void> {
    const gs = useGS.getState();
    this.port = port;
    this.curFw = null;
    const { baudPref } = useGS.getState().settings;
    gs.pushProbe('شروع تشخیص بادریت…');
    const res = await detectBaud(port, baudPref, s => this.rawSend(s), m => gs.pushProbe(m));
    if (!res) {
      gs.setConn({ status: 'off' });
      gs.pushEvent({
        sev: 'err', title: 'هیچ بادریتی پاسخ نداد',
        detail: gs.conn.probeLog.join(' | '),
        action: 'برد را ریست کن (PuTTY بسته باشد)، کابل USB-TTL را چک کن، یا بادریت را دستی انتخاب کن.',
      });
      return;
    }
    const client = new SerialClient();
    client.onLine = this.handleLine;
    client.onClosed = reason => {
      if (reason === 'unplugged') {
        useGS.getState().pushEvent({ sev: 'err', title: 'اتصال USB قطع شد', action: 'کابل را وصل کن و دوباره وصل شو.' });
      }
      void this.disconnect(true);
    };
    try {
      await client.open(port, res.baud);
    } catch {
      gs.setConn({ status: 'off' });
      gs.pushEvent({ sev: 'err', title: 'باز کردن پورت ناموفق بود', detail: 'ممکن است برنامهٔ دیگری (PuTTY) پورت را نگه داشته باشد.' });
      return;
    }
    this.client = client;
    gs.setConn({ status: 'on', mode: 'detect', portLabel: this.portIdxLabel(port), baud: res.baud, bootAt: Date.now() });
    gs.resetTelemetry();
    gs.pushEvent({ sev: 'ok', title: `متصل شد — ${Math.round(res.baud).toLocaleString('en-US')} baud`, detail: 'در حال شناسایی فریمور (لاگر v7 یا سوئیت v4.0)…' });
    if (res.baud !== baudPref) gs.setSettings({ baudPref: res.baud });
    // greet the firmware so it declares itself (both firmwares answer '?')
    this.rawSend('?');
    window.setTimeout(() => {
      if (useGS.getState().conn.mode === 'detect') this.rawSend('?');
    }, 1500);
    this.armSilenceWatch();
  }

  private portIdxLabel(port: SerialPort): string {
    // Web Serial gives no friendly name; index-based label
    return portLabel(port, 0);
  }

  async disconnect(silent = false): Promise<void> {
    if (this.client) { await this.client.close(); this.client = null; }
    this.stopReplay();
    this.stopSim();
    if (this.silenceTimer !== null) { window.clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    this.curFw = null;
    useGS.getState().vsApply({ prompt: null });
    useGS.getState().setConn({ status: 'off', mode: 'off', portLabel: '', baud: 0, fps: 0 });
    if (!silent) useGS.getState().pushCon('sys', 'اتصال بسته شد');
  }

  private rawSend(s: string): void {
    void this.client?.write(s);
  }

  send(cmd: string): void {
    const gs = useGS.getState();
    if (this.client?.isOpen) {
      gs.pushCon('tx', cmd || '⏎ Enter');
      // both firmwares read per-line/CR; '\r' is the PuTTY-style terminator
      this.rawSend(cmd + '\r');
    } else if (gs.conn.mode === 'sim' || gs.conn.mode === 'valsuite') {
      gs.pushCon('tx', cmd || '⏎ Enter');
      if (this.sim instanceof VsSimulator) this.sim.handle(cmd);
      else this.simRespond(cmd);
    } else {
      gs.pushCon('sys', 'ابتدا وصل شو (یا شبیه‌ساز را روشن کن)');
    }
  }

  private simRespond(cmd: string): void {
    const gs = useGS.getState();
    const r = (s: string) => setTimeout(() => { gs.pushCon('rx', s); for (const ev of interpretText(s)) gs.pushEvent(ev); }, 120);
    switch (cmd.trim()) {
      case '?':
        r('COMMANDS: ? help | d diagnostics | s I2C scan | g GPS report | r RC report | v voltage | p PPM mode | i iBUS mode | L restart 5min log | x stop log | c clear counters | t RGB test');
        break;
      case 'd':
        r('[SENSORS] MPU6050@0x68= identity/config OK  T_cC=2748');
        r('MS5611@0x77= PROM CRC OK');
        r('HMC5883L= identity OK');
        r('PINMAP: HC12 PA9/PA10; GPS PA2=USART2_TX PA3=USART2_RX; RC PA0; ADC PA4; RGB PA6/PA7/PB0; I2C PB10/PB11');
        break;
      case 's':
        r('[I2C] scan PB10/PB11, 3 rounds: 0x68 0x1E 0x77 present, stable=3');
        break;
      case 'v':
        r('[VOLT] Vref ADC=1195 estimated VDD=3298 mV');
        r('PA4 divider: 100k/33k ratio=4.03; estimated input= 8104 mV');
        break;
      case 'g':
        r('GPS USART2: PA3 RX <- GPS TX; PA2 TX -> GPS RX. 9600 8N1');
        r('sats= 9  fix= 1  HDOPx100= 92  altitude_cm= 121450');
        break;
      case 'r':
        r('[RC] input mode set to PPM on PA0.');
        r('frames= 5000 ch_count= 8 age_ms= 18 bad= 0 glitch= 0');
        break;
      case 'L': r('#LOG_DONE,records=0'); break;
      case 'x': r('#LOG_STOP,records=1200'); break;
      case 'c': r('counters cleared'); break;
      case 't': r('RGB test blink on PA6/PA7/PB0'); break;
      case 'p': r('[RC] input mode set to PPM on PA0.'); break;
      case 'i': r('[RC] input mode set to iBUS on PA0.'); break;
      default: r(`unknown command '${cmd.trim()}'`);
    }
  }

  // ---------- simulator ----------
  startSim(kind: 'v7' | 'vs' = 'v7'): void {
    void this.disconnect(true);
    useGS.getState().resetTelemetry();
    useGS.getState().vsReset();
    if (kind === 'vs') {
      this.curFw = 'valsuite'; // banner emitted by the sim will not re-announce
      this.sim = new VsSimulator(this.handleLine);
      this.sim.start();
      useGS.getState().setConn({ status: 'on', mode: 'valsuite', portLabel: 'شبیه‌ساز سوئیت v4.0', baud: 9600, bootAt: Date.now() });
      useGS.getState().pushEvent({ sev: 'ok', title: 'شبیه‌ساز سوئیت اعتبارسنجی v4.0 روشن شد', detail: 'منو، پرامپت‌ها و گزارش P با الگوی واقعی فریمور.' });
    } else {
      this.sim = new Simulator(this.handleLine);
      this.sim.start();
      useGS.getState().setConn({ status: 'on', mode: 'sim', portLabel: 'شبیه‌ساز', baud: 0, bootAt: Date.now() });
      useGS.getState().pushEvent({ sev: 'ok', title: 'شبیه‌ساز روشن شد', detail: 'همهٔ تب‌ها با دادهٔ واقعی‌نما تغذیه می‌شوند (فرمت دقیق v7).' });
    }
  }

  stopSim(): void {
    if (this.sim) { this.sim.stop(); this.sim = null; }
    const st = useGS.getState().conn;
    if (st.mode === 'sim' || st.mode === 'valsuite') {
      useGS.getState().setConn({ status: 'off', mode: 'off', portLabel: '', fps: 0 });
      this.curFw = null;
      useGS.getState().vsApply({ prompt: null });
    }
  }

  // ---------- replay ----------
  startReplay(text: string, speed: number): void {
    void this.disconnect(true);
    const toks = splitLogTokens(text);
    if (toks.length === 0) {
      useGS.getState().pushEvent({ sev: 'err', title: 'در متن لاگ، هیچ فریم D یا N پیدا نشد', detail: 'متن خام PuTTY هم قابل پذیرش است (فاصله‌ها و شکستگی‌ها خودکار ترمیم می‌شوند).' });
      return;
    }
    useGS.getState().resetTelemetry();
    useGS.getState().setConn({ status: 'on', mode: 'replay', portLabel: `بازپخش (${toks.length} فریم)`, baud: 0, bootAt: Date.now() });
    useGS.getState().pushEvent({ sev: 'ok', title: `بازپخش شروع شد — ${toks.length} رکورد` });
    // schedule with real timing derived from ms field
    let prevMs = -1;
    let acc = 0;
    const scale = 1 / Math.max(1, speed);
    let lastAt = 0;
    toks.forEach((tok, i) => {
      let dt = 30;
      if (tok.startsWith('D,')) {
        const ms = Number(tok.split(',')[2]);
        if (prevMs >= 0 && isFinite(ms)) dt = Math.min(1500, Math.max(0, ms - prevMs));
        if (isFinite(ms)) prevMs = ms;
      }
      acc += dt * scale;
      const at = acc;
      if (at - lastAt > 2000) { // flush long gaps at once
        const id = window.setTimeout(() => this.handleLine(tok), 0);
        this.replayTimers.push(id);
        lastAt = at;
        return;
      }
      const id = window.setTimeout(() => this.handleLine(tok), at);
      this.replayTimers.push(id);
    });
    const endId = window.setTimeout(() => {
      useGS.getState().pushEvent({ sev: 'ok', title: 'بازپخش به پایان رسید' });
    }, acc + 300);
    this.replayTimers.push(endId);
  }

  stopReplay(): void {
    this.replayTimers.forEach(id => window.clearTimeout(id));
    this.replayTimers = [];
    const st = useGS.getState().conn;
    if (st.mode === 'replay') useGS.getState().setConn({ status: 'off', mode: 'off', portLabel: '', fps: 0 });
  }
}

export const engine = new Engine();
