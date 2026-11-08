# -*- coding: utf-8 -*-
"""تست آداپتور Logger v7: هدر/D/Q + مبدل وضعیت + تشخیص خودکار لینک
داده‌های نمونه: لاگ واقعی کاربر (باتری ۲ سل، فاصله ~۱۰ متر با دیوار)"""
import sys, os, time, types
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..',
                                'download', 'QuadFC_GCS_Desktop'))

import protocol as P
import link as L

PASS, FAIL = 0, 0
def check(name, cond):
    global PASS, FAIL
    print(("[OK] " if cond else "[FAIL] ") + name)
    PASS, FAIL = PASS + (1 if cond else 0), FAIL + (0 if cond else 1)

# ---------- ۱) هدر CSV (رشته واقعی داخل باینری v7) ----------
HDR = ("#CSV,D,seq,ms,log_elapsed_ms,mpu_ok,ax,ay,az,gx,gy,gz,mpu_temp_cC,"
       "mpu_samples,ax_min,ax_max,ay_min,ay_max,az_min,az_max,gx_min,gx_max,"
       "gy_min,gy_max,gz_min,gz_max,mag_ok,mag_samples,mx,my,mz,mx_min,mx_max,"
       "my_min,my_max,mz_min,mz_max,baro_ok,baro_samples,p_pa,baro_temp_cC,"
       "baro_d1,baro_d2,gps_fix,gps_gga_quality,gps_sats,hdop_centi,lat_e7,"
       "lon_e7,altitude_cm,speed_cms,course_cdeg,utc_hhmmss_milli,date_ddmmyy,"
       "gps_age_ms,gps_fix_age_ms,rc_mode,rc_frames,rc_channels_count,rc_age_ms,"
       "ch1,ch2,ch3,ch4,ch5,ch6,ch7,ch8,ch9,ch10,ch11,ch12,ch13,ch14,"
       "pa4_adc,pa4_pin_mV,vdd_mV,pa4_source_mV,i2c_err,i2c_nacks,"
       "i2c_recoveries,gps_valid,gps_bad,gps_rx_bytes,gps_uart_fe,gps_uart_ne,"
       "gps_uart_ore,gps_uart_pe,gps_ring_overrun,nmea_q_overrun,"
       "hc12_tx_backpressure,rc_bad,ppm_glitch,ibus_frame_err,"
       "ibus_checksum_err,ibus_frame_drops")
fields = P.parse_v7_header(HDR)
check("هدر #CSV پارس شد و ۹۴ فیلد دارد", fields is not None and len(fields) == 94)
check("فیلد شماره ۴ mpu_ok و شماره ۷۶ pa4_source_mV است",
      fields[3] == 'mpu_ok' and fields[75] == 'pa4_source_mV')

# ---------- ۲) خطوط D واقعی از لاگ کاربر ----------
D1 = ("D,2,3376,2215,1,-868,-1534,18780,-146,52,-142,2752,6,-916,-856,-1534,"
      "-1252,18780,19082,-286,-146,-185,56,-142,88,1,6,-121,250,-239,-121,"
      "-120,248,250,-241,-234,1,1,85816,2716,7482670,8411990,0,0,0,9999,0,0,"
      "0,0,0,0,0,42,4294967295,0,0,0,4294967295,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"
      "2020,1627,3300,6556,0,327,0,15,1,681,0,0,0,0,161,0,2772,0,0,0,0,0")
D2 = ("D,3,3876,2715,1,-892,-1420,18904,-448,-96,-12,2753,8,-964,-742,-1558,"
      "-1380,18788,19030,-448,-163,-96,244,-163,27,1,8,-122,246,-238,-122,"
      "-120,245,249,-242,-234,1,1,85814,2715,7482602,8411888,0,0,0,9999,0,0,"
      "0,0,0,0,0,399,4294967295,0,0,0,4294967295,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"
      "2021,1625,3293,6548,0,327,0,18,1,681,0,0,0,0,161,0,2788,0,0,0,0,0")

vals1 = D1[2:].split(',')
d1 = P.parse_v7_d(vals1, fields)
check("خط D1: ۹۴ مقدار پارس شد", len(d1) == 94)
check("mpu_ok=1، mag_ok=1، baro_ok=1 (سنسورها سالم در لاگ)",
      d1['mpu_ok'] == 1 and d1['mag_ok'] == 1 and d1['baro_ok'] == 1)
check("فشار 85816 Pa و دمای بورد 27.16°C",
      d1['p_pa'] == 85816 and d1['baro_temp_cC'] == 2716)
check("0xFFFFFFFF → None (فیلد ناموجود: gps_fix_age_ms و rc_age_ms)",
      d1['gps_fix_age_ms'] is None and d1['rc_age_ms'] is None)

conv = P.V7Converter()
st1 = conv.feed(d1)
check("ولتاژ پک: 6.556V → volt_c=656", st1['volt_c'] == 656)
check("تشخیص خودکار پک ۲ سل", st1['cells'] == 2)
check("درصد تخمینی ~۷۸٪", st1['batt_pct'] == 78)
check("زاویه تخمینی معقول (|رول|<10، |پیچ|<10)",
      abs(st1['roll']) < 10 and abs(st1['pitch']) < 10)
