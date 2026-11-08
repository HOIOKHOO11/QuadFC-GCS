# -*- coding: utf-8 -*-
"""پروتکل تلمتری باینری کوادکوپتر — نسخه دسکتاپ (GCS)

فریم: [A5][5A][LEN][TYPE][SEQ][PAYLOAD][CRC_L][CRC_H]
CRC-16/CCITT-FALSE روی TYPE+SEQ+PAYLOAD، خروجی Little-Endian
LEN حداکثر 64 (مطابق TEL_MAX_PAYLOAD فریم‌ور v2.2)

⚠️ هم‌تراز با Core/Src/telemetry.c نسخه فعلی فریم‌ور (v2.2 / پروتکل 1.2):
   پاکت STATUS بسته به نسخه فریم‌ور 41/43/54 بایت است (لی‌اوت پایین) —
   هر تغییری در telemetry.c باید اینجا هم اعمال شود.
   ⚠️ نکته: کامنت «51 بایت» داخل send_status() فریم‌ور کهنه است؛ شمارش
   واقعی idx در کد: 41 (v1) + 2 (v2) + 11 (v2.2) = 54 بایت.
"""
import struct

PROTOCOL_VERSION = "1.2"    # هم‌تراز فریم‌ور v2.2 (STATUS v3 + اسلات‌های 9..11)

MAGIC1, MAGIC2 = 0xA5, 0x5A
CRC_SEED = 0xFFFF
MAX_PAYLOAD = 64            # v2.2: STATUS v3 (54B) + ماتریس مگ 36 بایتی

TYPE_HEARTBEAT = 0x01
TYPE_STATUS    = 0x02
TYPE_ACK       = 0x03
TYPE_EVENT     = 0x04
TYPE_CMD       = 0x10
TYPE_DEBUG     = 0x11

CMD_ARM        = 0x01
CMD_DISARM     = 0x02
CMD_TAKEOFF    = 0x03
CMD_LAND       = 0x04
CMD_RTH        = 0x05
CMD_CAL_ACC    = 0x06
CMD_CAL_MAG    = 0x07
CMD_SAVE_CFG   = 0x08
CMD_MOTOR_TEST = 0x09   # payload: [motor_idx][pulse_lo][pulse_hi]
CMD_SET_HOVER  = 0x0A   # payload: float LE 4 بایتی
CMD_CANCEL     = 0x0B
CMD_REBOOT     = 0x0C
CMD_CAL_ACC6   = 0x0D   # v1.2: payload=[face] — صورت 0..5 (کالیبراسیون ۶-جهته)
CMD_SET_MAG_MAT = 0x0E  # v1.2: payload=9×float LE سطر-اصلی (36 بایت)
# CMD_FAULT_INJ = 0x0F فقط با ENABLE_FAULT_INJECTION=1 در فریم‌ور کامپایل
# می‌شود (بنچ بدون ملخ!): payload=[1=فریز کنترل، 0=رها] — عمداً UI ندارند.
CMD_FAULT_INJ  = 0x0F

ACK_OK, ACK_BUSY, ACK_STATE, ACK_CALIB, ACK_PARAM = 0, 1, 2, 3, 4

EV_HOME_SET, EV_HOVER_LEARN, EV_CALIB_DONE = 1, 2, 3
EV_FAILSAFE, EV_LANDED, EV_LOW_BATT, EV_LINK_LOST = 4, 5, 6, 7

# بیت‌های وضعیت (HB_FLAG_* در telemetry.h)
F_ARMED, F_RC_OK, F_GCS_OK = 0x01, 0x02, 0x04
F_GPS_FIX, F_FAILSAFE, F_AUTO = 0x08, 0x10, 0x20

# حالت‌های پرواز (flight_mode_t)
FM_NORMAL, FM_HEADLESS, FM_TAKEOFF, FM_LANDING, FM_RTH = 0, 1, 2, 3, 4
# حالت سیستم (sys_state_t)
SYS_DISARMED, SYS_ARMED = 0, 1

# محدوده مجاز گاز هاور (fc_config.h)
HOVER_THR_MIN, HOVER_THR_MAX = 0.35, 0.75

STATUS_LEN      = 41   # حداقل (نسخه 1) — پارسر بر اساس طول، نسخه را تشخیص می‌دهد
STATUS_LEN_V2   = 43   # v2: + health + maneuver_state
STATUS_LEN_V3   = 54   # v1.2: + loop_max/overruns/vz/rc_age/arm_denied/health2/home_gate/motor_test

