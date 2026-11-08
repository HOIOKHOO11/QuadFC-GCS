# -*- coding: utf-8 -*-
"""لایه لینک سریال: نخ خواندن + ضربان ۵۰۰ms + کیفیت لینک + صف نخ‌امن

✅ اصلاح #۲: خطاهای CRC از FrameParser دریافت و شمرده می‌شوند و در کیفیت
   لینک جریمه می‌شوند (هم‌تراز با منطق telemetry_task() فریم‌ور).
✅ اصلاح #۳: فریم‌های دریافتی به‌جای فراخوانی مستقیم callback در نخ RX،
   در یک queue.Queue نخ‌امن گذاشته می‌شوند؛ مصرف‌کننده (UI/tkinter) فقط
   از نخ اصلی آن را تخلیه می‌کند. tkinter با نخ غیر اصلی سازگار نیست.
"""
import time
import threading
import queue

try:
    import serial
    import serial.tools.list_ports   # برای list_serial_ports (بالا: بدون این،
                                     # import داخل تابع، نام serial را محلی
                                     # می‌کند و UnboundLocalError می‌دهد)
except ImportError:          # اجازه اجرای تست‌ها بدون سخت‌افزار
    serial = None

from protocol import (FrameParser, build_frame,
                      TYPE_HEARTBEAT, TYPE_CMD)

FS_HB_LOST_COUNT = 3         # مطابق فریم‌ور: 1.5s تا قطع لینک
HB_PERIOD_S      = 0.5       # ضربان 2Hz
MAX_LINE_BUF     = 8192      # سقف بافر خط (حالت متنی)


def _quality_from_dt(dt):
    """هم‌تراز دقیق با محاسبه quality در telemetry_task() فریم‌ور:
    <=500ms→100، <=1000ms→70، <=1500ms→40، بعدش 0 + جریمه CRC"""
    if dt <= HB_PERIOD_S:
        q = 100
    elif dt <= 1.0:
        q = 70
    elif dt <= FS_HB_LOST_COUNT * HB_PERIOD_S:   # 1.5s
        q = 40
    else:
        q = 0
    return q


def list_serial_ports():
    if serial is None:
        return []
    return [p.device for p in serial.tools.list_ports.comports()]


