'use client';

// Web Serial client + auto port / auto baud detection for QuadFC logger (9600 8N1 default)

export class SerialClient {
  port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private keepReading = false;
  private promptTimer: number | null = null;
  baud = 0;
  onLine: (line: string) => void = () => {};
  onClosed: (reason: string) => void = () => {};

  get isOpen(): boolean {
    return !!this.port && this.keepReading;
  }

  async open(port: SerialPort, baud: number): Promise<void> {
    if (this.keepReading) await this.close();
    this.port = port;
    this.baud = baud;
    await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    this.keepReading = true;
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const port = this.port!;
    const dec = new TextDecoderStream();
    let closedByUs = false;
    port.readable!.pipeTo(dec.writable as WritableStream).catch(() => { /* unplug */ });
    const reader = dec.readable.getReader();
    this.reader = reader;
    let buf = '';
    // Interactive firmwares print prompts WITHOUT newline ("...press y: ", "> ").
    // When the buffer looks like a pending prompt and stays idle, flush it as a line.
    const flushPrompt = () => {
      this.promptTimer = null;
      const t = buf.trim();
      if (!t) { buf = ''; return; }
      if (/(:(\s\(\d+s\))?|>)$/.test(t) || /^>/.test(t)) {
        buf = '';
        this.onLine(t);
      }
    };
    const schedulePrompt = () => {
      if (this.promptTimer !== null) window.clearTimeout(this.promptTimer);
      this.promptTimer = window.setTimeout(flushPrompt, 500);
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !this.keepReading) { closedByUs = true; break; }
        if (value) {
          buf += value;
          let nl: number;
          while ((nl = buf.search(/[\r\n]/)) >= 0) {
            if (this.promptTimer !== null) { window.clearTimeout(this.promptTimer); this.promptTimer = null; }
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) this.onLine(line);
          }
          if (buf.trim()) schedulePrompt();
          if (buf.length > 4096) buf = buf.slice(-2048); // guard
        }
      }
    } catch { /* device unplugged */ }
    finally {
      if (this.promptTimer !== null) { window.clearTimeout(this.promptTimer); this.promptTimer = null; }
      try { reader.releaseLock(); } catch { /* ignore */ }
      this.keepReading = false;
      this.reader = null;
      this.onClosed(closedByUs ? 'closed' : 'unplugged');
    }
  }

  async write(s: string): Promise<void> {
    if (!this.port || !this.port.writable) return;
    const w = this.port.writable.getWriter();
    try {
      await w.write(new TextEncoder().encode(s));
    } finally {
      try { w.releaseLock(); } catch { /* ignore */ }
    }
  }

  async close(): Promise<void> {
    if (!this.port) return;
    this.keepReading = false;
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await this.port.close(); } catch { /* ignore */ }
    this.port = null;
  }
}

export function serialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as Navigator).serial;
}

export async function cachedPorts(): Promise<SerialPort[]> {
  if (!serialSupported()) return [];
  try {
    const ports = await navigator.serial.getPorts();
    return ports.filter(p => (p as SerialPort).opened !== undefined || true);
  } catch { return []; }
}

export async function requestPort(): Promise<SerialPort | null> {
  if (!serialSupported()) return null;
  try {
    return await navigator.serial.requestPort({});
  } catch { return null; }
}

export function portLabel(port: SerialPort, idx: number): string {
  const info = port.getInfo?.() ?? {} as SerialPortInfo;
  const vid = (info as { usbVendorId?: number }).usbVendorId;
  const pid = (info as { usbProductId?: number }).usbProductId;
  if (vid !== undefined && pid !== undefined) {
    return `USB-${idx + 1} (VID:${vid.toString(16).padStart(4, '0')} PID:${pid.toString(16).padStart(4, '0')})`;
  }
  return `پورت سریال #${idx + 1}`;
}

const BAUD_RATES = [9600, 115200, 57600, 38400, 19200, 4800];

export interface BaudProbeResult {
  baud: number;
  lines: string[];
}

// Open at each candidate rate, listen, optionally send '?' and wait for known signatures.
export async function detectBaud(
  port: SerialPort,
  preferred: number,
  probe: (s: string) => void,
  onProgress: (msg: string) => void,
): Promise<BaudProbeResult | null> {
  const rates = [preferred, ...BAUD_RATES.filter(r => r !== preferred)];
  // signatures of BOTH supported firmwares (logger v7 CSV + Validation Suite v4.0 menu)
  const sig = /Logger v|#CSV|^D,-?\d|^D,\d|N,\$|COMMANDS:|QuadFC|STM32F103|Validation Suite|VALIDATION ONLY|SYSCLK=|Stable ACKed|I2C SCAN/i;
  for (const rate of rates) {
    onProgress(`آزمودن ${rate} baud …`);
    const client = new SerialClient();
    const lines: string[] = [];
    client.onLine = l => { if (lines.length < 400) lines.push(l); };
    try {
      await client.open(port, rate);
    } catch {
      onProgress(`${rate} باز نشد`);
      return null; // port might have been opened by OS or unplugged
    }
    // 1) passive listen (logger streams right after boot)
    await sleep(900);
    let hit = lines.find(l => sig.test(l));
    // 2) active probe
    if (!hit) {
      probe('?');
      await sleep(700);
      hit = lines.find(l => sig.test(l));
    }
    const printable = lines.filter(l => /^[\x20-\x7e\u0600-\u06FF]+$/.test(l)).length;
    await client.close();
    if (hit || (lines.length > 0 && printable / Math.max(1, lines.length) > 0.8)) {
      return { baud: rate, lines };
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