# بایت سلامت (offset 41، اختیاری — هم‌تراز telemetry.h فریم‌ور v2)
HEALTH_IMU_OK       = 0x01
HEALTH_BARO_OK      = 0x02
HEALTH_SONAR_OK     = 0x04
HEALTH_GPS_FRESH    = 0x08
HEALTH_ALT_VALID    = 0x10
HEALTH_RC_FAILSAFE  = 0x20
HEALTH_GCS_FAILSAFE = 0x40
HEALTH_MOTOR_FAULT  = 0x80

# --- v1.2: بایت health2 (offset 51) ---
H2_GYRO_CAL_STALE = 0x01     # بایاس ژیرو کهنه
H2_MAG_FIELD_BAD  = 0x02     # میدان مغناطیسی بد
H2_CURRENT_SENSOR = 0x08     # سنسور جریان (INA219) حاضر

# --- v1.2: بایت home_gate (offset 52) — دلیل رد ثبت خانه ---
HOME_GATE_GPS_NOT_FRESH = 0x01
HOME_GATE_SATS_LT6      = 0x02   # ماهواره < 6
HOME_GATE_HDOP_GT2      = 0x04   # HDOP > 2.0
HOME_GATE_SPEED_HIGH    = 0x08   # سرعت > 1.5 m/s
HOME_GATE_POS_UNSTABLE  = 0x10   # موقعیت ناپایدار

# --- v1.2: بایت arm_denied (offset 50) — دلیل رد Arm (flight.c) ---
ARM_DENY_RC        = 0x01
ARM_DENY_THROTTLE  = 0x02
ARM_DENY_IMU       = 0x04
ARM_DENY_CALIB     = 0x08
ARM_DENY_GYRO_STAT = 0x10
ARM_DENY_ACC_LEVEL = 0x20
ARM_DENY_BATTERY   = 0x40
ARM_DENY_ALTITUDE  = 0x80

# --- v1.2: بایت motor_test (offset 53) ---
MOTOR_TEST_ACTIVE_MASK = 0x80   # 0x80 = تست موتور فعال
MOTOR_TEST_ABORT_MASK  = 0x07   # بیت‌های 0..2 = آخرین دلیل توقف
MOTOR_TEST_STOP_IDX    = 0xFF   # idx=0xFF در CMD_MOTOR_TEST = توقف دستی
MOTOR_TEST_MAX_US      = 1150   # سقف پالس تست (MOTOR_TEST_MAX_US فریم‌ور)
MOTOR_TEST_AUTO_STOP_MS = 2000  # توقف خودکار فریم‌ور
MOTOR_TEST_ABORT_NAMES = {0: "—", 1: "حرکت استیک", 2: "قطع RC", 3: "پایان ۲ ثانیه"}

# --- v1.2: args رخداد EVT_CALIB_DONE (0x03) ---
CAL_ARG_FAIL        = 0     # ناموفق / لرزان
CAL_ARG_SAVED       = 1     # ذخیره شد
CAL_ARG_MAG_DONE    = 2     # کالیبراسیون مگ انجام شد
CAL_ARG_ACC6_SOLVED = 3     # شش‌جهته حل و اعمال شد
CAL_ARG_MAG_MATRIX  = 4     # ماتریس مگ اعمال شد
CAL_ARG_ACC6_FACE0  = 10    # 10..15 = صورت 0..5 ثبت شد

# --- v1.2: اسلات‌های DEBUG چرخشی (12 اسلات × 4 float) ---
DEBUG_SLOT_COUNT = 12
DEBUG_SLOT_LABELS = {
    0:  ("حلقه ms", "حلقه µs", "رول", "پیچ"),
    1:  ("یاو", "ژیرو X", "ژیرو Y", "ژیرو Z"),
    2:  ("شتاب X", "شتاب Y", "شتاب Z", "گاز"),
    3:  ("هدف رول", "هدف پیچ", "هدف نرخ یاو", "گشتاور رول"),
    4:  ("گشتاور پیچ", "گشتاور یاو", "PID P", "PID I"),
    5:  ("PID D", "پالس M1", "پالس M2", "پالس M3"),
    6:  ("پالس M4", "ارتفاع m", "سرعت صعود", "سونار cm"),
    7:  ("بارومتر m", "عمر GPS s", "lat e7", "lon e7"),
    8:  ("فاصله خانه m", "ولتاژ V", "پرچم‌ها", "کد مانور"),
    9:  ("پشته ctrl", "پشته flgt", "پشته telm", "پشته snsr"),
    10: ("پشته gps", "پشته moni", "پشته leds", "مینیمم هیپ B"),
    11: ("تایم‌اوت I2C", "رد مگ", "mAh مصرفی", "جریان cA"),
}   # اسلات 9/10 = HWM پشته (واژه 4B)، 11 = شمارنده‌های سلامت (v2.2)