check("ارتفاع نسبی اولین نمونه = ۰ (مرجع)", st1['alt_cm'] == 0)
check("health ساخته شد: IMU|BARO (=3)، بدون GPS (fix=0)", st1['health'] == 3)
check("حالت دیس‌آرم/نرمال و بدون خانه", st1['state'] == 0 and
      st1['home_lat_e7'] == 0 and st1['gps_fix'] is False)

st2 = conv.feed(P.parse_v7_d(D2[2:].split(','), fields))
check("نمونه دوم: افت 2Pa → ارتفاع ~۲۰±۱۰ سانتی‌متر",
      10 <= st2['alt_cm'] <= 30)

# ---------- ۳) خط #Q ----------
Q = "60000,1234,0,0,0,0,0,0,0,0,3,27,1,42,0,0,0,0,118,0,0,0".split(',')
q = P.parse_v7_q(Q)
check("خط #Q: ‏i2c_err=3، nacks=27، records=118",
      q['i2c_err'] == 3 and q['i2c_nacks'] == 27 and q['log_records'] == 118)

# ---------- ۴) تشخیص خودکار لینک: CSV بعد از باینری ----------
class FakeSerial:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.written = bytearray()
        self.closed = False
    def read(self, n):
        return self.chunks.pop(0) if self.chunks else b""
    def write(self, data):
        self.written += data
    def close(self):
        self.closed = True

csv_stream = (HDR + "\n" + D1 + "\n" + "N,$GPRMC,,V,,,,,,,,,,N*53\n" +
              "========== QUADFC v7 DIAGNOSTIC =========\n").encode('ascii')
fs = FakeSerial([csv_stream])
L.serial = types.SimpleNamespace(Serial=lambda port, baud, timeout=0.05: fs)
lk = L.QuadLink("FAKE", 9600)

deadline = time.time() + 3
events = []
while time.time() < deadline and not (len(events) >= 5):
    events += lk.drain()
    time.sleep(0.02)
kinds = [e[0] for e in events]
modes = [e[3] for e in events if e[0] == 'mode']
check("تشخیص خودکار: حالت روی 'csv' قفل شد", modes == ['csv'])
ds = [e for e in events if e[0] == 'csv' and e[3][0] == 'D']
ns = [e for e in events if e[0] == 'csv' and e[3][0] == 'N']
txt = [e for e in events if e[0] == 'text']
check("رویداد D و N و text جدا شدند", len(ds) == 1 and len(ns) == 1 and len(txt) == 1)
dd = P.parse_v7_d(ds[0][3][1], fields)
check("مقدار p_pa داخل رویداد لینک سالم است", dd['p_pa'] == 85816)
time.sleep(0.6)
check("در حالت CSV هیچ ضربان باینری ارسال نمی‌شود", len(fs.written) == 0)
check("v7 rx_lines شمرده شد", lk.rx_lines == 4)
fs.chunks.append(D2.encode('ascii') + b"\n")   # خط تازه → دریافت جاری
time.sleep(0.15)
check("quality=100 با جریان CSV (آخرین دریافت تازه)", lk.quality_pct() == 100)

# حالا فریم باینری بفرستیم → قفل باینری + شروع ضربان
def push16(vals, v):
    v = int(v) & 0xFFFF
    vals += [v & 0xFF, (v >> 8) & 0xFF]
raw = []
push16(raw, 0); push16(raw, 0); push16(raw, 0)
push16(raw, 100); push16(raw, 150); push16(raw, 1200)
raw.append(90)
for v in (0, 0, 356892000, 513890000):
    push16(raw, v & 0xFFFF); push16(raw, (v >> 16) & 0xFFFF)
push16(raw, 0); push16(raw, 0)
raw += [0x08, 0, 0, 0x02, 100, 100]
push16(raw, 20)
frame = P.build_frame(P.TYPE_STATUS, 7, bytes(raw))
fs2 = FakeSerial([frame])          # اتصال جدا — بدون race با lk
L.serial = types.SimpleNamespace(Serial=lambda port, baud, timeout=0.05: fs2)
lk2 = L.QuadLink("FAKE2", 9600)
deadline = time.time() + 3
got_frame = False
while time.time() < deadline and not got_frame:
    for ev in lk2.drain():
        if ev[0] == 'frame' and ev[1] == P.TYPE_STATUS:
            got_frame = True
    time.sleep(0.02)
check("فریم باینری بعد از CSV (اتصال جدا) → STATUS پارس شد", got_frame)
check("حالت لینک = binary", lk2.protocol_mode() == 'binary')
time.sleep(0.6)
check("در حالت باینری ضربان شروع شد", len(lk2.ser.written) > 0)
lk.close(); lk2.close()

print()
print(f"[{'PASS' if FAIL == 0 else 'FAIL'}] test_gcs_v7 ({PASS}/{PASS + FAIL})")
sys.exit(0 if FAIL == 0 else 1)
