# -*- coding: utf-8 -*-
"""شبیه‌ساز پرواز (حالت دمو) — جایگزین QuadLink بدون سخت‌افزار

خروجی: فریم‌های باینری «دقیقاً» با همان قالب telemetry.c در صف می‌گذارد
تا GCS بدون سخت‌افزار قابل آزمودن باشد. فیزیک ساده‌شده:
  - GPS فیکس بعد از ~3s (تعداد ماهواره تدریجی)
  - ARM → ثبت خانه (EVT_HOME_SET)
  - TAKEOFF → صعود نرم تا هدف (+2m) → یادگیری هاور → NORMAL
  - LAND → فرود نرم → EVT_LANDED → دیس‌آرم خودکار
  - RTH → صعود +2m، بازگشت به خانه، فرود
  - باتری تخلیه می‌شود؛ زیر 20% → EVT_LOW_BATT + فرود اضطراری
  - v1.2: STATUS پنجاه‌وچهار بایتی + DEBUG چرخشی 12 اسلات (2Hz مثل DEBUG_HZ)
"""
import time
import struct
import threading
import queue

from protocol import (TYPE_HEARTBEAT, TYPE_STATUS, TYPE_ACK, TYPE_EVENT,
                      TYPE_DEBUG, CMD_ARM, CMD_DISARM, CMD_TAKEOFF, CMD_LAND,
                      CMD_RTH, CMD_CAL_ACC, CMD_CAL_MAG, CMD_SAVE_CFG,
                      CMD_MOTOR_TEST, CMD_SET_HOVER, CMD_CANCEL, CMD_REBOOT,
                      CMD_CAL_ACC6, CMD_SET_MAG_MAT,
                      ACK_OK, ACK_STATE, ACK_PARAM,
                      EV_HOME_SET, EV_HOVER_LEARN, EV_CALIB_DONE,
                      EV_LANDED, EV_LOW_BATT, EV_FAILSAFE,
                      F_ARMED, F_RC_OK, F_GCS_OK, F_GPS_FIX, F_AUTO,
                      FM_NORMAL, FM_HEADLESS, FM_TAKEOFF, FM_LANDING, FM_RTH,
                      HOVER_THR_MIN, HOVER_THR_MAX,
                      MOTOR_TEST_STOP_IDX, MOTOR_TEST_MAX_US,
                      MOTOR_TEST_AUTO_STOP_MS, MOTOR_TEST_ACTIVE_MASK,
                      DEBUG_SLOT_COUNT, DEBUG_SLOT_LABELS,
                      build_frame)

HOME_LAT0 = 356892000        # 35.6892N در e7 (تهران)
HOME_LON0 = 513890000        # 51.3890E در e7


def _p16(v):
    v = int(v)
    return bytes([v & 0xFF, (v >> 8) & 0xFF])


def _p32(v):
    v = int(v)
    return bytes([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF])