def crc16_ccitt(data: bytes, seed: int = CRC_SEED) -> int:
    """CRC-16/CCITT-FALSE (چندجمله‌ای 0x1021، مقدار اولیه 0xFFFF)"""
    crc = seed
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if (crc & 0x8000) else (crc << 1)
            crc &= 0xFFFF
    return crc


def build_frame(ftype: int, seq: int, payload: bytes = b"") -> bytes:
    """ساخت فریم کامل — مطابق send_frame() فریم‌ور"""
    if len(payload) > MAX_PAYLOAD:
        raise ValueError("payload > TEL_MAX_PAYLOAD")
    body = bytes([ftype & 0xFF, seq & 0xFF]) + payload
    crc = crc16_ccitt(body)
    return bytes([MAGIC1, MAGIC2, len(payload)]) + body + bytes([crc & 0xFF, crc >> 8])


def _u16(b, o):  return b[o] | (b[o+1] << 8)
def _s16(b, o):
    v = _u16(b, o)
    return v - 0x10000 if v & 0x8000 else v
def _s32(b, o):
    v = b[o] | (b[o+1] << 8) | (b[o+2] << 16) | (b[o+3] << 24)
    return v - 0x100000000 if v & 0x80000000 else v


class FrameParser:
    """وضعیت‌دار: بایت‌به‌بایت تغذیه می‌شود (مطابق feed_byte() فریم‌ور).

    on_frame(type, seq, payload)     فقط برای فریم‌های سالم
    on_crc_error()                   برای هر فریم خراب (✅ اصلاح #۲: قبلاً
                                     شمارنده CRC در GCS مرده بود)
    """
    def __init__(self, on_frame, on_crc_error=None):
        self.on_frame = on_frame
        self.on_crc_error = on_crc_error or (lambda: None)
        self.buf = bytearray()
        self.state = 0
        self.need = 0

    def feed_byte(self, b):
        self.buf.append(b)
        if self.state == 0:
            if b == MAGIC1:
                self.state = 1
            else:
                self.buf.clear()
            return
        if self.state == 1:
            if b == MAGIC2:
                self.state = 2
            elif b == MAGIC1:
                # پیش‌درآمد مجدد: 0xA5 0xA5 ... → فقط آخری را نگه دار
                self.buf[:] = bytearray([b])
                return
            else:
                self.state = 0
                self.buf.clear()
            return
        if self.state == 2:
            n = b
            if n > MAX_PAYLOAD:            # مطابق فریم‌ور: LEN نامعتبر = خطا
                self.state = 0
                self.buf.clear()
                self.on_crc_error()
                return
            self.need = 2 + n + 2          # TYPE+SEQ+PAYLOAD+CRC
            self.state = 3
            return
        if self.state == 3:
            if len(self.buf) < 3 + self.need:
                return
            frame = bytes(self.buf)
            self.state = 0
            self.buf.clear()
            payload = frame[5:5 + self.need - 4]
            calc = crc16_ccitt(frame[3:3 + self.need - 2])
            rcv = frame[3 + self.need - 2] | (frame[3 + self.need - 1] << 8)
            if calc == rcv:
                self.on_frame(frame[3], frame[4], payload)
            else:
                self.on_crc_error()

    def feed(self, data: bytes):
        for b in data:
            self.feed_byte(b)