class QuadLink:
    """اتصال سریال به کواد — فریم‌ها را در self.frame_q می‌گذارد."""

    def __init__(self, port, baud=9600):
        if serial is None:
            raise RuntimeError("pyserial نصب نیست: pip install pyserial")
        self.ser = serial.Serial(port, baud, timeout=0.05)
        self.frame_q = queue.Queue()      # ✅ اصلاح #۳: صف نخ‌امن
        self.parser = FrameParser(self._on_good_frame, self._on_crc_error)
        self.seq = 0
        self.lock = threading.Lock()      # محافظ نوشتن روی پورت و seq
        self.last_hb_tx = 0.0
        self.last_rx_any = 0.0
        self.rx_frames = 0
        self.crc_errors = 0               # ✅ اصلاح #۲: شمارنده زنده
        self.tx_frames = 0
        self.alive = True
        # تشخیص خودکار پروتکل: 'auto' → با اولین داده قفل می‌شود روی
        # 'binary' (QuadFC F103 — فریم A5 5A) یا 'csv' (Logger v7 — خطوط متنی)
        self.mode = 'auto'
        self.rx_lines = 0
        self._rx = threading.Thread(target=self._rx_loop, daemon=True)
        self._rx.start()

    # ---------- RX (نخ کارگر) ----------
    def _on_good_frame(self, t, s, p):
        self.last_rx_any = time.time()
        self.rx_frames += 1
        self.frame_q.put(('frame', t, s, p))

    def _on_crc_error(self):
        self.crc_errors += 1              # ✅ اصلاح #۲
        self.frame_q.put(('crcerr', None, None, None))

    def _rx_loop(self):
        buf = bytearray()
        while self.alive:
            try:
                data = self.ser.read(256)
            except Exception:
                data = b""
            if data:
                if self.mode == 'binary':
                    for b in data:
                        self.parser.feed_byte(b)
                elif b'\xa5\x5a' in data:
                    # فریم‌ور باینری QuadFC F103 — قفل دائمی روی حالت باینری
                    self.mode = 'binary'
                    self.frame_q.put(('mode', None, None, 'binary'))
                    idx = data.find(b'\xa5\x5a')
                    for b in data[idx:]:
                        self.parser.feed_byte(b)
                    buf.clear()
                else:
                    # حالت auto/csv: سرهم‌کردن خطوط متنی (Logger v7)
                    buf.extend(data)
                    if len(buf) > MAX_LINE_BUF:
                        buf.clear()          # خط بی‌پایان/نویز — ریست
                    while True:
                        nl = buf.find(b'\n')
                        if nl < 0:
                            break
                        line = bytes(buf[:nl])
                        del buf[:nl + 1]
                        self._on_line(line)
            if self.mode == 'binary':
                self._maybe_beat()   # ضربان فقط برای فریم‌ور باینری

    def _on_line(self, raw: bytes):
        """یک خط متنی کامل (Logger v7) → رویداد صف.
        اولین خط معتبر، حالت را دائمی روی 'csv' قفل می‌کند."""
        try:
            s = raw.decode('ascii').strip('\r').strip()
        except UnicodeDecodeError:
            return                      # نویز باینری قبل از sync — نادیده
        if not s:
            return
        self.rx_lines += 1
        self.last_rx_any = time.time()
        if self.mode != 'csv':
            self.mode = 'csv'
            self.frame_q.put(('mode', None, None, 'csv'))
        if s.startswith('D,'):
            self.frame_q.put(('csv', None, None, ('D', s[2:].split(','))))
        elif s.startswith('#CSV,'):
            self.frame_q.put(('csv', None, None, ('HDR', s)))
        elif s.startswith('#Q,'):
            self.frame_q.put(('csv', None, None, ('Q', s[3:].split(','))))
        elif s.startswith('N,'):
            self.frame_q.put(('csv', None, None, ('N', s[2:])))
        else:
            # بنر/گزارش متنی، NMEA خام '$...'، پاسخ فرمان و...
            self.frame_q.put(('text', None, None, s))

    # ---------- TX ----------
    def _write_frame(self, fr: bytes):
        with self.lock:
            self.ser.write(fr)
            self.tx_frames += 1

    def send_command(self, cmd, payload=b"") -> int:
        """ارسال فرمان؛ شماره SEQ را برمی‌گرداند (برای ردیابی ACK).
        cmd هم int (با payload جدا) هم bytes کامل [cmd][args...] قابل قبول است."""
        if isinstance(cmd, (bytes, bytearray)):
            payload = bytes(cmd[1:])
            cmd = int(cmd[0])
        with self.lock:
            self.seq = (self.seq + 1) & 0xFF
            seq = self.seq
        self._write_frame(build_frame(TYPE_CMD, seq, bytes([cmd]) + payload))
        return seq

    def _maybe_beat(self):
        now = time.time()
        if now - self.last_hb_tx >= HB_PERIOD_S:
            self.last_hb_tx = now
            q = self.quality_pct()
            pl = bytes([0, 0, q, int(now) & 0xFF])
            try:
                self._write_frame(build_frame(TYPE_HEARTBEAT, int(now * 2) & 0xFF, pl))
            except Exception:
                pass

    # ---------- کیفیت لینک (هم‌تراز فریم‌ور + جریمه CRC) ----------
    def quality_pct(self) -> int:
        dt = time.time() - self.last_rx_any
        q = _quality_from_dt(dt)
        # جریمه نرخ خطای CRC مثل فریم‌ور: فقط وقتی آمار کافی داریم
        total = self.rx_frames + self.crc_errors
        if q > 0 and total > 50 and self.crc_errors:
            loss = int(100 * self.crc_errors / total)
            q = max(0, q - loss)
        return q

    def protocol_mode(self) -> str:
        """'auto' | 'binary' (QuadFC F103) | 'csv' (Logger v7)"""
        return self.mode

    def drain(self):
        """تخلیه صف در نخ اصلی — خروجی: لیست رخدادها"""
        out = []
        while True:
            try:
                out.append(self.frame_q.get_nowait())
            except queue.Empty:
                return out

    def close(self):
        self.alive = False
        try:
            self._rx.join(timeout=1.0)
        except RuntimeError:
            pass
        try:
            self.ser.close()
        except Exception:
            pass