class DemoLink:
    """رابط هم‌سخت‌افزار با QuadLink: send_command / drain / close"""

    def __init__(self):
        self.frame_q = queue.Queue()
        self.alive = True
        self.seq = 0
        self.lock = threading.Lock()
        self.rx_frames = 0
        self.crc_errors = 0

        # حالت شبیه‌سازی
        self.t0 = time.time()
        self.armed = False
        self.mode = FM_NORMAL
        self.hover = 0.50
        self.alt_m = 0.0
        self.alt_target_m = 0.0
        self.lat = HOME_LAT0 + 1200        # چند متر دور از خانه
        self.lon = HOME_LON0 + 1500
        self.home_set = False
        self.hover_learned = False
        self.calib_t = 0.0                 # 0 = در جریان نیست
        self.reboot_t = 0.0
        self.batt_pct = 100
        self.low_batt_warned = False
        self.failssafe_land = False
        self.vy_aw = 0.0                   # سرعت عمودی m/s
        self.last = time.time()
        # --- v1.2: وضعیت سازگار با فریم‌ور v2.2 ---
        self.acc6_faces = 0                # بیت‌مپ صورت‌های ثبت‌شده شش‌جهته
        self.cal_acc6_t = 0.0              # زمان پایان ثبت صورت جاری
        self.cal_acc6_face = 0xFF          # صورت در جریان
        self.mag_matrix = None             # ماتریس مگ ارسالی
        self.mt_idx = -1                   # تست موتور فعال (-1 = خاموش)
        self.mt_us = 0
        self.mt_start = 0.0
        self.mt_abort = 0                  # 0=— 1=استیک 2=rc-lost 3=پایان 2s
        self.consumed_mah = 120.0          # شمارنده مصرف (اسلات 11)
        self.i2c_timeouts = 0
        self.mag_rejected = 3

        self._th = threading.Thread(target=self._run, daemon=True)
        self._th.start()

    # ---------------- رابط عمومی ----------------
    def send_command(self, cmd, payload=b""):
        """پردازش فرمان زمین + پاسخ فوری ACK (مطابق handle_cmd)

        مثل فریم‌ور، ACK شماره‌ی SEQ همان فرمان را اکو می‌کند و
        send_command همان شماره را برمی‌گرداند تا GCS بتواند ردیابی کند.
        cmd هم می‌تواند int باشد (با payload) هم bytes کامل [cmd][args...]."""
        if isinstance(cmd, (bytes, bytearray)):
            payload = bytes(cmd)              # قرارداد فریم‌ور: pl[0] خودِ cmd
            cmd = int(cmd[0])
        else:
            payload = bytes([cmd & 0xFF]) + bytes(payload)
        with self.lock:
            self.rx_frames += 1
            self.seq = (self.seq + 1) & 0xFF
            cmd_seq = self.seq
        fn = getattr(self, "_cmd_%d" % cmd, None)
        ack = ACK_OK
        if fn is None:
            ack = ACK_PARAM
        else:
            ack = fn(payload)
        self._ack(ack, cmd_seq)
        return cmd_seq

    def drain(self):
        out = []
        while True:
            try:
                out.append(self.frame_q.get_nowait())
            except queue.Empty:
                return out

    def quality_pct(self):
        return 100

    def close(self):
        self.alive = False

    # ---------------- فرمان‌ها ----------------
    def _cmd_1(self, pl):                       # ARM
        if self.armed:
            return ACK_STATE
        if not self._gps_fix():
            return ACK_STATE                    # پیش‌شرط فریم‌ور: فیکس GPS
        self.armed = True
        if not self.home_set:
            self.home_set = True
            self._event(EV_HOME_SET, 0)
        return ACK_OK

    def _cmd_2(self, pl):                       # DISARM
        self.armed = False
        self.mode = FM_NORMAL
        self.alt_target_m = 0.0
        return ACK_OK

    def _cmd_3(self, pl):                       # TAKEOFF
        if not self.armed or self.mode != FM_NORMAL:
            return ACK_STATE
        self.alt_target_m = max(2.0, self.alt_m + 2.0)
        self.mode = FM_TAKEOFF
        return ACK_OK

    def _cmd_4(self, pl):                       # LAND
        if not self.armed:
            return ACK_STATE
        self.mode = FM_LANDING
        return ACK_OK

    def _cmd_5(self, pl):                       # RTH
        if not self.armed or not self.home_set:
            return ACK_STATE
        self.mode = FM_RTH
        self.alt_target_m = max(2.0, self.alt_m + 2.0)
        return ACK_OK

    def _cmd_6(self, pl):                       # CAL_ACC
        if self.armed:
            return ACK_STATE
        self.calib_t = time.time() + 2.0
        return ACK_OK

    _cmd_7 = _cmd_6                             # CAL_MAG

    def _cmd_8(self, pl):                       # SAVE_CFG
        return ACK_OK

    def _cmd_9(self, pl):                       # MOTOR_TEST (v1.2 semantics)
        # توقف: pl[1]==0xFF (len>=2 با قرارداد pl[0]=cmd مطابق فریم‌ور)
        if len(pl) >= 2 and pl[1] == MOTOR_TEST_STOP_IDX:
            if self.mt_idx >= 0:
                self.mt_idx = -1
                self.mt_abort = 0
            return ACK_OK
        if len(pl) >= 4:
            if self.armed:
                return ACK_STATE                  # فقط دیس‌آرم
            idx, us = pl[1], pl[2] | (pl[3] << 8)
            if idx > 3:
                return ACK_PARAM
            us = max(1000, min(MOTOR_TEST_MAX_US, us))   # سقف فریم‌ور
            self.mt_idx, self.mt_us = idx, us
            self.mt_start = time.time()
            self.mt_abort = 0
            return ACK_OK
        return ACK_PARAM

    def _cmd_10(self, pl):                      # SET_HOVER
        if len(pl) >= 5:
            h = struct.unpack('<f', pl[1:5])[0]
            if HOVER_THR_MIN <= h <= HOVER_THR_MAX:
                self.hover = h
            else:
                return ACK_PARAM
        else:
            return ACK_PARAM
        return ACK_OK

    def _cmd_11(self, pl):                      # CANCEL
        self.mode = FM_NORMAL
        self.alt_target_m = self.alt_m
        return ACK_OK

    def _cmd_12(self, pl):                      # REBOOT
        self.reboot_t = time.time() + 3.0       # 3s سکوت تلمتری
        self.armed = False
        self.mode = FM_NORMAL
        self.alt_m = 0.0
        return ACK_OK

    def _cmd_13(self, pl):                      # CAL_ACC6 (v1.2: یک صورت)
        if self.armed:
            return ACK_STATE
        if len(pl) < 2 or pl[1] > 5:
            return ACK_PARAM
        self.cal_acc6_face = pl[1]
        self.cal_acc6_t = time.time() + 0.6     # ثبت ~0.6s مثل فریم‌ور
        return ACK_OK

    def _cmd_14(self, pl):                      # SET_MAG_MAT (v1.2)
        if len(pl) < 37:
            return ACK_PARAM
        if self.armed:
            return ACK_STATE
        self.mag_matrix = list(struct.unpack('<9f', pl[1:37]))
        self._event(EV_CALIB_DONE, 4)           # مثل flight_set_mag_matrix
        return ACK_OK

    # ---------------- داخلی ----------------
    def _ack(self, code, cmd_seq):
        """مطابق send_ack() فریم‌ور: [seq_فرمان][کد]"""
        self.frame_q.put(('frame', TYPE_ACK, cmd_seq, bytes([cmd_seq, code])))

    def _event(self, code, arg):
        with self.lock:
            self.seq = (self.seq + 1) & 0xFF
            seq = self.seq
        self.frame_q.put(('frame', TYPE_EVENT, seq, bytes([code, arg])))

    def _gps_fix(self):
        return (time.time() - self.t0) > 3.0

    def _sats(self):
        el = time.time() - self.t0
        return max(0, min(8, int(el / 0.6)))

    def _physics(self, dt):
        # کالیبراسیون تک‌محوره تمام‌شده؟
        if self.calib_t and time.time() > self.calib_t:
            self.calib_t = 0.0
            self._event(EV_CALIB_DONE, 0)
        # v1.2: ثبت صورت شش‌جهته — arg=10+face؛ صورت ششم → حل نهایی arg=3
        if self.cal_acc6_t and time.time() > self.cal_acc6_t:
            self.cal_acc6_t = 0.0
            face = self.cal_acc6_face
            self.cal_acc6_face = 0xFF
            self.acc6_faces |= (1 << face)
            self._event(EV_CALIB_DONE, 10 + face)
            if self.acc6_faces == 0x3F:
                self._event(EV_CALIB_DONE, 3)
        # v1.2: توقف خودکار تست موتور بعد از 2s (علت 3 مثل motors_test_tick)
        if self.mt_idx >= 0 and \
                (time.time() - self.mt_start) * 1000.0 >= MOTOR_TEST_AUTO_STOP_MS:
            self.mt_idx = -1
            self.mt_abort = 3
        # باتری
        if self.armed:
            self.batt_pct = max(0.0, self.batt_pct - dt * (100.0 / 240.0))
            self.consumed_mah += dt * 4.5                       # ~4.5A دمو
        if self.batt_pct < 20.0 and not self.low_batt_warned:
            self.low_batt_warned = True
            self._event(EV_LOW_BATT, int(self.batt_pct))
            if self.armed:
                self.failssafe_land = True
                self._event(EV_FAILSAFE, 0)
                self.mode = FM_LANDING
        if self.batt_pct <= 0:
            self.armed = False
        # حرکت عمودی
        tgt_v = 0.0
        if self.mode == FM_TAKEOFF:
            tgt_v = 0.8 if self.alt_m < self.alt_target_m else 0.0
            if self.alt_m >= self.alt_target_m - 0.05:
                self.mode = FM_NORMAL
                if not self.hover_learned:
                    self.hover_learned = True
                    self._event(EV_HOVER_LEARN, int(self.hover * 200))
        elif self.mode == FM_LANDING:
            tgt_v = -0.6 if self.alt_m > 0.02 else 0.0
        elif self.mode == FM_RTH:
            # بازگشت افقی به خانه
            dlat = HOME_LAT0 - self.lat
            dlon = HOME_LON0 - self.lon
            step = int(1600 * dt)             # ~1.6 m/s در e7 تقریبی
            self.lat += max(-step, min(step, dlat))
            self.lon += max(-step, min(step, dlon))
            if abs(dlat) < 200 and abs(dlon) < 200:
                self.alt_target_m = 0.0
                self.mode = FM_LANDING
            else:
                tgt_v = 0.5 if self.alt_m < self.alt_target_m else 0.0
        else:
            tgt_v = 0.0
        # همگرایی ارتفاع
        if tgt_v:
            self.alt_m = max(0.0, self.alt_m + tgt_v * dt)
            self.vy = tgt_v
        elif self.mode == FM_NORMAL and self.armed:
            self.vy = 0.0                     # هولد ارتفاع
        else:
            self.alt_m = max(0.0, self.alt_m - 2.0 * dt) if self.alt_m > 0 else 0.0
            self.vy = -2.0 if self.alt_m > 0 else 0.0
        # فرود تمام‌شده
        if self.mode == FM_LANDING and self.alt_m <= 0.02:
            self._event(EV_LANDED, 0)
            self.mode = FM_NORMAL
            self.armed = False                # دیس‌آرم خودکار طبق تم
            self.alt_target_m = 0.0

    def _status_frame(self):
        fix = self._gps_fix()
        sats = self._sats()
        # ولتاژ 3S با افت بار
        volt = 10.5 + 0.021 * self.batt_pct
        if self.armed:
            volt -= 0.45
        volt_c = int(volt * 100)
        sonar_cm = self.alt_m * 100.0 if self.alt_m < 4.0 else -1.0
        flags = F_RC_OK
        if self.armed:
            flags |= F_ARMED
        if fix:
            flags |= F_GPS_FIX
        if self.mode in (FM_TAKEOFF, FM_LANDING, FM_RTH):
            flags |= F_AUTO
        gb = ((sats & 0x0F) << 4) | (0x08 if fix else 0) | (0x04 if sats >= 5 else 0)
        # بایت سلامت v2 (شبیه‌ساز: همه سنسورها سالم، بتدریج GPS)
        health = 0x01 | 0x02 | 0x10          # IMU + BARO + ALT_VALID
        if self.alt_m < 4.0:
            health |= 0x04                   # SONAR_OK
        if fix:
            health |= 0x08                   # GPS_FRESH
        if not self.armed and self.batt_pct < 20.0:
            pass
        if self.batt_pct < 20.0:
            health |= 0x20                   # RC_FAILSAFE جای‌گذار: نماد failsafe
        man_state = {FM_NORMAL: 1, FM_HEADLESS: 1,
                     FM_TAKEOFF: 10, FM_LANDING: 20, FM_RTH: 30}[self.mode]
        if not self.armed:
            man_state = 0
        p = bytearray()
        p += _p16(2.0 * 100)                          # roll ثابت دمو
        p += _p16(-1.5 * 100)                         # pitch
        p += _p16(37.0 * 100)                         # yaw
        p += _p16(self.alt_m * 100)                   # alt cm
        p += _p16(sonar_cm * 10)                      # sonar cm*10
        p += _p16(volt_c)
        p += bytes([int(self.batt_pct)])
        p += _p32(HOME_LAT0 if self.home_set else 0)
        p += _p32(HOME_LON0 if self.home_set else 0)
        p += _p32(self.lat)
        p += _p32(self.lon)
        p += _p16(0 if self.mode == FM_NORMAL else 160)   # speed
        p += _p16(3700)                               # course
        p += bytes([gb])
        p += bytes([self.mode])
        p += bytes([1 if self.armed else 0])
        p += bytes([flags])
        p += bytes([int(self.hover * 200)])
        p += bytes([100])                             # کیفیت از دید کواد
        p += _p16(self.alt_target_m * 10)             # alt_target dm
        p += bytes([health])                          # v2: سلامت
        p += bytes([man_state])                       # v2: وضعیت مانور
        # --- v3 (پروتکل 1.2 / فریم‌ور v2.2): فیلدهای لاگ/سلامت ---
        p += _p16(780)                                # loop_max_us (WCET دمو)
        p += _p16(0)                                  # overruns
        p += _p16(int(getattr(self, 'vy', 0.0) * 100))  # vz cm/s
        p += bytes([0])                               # rc_age ×10ms (RC سالم)
        p += bytes([0])                               # arm_denied
        p += bytes([0x08])                            # health2: سنسور جریان حاضر
        # home_gate مثل nav_home_gate_fail(): بدون فیکس/ماهواره کم = رد
        if not fix:
            hg = 0x01 | 0x02
        elif sats < 6:
            hg = 0x02
        else:
            hg = 0
        p += bytes([hg])
        # motor_test: 0x80=فعال | بیت‌های 0..2 = آخرین دلیل توقف
        mt = (MOTOR_TEST_ACTIVE_MASK | (self.mt_abort & 0x07)) \
            if self.mt_idx >= 0 else (self.mt_abort & 0x07)
        p += bytes([mt])
        assert len(p) == 54, "STATUS demo v1.2 must be 54 bytes"
        return bytes(p)

    def _debug_frame(self, slot):
        """مثل send_debug_slot() فریم‌ور: [slot][4×float LE] — 17 بایت"""
        fix = self._gps_fix()
        roll, pitch, yaw = 2.0, -1.5, 37.0
        alt = self.alt_m
        volt = 10.5 + 0.021 * self.batt_pct - (0.45 if self.armed else 0.0)
        cur_ca = 450.0 if self.armed else 0.0        # جریان cA (اسلات 11)
        pulse = 1000 + (self.mt_us - 1000 if self.mt_idx >= 0 else 0)
        vals = {
            0:  (2.0, 2000.0, roll, pitch),
            1:  (yaw, 0.1, -0.2, 0.05),
            2:  (0.01, -0.02, 1.0, self.hover),
            3:  (0.0, 0.0, 0.0, 1.5),
            4:  (0.3, -0.4, 1.3, 10.0),
            5:  (0.07, pulse, pulse, pulse),
            6:  (pulse, alt, getattr(self, 'vy', 0.0),
                 alt * 100.0 if alt < 4.0 else -1.0),
            7:  (alt, 0.4, float(self.lat), float(self.lon)),
            8:  (0.0, volt, float(0x02 | 0x04 | (0x08 if fix else 0) |
                                  (0x01 if self.armed else 0)),
                 0.0),
            9:  (620.0, 480.0, 350.0, 210.0),           # HWM واژه ×4 تسک
            10: (180.0, 140.0, 90.0, 14336.0),          # + مینیمم هیپ بایت
            11: (float(self.i2c_timeouts), float(self.mag_rejected),
                 self.consumed_mah, cur_ca),
        }[slot % DEBUG_SLOT_COUNT]
        return bytes([slot % DEBUG_SLOT_COUNT]) + struct.pack('<4f', *vals)

    def _run(self):
        t_status = 0.0
        t_hb = 0.0
        t_dbg = 0.0
        dbg_slot = 0
        while self.alive:
            now = time.time()
            dt = min(0.1, now - self.last)
            self.last = now
            if self.reboot_t:
                if now < self.reboot_t:
                    time.sleep(0.02)
                    continue          # سکوت هنگام ریبوت
                self.reboot_t = 0.0
            self._physics(dt)
            if now - t_status >= 0.1:                  # 10Hz
                t_status = now
                with self.lock:
                    self.seq = (self.seq + 1) & 0xFF
                    s = self.seq
                self.frame_q.put(('frame', TYPE_STATUS, s, self._status_frame()))
            if now - t_hb >= 0.5:                      # 2Hz
                t_hb = now
                fix = self._gps_fix()
                fl = F_RC_OK | F_GCS_OK | (F_ARMED if self.armed else 0) | \
                     (F_GPS_FIX if fix else 0) | \
                     (F_AUTO if self.mode in (FM_TAKEOFF, FM_LANDING, FM_RTH) else 0)
                with self.lock:
                    self.seq = (self.seq + 1) & 0xFF
                    s = self.seq
                self.frame_q.put(('frame', TYPE_HEARTBEAT, s,
                                  bytes([fl, self.mode, 100, int(now) & 0xFF])))
            if now - t_dbg >= 0.5:                     # 2Hz مثل DEBUG_HZ فریم‌ور
                t_dbg = now
                with self.lock:
                    self.seq = (self.seq + 1) & 0xFF
                    s = self.seq
                self.frame_q.put(('frame', TYPE_DEBUG, s,
                                  self._debug_frame(dbg_slot)))
                dbg_slot = (dbg_slot + 1) % DEBUG_SLOT_COUNT
            time.sleep(0.01)