def parse_status(p: bytes):
    """پاکت STATUS → dict (نسخه 1: 41 بایت، نسخه 2: 43، نسخه 3/پروتکل 1.2: 54)

    v2:      @41 u8 health_bitfield   @42 u8 maneuver_state_code
    v3(v1.2): @43..44 i16 loop_max_us   @45..46 i16 overruns
              @47..48 i16 vz (cm/s)     @49 u8 rc_age (×10ms، 255=>2.55s)
              @50 u8 arm_denied         @51 u8 health2
              @52 u8 home_gate          @53 u8 motor_test
    (پارسر وابسته به طول است — فریم‌ور قدیمی 41/43 بایتی هم پذیرفته می‌شود)
    """
    if len(p) < STATUS_LEN:
        return None
    d = {}
    d['roll']  = _s16(p, 0) / 100.0
    d['pitch'] = _s16(p, 2) / 100.0
    d['yaw']   = _s16(p, 4) / 100.0
    d['alt_cm']   = _s16(p, 6)
    d['sonar_mm10'] = _s16(p, 8)     # منفی → سونار نامعتبر
    d['volt_c']   = _u16(p, 10)
    d['batt_pct'] = p[12]
    d['home_lat_e7'] = _s32(p, 13)
    d['home_lon_e7'] = _s32(p, 17)
    d['lat_e7']      = _s32(p, 21)
    d['lon_e7']      = _s32(p, 25)
    d['speed_cms']   = _u16(p, 29)
    d['course_cdeg'] = _u16(p, 31)
    gb = p[33]
    d['sats']    = gb >> 4
    d['gps_fix'] = bool(gb & 0x08)
    d['hdop_ok'] = bool(gb & 0x04)   # hdop_x10 < 30
    d['mode']    = p[34]
    d['state']   = p[35]
    d['flags']   = p[36]
    d['hover']   = p[37] / 200.0     # گاز هاور 0..1
    d['fc_quality'] = p[38]          # کیفیت لینک از دید کواد
    d['alt_target_dm'] = _s16(p, 39)
    # --- v2 اختیاری ---
    d['health'] = p[41] if len(p) >= 43 else None
    d['maneuver_state'] = p[42] if len(p) >= 43 else None
    # --- v3 (پروتکل 1.2) اختیاری: فیلدهای لاگ/سلامت ---
    if len(p) >= STATUS_LEN_V3:
        d['loop_max_us'] = _s16(p, 43)
        d['overruns']    = _s16(p, 45)
        d['vz_cms']      = _s16(p, 47)
        d['rc_age']      = p[49]
        d['arm_denied']  = p[50]
        d['health2']     = p[51]
        d['home_gate']   = p[52]
        d['motor_test']  = p[53]
    return d


def parse_debug(p: bytes):
    """پاکت DEBUG چرخشی: [slot][4×float LE] → dict یا None

    اسلات‌ها 0..DEBUG_SLOT_COUNT-1 (v1.2: 12 اسلات) —
    9/10 = HWM پشته‌ها (واژه 4B + مینیمم هیپ بایت)، 11 = شمارنده‌های سلامت.
    """
    if len(p) < 17:
        return None
    slot = p[0] % DEBUG_SLOT_COUNT
    f = list(struct.unpack('<4f', p[1:17]))
    return {'slot': slot, 'f': f}


def parse_ack(p: bytes):
    """پاکت ACK: [seq_of_cmd][code]"""
    if len(p) < 2:
        return None
    return {'seq': p[0], 'code': p[1]}


def parse_event(p: bytes):
    """پاکت EVENT: [code][arg]"""
    if len(p) < 2:
        return None
    return {'code': p[0], 'arg': p[1]}


def parse_heartbeat(p: bytes):
    """پاکت HEARTBEAT کواد: [flags][mode][quality][tick_lo]"""
    if len(p) < 4:
        return None
    return {'flags': p[0], 'mode': p[1], 'quality': p[2], 'tick': p[3]}


def cmd_motor_test(idx: int, pulse_us: int) -> bytes:
    """تست تک‌موتور: [idx][us_lo][us_hi] — فقط دیس‌آرم؛ فریم‌ور پالس را
    به MOTOR_TEST_MAX_US=1150 محدود و بعد از 2s خودش قطع می‌کند."""
    return bytes([CMD_MOTOR_TEST, idx & 0xFF]) + struct.pack('<H', pulse_us)


def cmd_motor_test_stop() -> bytes:
    """توقف فوری تست موتور: payload [0xFF] (مطابق شاخه len>=1 && pl[1]==0xFF)"""
    return bytes([CMD_MOTOR_TEST, MOTOR_TEST_STOP_IDX])


def cmd_cal_acc6(face: int) -> bytes:
    """کالیبراسیون شش‌جهته شتاب: [face] — صورت‌ها:
    0=+Z بالا 1=-Z بالا 2=+X بالا 3=-X بالا 4=+Y بالا 5=-Y بالا
    (هم‌تراز axis_of/sign_of در calib_math.c)"""
    if not 0 <= face <= 5:
        raise ValueError("face باید 0..5 باشد")
    return bytes([CMD_CAL_ACC6, face & 0xFF])


def cmd_set_mag_matrix(m) -> bytes:
    """ماتریس نرم‌آهنی مگ: [CMD][9×float LE سطر-اصلی] (36 بایت داده)

    m: دنباله 9 عضوی (سطر-اصلی: m00 m01 m02 m10 ...) —
    هم‌تراز handle_cmd/CMD_SET_MAG_MAT فریم‌ور (len>=37)."""
    if len(m) != 9:
        raise ValueError("ماتریس باید 9 عضو داشته باشد")
    return bytes([CMD_SET_MAG_MAT]) + struct.pack('<9f', *[float(x) for x in m])


def cmd_set_hover(throttle: float) -> bytes:
    return bytes([CMD_SET_HOVER]) + struct.pack('<f', throttle)
