# -*- coding: utf-8 -*-
"""Ground Control Station فارسی — QuadFC F103

✅ اصلاح #۳ (نخ‌امنی tkinter): همه فریم‌ها چه از QuadLink (نخ RX سریال) و
   چه از DemoLink در صف می‌روند و فقط در نخ اصلی داخل _poll() مصرف می‌شوند.
   هیچ متد ویجت tkinter از نخ کارگر صدا زده نمی‌شود.
"""
import time
import tkinter as tk
from tkinter import ttk, messagebox

from protocol import (TYPE_HEARTBEAT, TYPE_STATUS, TYPE_ACK, TYPE_EVENT,
                      TYPE_DEBUG, CMD_ARM, CMD_DISARM, CMD_TAKEOFF, CMD_LAND,
                      CMD_RTH, CMD_CAL_ACC, CMD_CAL_MAG, CMD_SAVE_CFG,
                      CMD_MOTOR_TEST, CMD_SET_HOVER, CMD_CANCEL, CMD_REBOOT,
                      CMD_CAL_ACC6,
                      ACK_OK, ACK_PARAM,
                      EV_HOME_SET, EV_HOVER_LEARN, EV_CALIB_DONE,
                      EV_FAILSAFE, EV_LANDED, EV_LOW_BATT, EV_LINK_LOST,
                      FM_NORMAL, FM_HEADLESS, FM_TAKEOFF, FM_LANDING, FM_RTH,
                      SYS_ARMED,
                      F_ARMED, F_RC_OK, F_GCS_OK, F_GPS_FIX, F_FAILSAFE, F_AUTO,
                      HOVER_THR_MIN, HOVER_THR_MAX,
                      HEALTH_IMU_OK, HEALTH_BARO_OK, HEALTH_SONAR_OK,
                      HEALTH_GPS_FRESH, HEALTH_ALT_VALID, HEALTH_RC_FAILSAFE,
                      HEALTH_GCS_FAILSAFE, HEALTH_MOTOR_FAULT,
                      H2_GYRO_CAL_STALE, H2_MAG_FIELD_BAD, H2_CURRENT_SENSOR,
                      HOME_GATE_GPS_NOT_FRESH, HOME_GATE_SATS_LT6,
                      HOME_GATE_HDOP_GT2, HOME_GATE_SPEED_HIGH,
                      HOME_GATE_POS_UNSTABLE,
                      ARM_DENY_RC, ARM_DENY_THROTTLE, ARM_DENY_IMU,
                      ARM_DENY_CALIB, ARM_DENY_GYRO_STAT, ARM_DENY_ACC_LEVEL,
                      ARM_DENY_BATTERY, ARM_DENY_ALTITUDE,
                      MOTOR_TEST_ACTIVE_MASK, MOTOR_TEST_ABORT_MASK,
                      MOTOR_TEST_MAX_US, MOTOR_TEST_AUTO_STOP_MS,
                      MOTOR_TEST_ABORT_NAMES,
                      CAL_ARG_FAIL, CAL_ARG_ACC6_SOLVED, CAL_ARG_ACC6_FACE0,
                      DEBUG_SLOT_COUNT, DEBUG_SLOT_LABELS,
                      parse_status, parse_ack, parse_event, parse_heartbeat,
                      parse_debug,
                      cmd_motor_test, cmd_motor_test_stop, cmd_set_hover,
                      cmd_cal_acc6, cmd_set_mag_matrix)
from link import QuadLink, list_serial_ports
from widgets import ArtificialHorizon, CompassWidget, StripChart

POLL_MS = 60
ACK_TIMEOUT_S = 3.0
LINK_DEAD_S = 1.5            # هم‌تراز فریم‌ور: FS_HB_LOST_COUNT x 500ms
LOOP_US_RED = 2500           # آستانه قرمز WCET حلقه

MODE_NAMES = {FM_NORMAL: "عادی (خودتراز+هولد)", FM_HEADLESS: "هدلس",
              FM_TAKEOFF: "برخاست خودکار", FM_LANDING: "فرود خودکار",
              FM_RTH: "بازگشت به خانه"}
ACK_NAMES = {0: "موفق", 1: "مشغول", 2: "حالت نامعتبر",
             3: "کالیبراسیون نامعتبر", 4: "پارامتر نامعتبر"}
EV_NAMES = {EV_HOME_SET: "ثبت خانه", EV_HOVER_LEARN: "یادگیری هاور",
            EV_CALIB_DONE: "کالیبراسیون کامل شد", EV_FAILSAFE: "ورود به Failsafe",
            EV_LANDED: "فرود انجام شد", EV_LOW_BATT: "باتری کم",
            EV_LINK_LOST: "قطع لینک"}

# --- v1.2: رمزگشایی args رخداد کالیبراسیون (EVT_CALIB_DONE) ---
def calib_arg_name(arg):
    if arg == CAL_ARG_FAIL:          return "ناموفق (لرزان/جابه‌جا)"
    if arg == 1:                     return "ذخیره شد"
    if arg == 2:                     return "کالیبراسیون مگ انجام شد"
    if arg == CAL_ARG_ACC6_SOLVED:   return "شش‌جهته حل و اعمال شد ✓"
    if arg == 4:                     return "ماتریس مگ اعمال شد ✓"
    if CAL_ARG_ACC6_FACE0 <= arg <= 15:
        return f"صورت {arg - CAL_ARG_ACC6_FACE0} شش‌جهته ثبت شد"
    return str(arg)

# --- v1.2: برچسب‌های فارسی بایت‌های بیت‌ماسی STATUS v3 ---
ARM_DENY_NAMES = [
    (ARM_DENY_RC,        "RC"),
    (ARM_DENY_THROTTLE,  "گاز بالا"),
    (ARM_DENY_IMU,       "IMU"),
    (ARM_DENY_CALIB,     "کالیبراسیون"),
    (ARM_DENY_GYRO_STAT, "ژیرو ساکن نیست"),
    (ARM_DENY_ACC_LEVEL, "شتاب تراز نیست"),
    (ARM_DENY_BATTERY,   "باتری"),
    (ARM_DENY_ALTITUDE,  "ارتفاع"),
]
HOME_GATE_NAMES = [
    (HOME_GATE_GPS_NOT_FRESH, "GPS تازه نیست"),
    (HOME_GATE_SATS_LT6,      "ماهواره < 6"),
    (HOME_GATE_HDOP_GT2,      "HDOP > 2.0"),
    (HOME_GATE_SPEED_HIGH,    "سرعت > 1.5m/s"),
    (HOME_GATE_POS_UNSTABLE,  "موقعیت ناپایدار"),
]

# جهت موتورها (Betaflight Quad-X — تأییدشده با MIX_M* در fc_config.h):
MOTOR_HINTS = ["عقب-راست CCW", "جلو-راست CW", "عقب-چپ CW", "جلو-چپ CCW"]
# متن‌های «عقل میکسر» — فقط نمایش؛ هیچ فرمانی ارسال نمی‌شود
MIXER_SANITY = {
    "ROLL":  "رول راست (+):\n  تندتر:  M3 عقب-چپ ↑ ، M4 جلو-چپ ↑\n"
             "  کندتر:  M1 عقب-راست ↓ ، M2 جلو-راست ↓",
    "PITCH": "پیچ مثبت (دماغه پایین):\n"
             "  تندتر:  M1 عقب-راست ↑ ، M3 عقب-چپ ↑\n"
             "  کندتر:  M2 جلو-راست ↓ ، M4 جلو-چپ ↓",
    "YAW":   "یاو مثبت (پادساعتگرد از بالا):\n"
             "  تندتر:  M2 جلو-راست ↑ ، M3 عقب-چپ ↑  (پروانه CW)\n"
             "  کندتر:  M1 عقب-راست ↓ ، M4 جلو-چپ ↓",
}

BG, FG, OK, WARN, ERR = "#0b0f14", "#d8e0e8", "#7cd67c", "#ffb300", "#ff6b6b"


class App:
    def __init__(self, root):
        self.root = root
        root.title("Ground Control Station — QuadFC F103")
        root.geometry("1180x720")
        root.configure(bg=BG)
        self.link = None            # QuadLink سخت‌افزاری
        self.demo = None            # شبیه‌ساز
        self.last_frame_t = 0.0
        self.pending = {}           # seq → (label, t0) برای نظارت ACK
        self.stats = {'rx': 0, 'crc': 0}
        self.stack_hwm = {}         # اسلات‌های 9/10 دیباگ: برچسب → مقدار
        self._build_ui()
        self._poll()

    # ================= ساخت رابط =================
    def _build_ui(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure(".", background=BG, foreground=FG,
                        fieldbackground="#141b22")
        style.configure("TButton", padding=4)
        style.configure("TFrame", background=BG)
        style.configure("TLabel", background=BG, foreground=FG)
        style.configure("TCombobox", fieldbackground="#141b22")

        left = ttk.Frame(self.root)
        left.place(x=8, y=8, width=252, height=660)
        center = ttk.Frame(self.root)
        center.place(x=268, y=8, width=520, height=660)
        right = ttk.Frame(self.root)
        right.place(x=796, y=8, width=376, height=660)
        self.status = tk.Label(self.root, bg="#10161d", fg=FG, anchor="e",
                               font=("TkDefaultFont", 10, "bold"))
        self.status.place(x=8, y=678, width=1164, height=30)

        # ---- ستون چپ: اتصال و فرمان‌ها ----
        conn = ttk.LabelFrame(left, text=" اتصال ")
        conn.pack(fill="x", pady=(0, 6))
        self.cmb_port = ttk.Combobox(conn, values=list_serial_ports(),
                                     state="readonly", width=14)
        self.cmb_port.set("DEMO")
        self.cmb_port.grid(row=0, column=0, padx=3, pady=3, sticky="we")
        ttk.Button(conn, text="↺", width=3, command=self._refresh).grid(
            row=0, column=1, padx=3)
        self.cmb_baud = ttk.Combobox(conn, values=["9600", "19200", "38400",
                                                   "57600", "115200"],
                                     width=6)
        self.cmb_baud.set("9600")
        self.cmb_baud.grid(row=1, column=0, padx=3, pady=3, sticky="we")
        self.btn_conn = ttk.Button(conn, text="اتصال", command=self._toggle_conn)
        self.btn_conn.grid(row=1, column=1, padx=3)
        self.btn_demo = ttk.Button(conn, text="حالت دمو",
                                   command=self._toggle_demo)
        self.btn_demo.grid(row=2, column=0, columnspan=2, sticky="we", padx=3)

        fly = ttk.LabelFrame(left, text=" فرمان‌های پرواز ")
        fly.pack(fill="x", pady=6)
        for i, (txt, fn, col) in enumerate([
                ("آرم ▲", lambda: self._send(CMD_ARM, b"", "ARM"), 0),
                ("دیس‌آرم ▼", lambda: self._send(CMD_DISARM, b"", "DISARM"), 1),
                ("برخاست", self._send_takeoff, 0),
                ("فرود", lambda: self._send(CMD_LAND, b"", "LAND"), 1),
                ("RTH", lambda: self._send(CMD_RTH, b"", "RTH"), 0),
                ("لغو خودکار", lambda: self._send(CMD_CANCEL, b"", "CANCEL"), 1)]):
            ttk.Button(fly, text=txt, command=fn, width=11).grid(
                row=i // 2, column=col, padx=4, pady=3, sticky="we")
        row_tk = ttk.Frame(fly)
        row_tk.grid(row=3, column=0, columnspan=2, pady=2)
        tk.Label(row_tk, text="هدف برخاست (m):", bg=BG, fg=FG).pack(side="right")
        self.spin_alt = tk.Spinbox(row_tk, from_=1, to=50, width=4)
        self.spin_alt.delete(0, "end")
        self.spin_alt.insert(0, "2")
        self.spin_alt.pack(side="right", padx=4)

        util = ttk.LabelFrame(left, text=" ابزارها ")
        util.pack(fill="x", pady=6)
        ttk.Button(util, text="کالیبراسیون ACCEL",
                   command=lambda: self._send(CMD_CAL_ACC, b"", "CAL_ACC")).grid(
            row=0, column=0, padx=4, pady=2, sticky="we")
        ttk.Button(util, text="کالیبراسیون MAG",
                   command=lambda: self._send(CMD_CAL_MAG, b"", "CAL_MAG")).grid(
            row=0, column=1, padx=4, sticky="we")
        ttk.Button(util, text="ذخیره تنظیمات",
                   command=lambda: self._send(CMD_SAVE_CFG, b"", "SAVE_CFG")).grid(
            row=1, column=0, padx=4, sticky="we")
        ttk.Button(util, text="ریبوت برد",
                   command=lambda: self._send(CMD_REBOOT, b"", "REBOOT")).grid(
            row=1, column=1, padx=4, sticky="we")
        row_hv = ttk.Frame(util)
        row_hv.grid(row=2, column=0, columnspan=2, pady=3)
        tk.Label(row_hv, text="گاز هاور (0.35-0.75):", bg=BG, fg=FG).pack(side="right")
        self.ent_hover = tk.Entry(row_hv, width=6)
        self.ent_hover.insert(0, "0.50")
        self.ent_hover.pack(side="right", padx=2)
        ttk.Button(row_hv, text="ارسال",
                   command=self._send_hover).pack(side="right", padx=3)

        # --- v1.2: کالیبراسیون ۶-جهته شتاب (CMD_CAL_ACC6، هر بار یک صورت) ---
        cal6 = ttk.LabelFrame(left, text=" کالیبراسیون ۶-جهته شتاب ")
        cal6.pack(fill="x", pady=6)
        self.cal6_done = set()          # صورت‌های ثبت‌شده (arg 10..15)
        self.lbl_cal6 = tk.Label(cal6, text="برد را دقیقاً در جهت خواسته‌شده "
                                 "ثابت نگه دارید", bg=BG, fg=FG,
                                 justify="right", wraplength=232,
                                 font=("TkDefaultFont", 8))
        self.lbl_cal6.pack(fill="x", padx=3)
        grid6 = ttk.Frame(cal6)
        grid6.pack(fill="x", pady=2)
        self._acc6_orient = ["برد تخت، Z رو به بالا",
                             "برد برعکس، Z رو به پایین",
                             "لبه راست پایین، +X رو به بالا",
                             "لبه چپ پایین، −X رو به بالا",
                             "دماغه پایین، +Y رو به بالا",
                             "دماغه بالا، −Y رو به بالا"]
        acc6_labels = ["0: +Z بالا", "1: −Z بالا", "2: +X بالا",
                       "3: −X بالا", "4: +Y بالا", "5: −Y بالا"]
        for face in range(6):
            ttk.Button(grid6, text=acc6_labels[face], width=9,
                       command=lambda f=face: self._send_acc6(f)).grid(
                row=face // 3, column=face % 3, padx=3, pady=2, sticky="we")
        ttk.Button(cal6, text="ارسال ماتریس مگ (۳×۳)…",
                   command=self._open_mag_matrix).pack(fill="x", padx=3,
                                                       pady=(2, 3))

        # ---- ستون وسط: ابزارهای پروازی ----
        self.horizon = ArtificialHorizon(center)
        self.horizon.pack(fill="both", expand=True)
        mid = ttk.Frame(center)
        mid.pack(fill="x", pady=3)
        self.compass = CompassWidget(mid)
        self.compass.pack(side="left")
        info = tk.Label(mid, text="", bg=BG, fg=FG, justify="right",
                        font=("TkDefaultFont", 11), anchor="e")
        info.pack(side="right", expand=True, fill="both")
        self.lbl_info = info
        self.chart = StripChart(center, n=180)
        self.chart.pack(fill="x", side="bottom")

        # ---- ستون راست: دفترچه تب (لاگ / سلامت v1.2 / تست موتور) ----
        nb = ttk.Notebook(right)
        nb.pack(fill="both", expand=True)
        tab_log = ttk.Frame(nb)
        tab_health = ttk.Frame(nb)
        tab_mt = ttk.Frame(nb)
        nb.add(tab_log, text=" لاگ و آمار ")
        nb.add(tab_health, text=" سلامت و لاگ v1.2 ")
        nb.add(tab_mt, text=" تست موتور ⚠ ")
        self.nb_right = nb

        # --- تب ۱: لاگ + آمار لینک ---
        self.txt_log = tk.Text(tab_log, bg="#10161d", fg=FG, state="disabled",
                               font=("Consolas", 9), width=44, height=24)
        self.txt_log.pack(fill="both", expand=True)
        for tag, color in (("info", "#8ab4d8"), ("ok", OK), ("warn", WARN),
                           ("err", ERR), ("rx", "#6a7a8a"), ("ev", "#c792ea")):
            self.txt_log.tag_configure(tag, foreground=color)
        stats = ttk.LabelFrame(tab_log, text=" آمار لینک ")
        stats.pack(fill="x", pady=4)
        self.lbl_stats = tk.Label(stats, text="", bg=BG, fg=FG, anchor="w",
                                  justify="left", font=("Consolas", 9))
        self.lbl_stats.pack(fill="x")
        self.lbl_health = tk.Label(stats, text="سلامت: —", bg=BG, fg=FG,
                                   anchor="w", font=("TkDefaultFont", 9, "bold"))
        self.lbl_health.pack(fill="x")

        # --- تب ۲: سلامت/لاگ v1.2 (فیلدهای جدید STATUS v3 + اسلات‌های دیباگ) ---
        self.lbl_v3 = {}
        v3_rows = [
            ('loop',   "طولانی‌ترین حلقه: —"),
            ('ovr',    "سرریز حلقه: —"),
            ('vz',     "سرعت صعود: —"),
            ('rc_age', "عمر فریم RC: —"),
            ('deny',   "دلیل رد آرم: —"),
            ('h2',     "حس‌گرها: —"),
            ('gate',   "گیت خانه: —"),
            ('mt',     "تست موتور: —"),
            ('s11',    "I2C تایم‌اوت: —  |  رد مگ: —"),
            ('mah',    "مصرف: —  |  جریان: —"),
            ('stack',  "پشته (واژه): —"),
            ('heap',   "مینیمم هیپ آزاد: —"),
        ]
        for key, txt in v3_rows:
            lbl = tk.Label(tab_health, text=txt, bg=BG, fg=FG, anchor="w",
                           justify="left", font=("Consolas", 9))
            lbl.pack(fill="x", padx=4, pady=1)
            self.lbl_v3[key] = lbl
        self.txt_dbg = tk.Text(tab_health, bg="#10161d", fg="#6a7a8a",
                               state="disabled", font=("Consolas", 8),
                               width=46, height=8)
        self.txt_dbg.pack(fill="both", expand=True, padx=4, pady=4)

        # --- تب ۳: تست موتور (v1.2: سقف 1150µs، خودقطع 2s، فقط دیس‌آرم) ---
        tk.Label(tab_mt, text="⚠ REMOVE PROPELLERS BEFORE ANY MOTOR TEST ⚠\n"
                              "پره‌ها را قبل از هر تست موتور جدا کنید!",
                 bg="#3a0d0d", fg=ERR, justify="center",
                 font=("TkDefaultFont", 11, "bold")).pack(fill="x", pady=4)
        row_p = ttk.Frame(tab_mt)
        row_p.pack(fill="x", pady=2)
        tk.Label(row_p, text="پالس تست (µs، سقف 1150، خودقطع ۲ ثانیه):",
                 bg=BG, fg=FG).pack(side="right")
        self.spin_mt = tk.Spinbox(row_p, from_=1000, to=MOTOR_TEST_MAX_US,
                                  increment=10, width=6)
        self.spin_mt.delete(0, "end")
        self.spin_mt.insert(0, "1100")
        self.spin_mt.pack(side="right", padx=4)
        for m in range(4):
            row = ttk.Frame(tab_mt)
            row.pack(fill="x", pady=2)
            tk.Label(row, text=f"M{m + 1} — {MOTOR_HINTS[m]}", bg=BG, fg=FG,
                     anchor="e", width=22).pack(side="right", padx=4)
            ttk.Button(row, text="اجرای ۲ثانیه", width=12,
                       command=lambda idx=m: self._motor_run(idx)).pack(
                side="left", padx=4)
        self.btn_mt_stop = tk.Button(tab_mt, text="■ STOP — توقف فوری",
                                     bg="#5a1010", fg="#ffffff", activebackground="#7a2020",
                                     font=("TkDefaultFont", 11, "bold"),
                                     command=self._motor_stop)
        self.btn_mt_stop.pack(fill="x", padx=6, pady=6)
        self.lbl_mt = tk.Label(tab_mt, text="وضعیت: —", bg=BG, fg=FG,
                               anchor="w", font=("TkDefaultFont", 9, "bold"))
        self.lbl_mt.pack(fill="x", padx=6)
        row_mix = ttk.Frame(tab_mt)
        row_mix.pack(fill="x", pady=3)
        for col, name in enumerate(("ROLL", "PITCH", "YAW")):
            ttk.Button(row_mix, text=name + " TEST",
                       command=lambda n=name: self._show_mixer(n)).grid(
                row=0, column=col, padx=3, sticky="we")
        self.txt_mix = tk.Text(tab_mt, bg="#10161d", fg=FG, state="disabled",
                               font=("Consolas", 9), width=46, height=7)
        self.txt_mix.pack(fill="both", expand=True, padx=6, pady=4)

    # ================= اتصال / دمو =================
    def _refresh(self):
        self.cmb_port["values"] = list_serial_ports()

    def _toggle_conn(self):
        if self.link or self.demo:
            self._disconnect()
        else:
            self._connect()

    def _connect(self):
        port = self.cmb_port.get()
        if not port or port == "DEMO":
            messagebox.showinfo("اتصال", "ابتدا پورت سریال را انتخاب کنید "
                                        "یا از حالت دمو استفاده کنید.")
            return
        try:
            baud = int(self.cmb_baud.get())
            self.link = QuadLink(port, baud=baud)
        except Exception as e:
            messagebox.showerror("اتصال", f"باز کردن پورت ممکن نشد:\n{e}")
            self.link = None
            return
        self.btn_conn.config(text="قطع")
        self._log(f"متصل شد: {port} @ {baud}", "ok")

    def _toggle_demo(self):
        if self.link or self.demo:
            self._disconnect()
        else:
            from demo import DemoLink
            self.demo = DemoLink()
            self.btn_demo.config(text="پایان دمو")
            self._log("حالت دمو فعال شد — شبیه‌ساز پرواز", "info")

    def _disconnect(self):
        if self.link:
            self.link.close()
            self.link = None
        if self.demo:
            self.demo.close()
            self.demo = None
        self.btn_conn.config(text="اتصال")
        self.btn_demo.config(text="حالت دمو")
        self._set_link_state(False)
        self._log("قطع شد", "info")

    # ================= ارسال فرمان =================
    def _sender(self):
        return self.demo or self.link

    def _send(self, cmd, payload=b"", label=""):
        s = self._sender()
        if not s:
            self._log("ابتدا متصل شوید", "warn")
            return
        try:
            seq = s.send_command(cmd, payload)
        except Exception as e:
            self._log(f"خطای ارسال: {e}", "err")
            return
        if hasattr(s, 'frame_q'):            # ثبت برای نظارت ACK
            self.pending[seq] = (label or hex(cmd), time.time())
        self._log(f"→ فرمان {label}", "info")

    def _send_takeoff(self):
        try:
            m = float(self.spin_alt.get())
        except ValueError:
            m = 2.0
        m = max(1.0, min(50.0, m))
        # فریم‌ور TAKEOFF هدف را خودش +2m می‌گیرد؛ برای دمو دقیق‌تر ارسال ساده
        self._send(CMD_TAKEOFF, b"", f"TAKEOFF({m:.0f}m)")

    # --- v1.2: تست موتور امن (سقف 1150µs، خودقطع 2s فریم‌ور، فقط دیس‌آرم) ---
    def _motor_run(self, idx):
        try:
            us = int(self.spin_mt.get())
        except ValueError:
            self._log("پالس تست نامعتبر", "err")
            return
        us = max(1000, min(MOTOR_TEST_MAX_US, us))
        self._send(cmd_motor_test(idx, us), b"",
                   f"MOTOR_TEST[M{idx + 1}@{us}us]")
        self._log("هشدار: تست موتور — پره‌ها را جدا کنید!", "err")

    def _motor_stop(self):
        self._send(cmd_motor_test_stop(), b"", "MOTOR_TEST_STOP")

    # --- v1.2: کالیبراسیون ۶-جهته — هر فراخوان یک صورت ---
    def _send_acc6(self, face):
        self._send(cmd_cal_acc6(face), b"", f"CAL_ACC6[face{face}]")
        self.lbl_cal6.config(text=(f"صورت {face}: {self._acc6_orient[face]}\n"
                                   "برد را کاملاً ساکن نگه دارید…"), fg=WARN)

    def _update_cal6_progress(self, arg):
        """تغذیه پیشرفت از EVT_CALIB_DONE (arg 10..15 ثبت صورت، 3 حل نهایی)"""
        if CAL_ARG_ACC6_FACE0 <= arg <= 15:
            self.cal6_done.add(arg - CAL_ARG_ACC6_FACE0)
        if arg == CAL_ARG_ACC6_SOLVED:
            self.lbl_cal6.config(text="هر ۶ صورت ثبت و حل شد ✓ (اعمال شد)", fg=OK)
            return
        done = sorted(self.cal6_done)
        missing = [str(f) for f in range(6) if f not in done]
        self.lbl_cal6.config(text=("ثبت‌شده: " + ("،".join(map(str, done)) or "—") +
                                   "  |  باقی: " +
                                   ("،".join(missing) or "—")), fg=FG)

    # --- v1.2: دیالوگ ارسال ماتریس نرم‌آهنی مگ (CMD_SET_MAG_MAT) ---
    def _open_mag_matrix(self):
        win = tk.Toplevel(self.root)
        win.title("ماتریس نرم‌آهنی مگ — CMD_SET_MAG_MAT")
        win.configure(bg=BG)
        tk.Label(win, text="۹ مقدار سطر-اصلی (m00 m01 m02 m10 …):",
                 bg=BG, fg=FG).pack(padx=8, pady=4)
        ents = []
        ident = [["1.000", "0.000", "0.000"],
                 ["0.000", "1.000", "0.000"],
                 ["0.000", "0.000", "1.000"]]
        grid = ttk.Frame(win)
        grid.pack(padx=8, pady=4)
        for r in range(3):
            for c in range(3):
                e = tk.Entry(grid, width=9, justify="center")
                e.insert(0, ident[r][c])
                e.grid(row=r, column=c, padx=3, pady=3)
                ents.append(e)

        def send():
            try:
                m = [float(e.get()) for e in ents]
            except ValueError:
                messagebox.showerror("ماتریس مگ", "همه ۹ مقدار باید عدد باشند.")
                return
            self._send(cmd_set_mag_matrix(m), b"", "SET_MAG_MAT")
            win.destroy()

        ttk.Button(win, text="ارسال به برد", command=send).pack(pady=6)

    # --- v1.2: متن‌های عقل میکسر (فقط نمایش — هیچ فرمانی ارسال نمی‌شود) ---
    def _show_mixer(self, name):
        self.txt_mix.config(state="normal")
        self.txt_mix.delete("1.0", "end")
        self.txt_mix.insert("end", MIXER_SANITY[name])
        self.txt_mix.config(state="disabled")

    def _send_hover(self):
        try:
            h = float(self.ent_hover.get())
        except ValueError:
            self._log("گاز هاور نامعتبر", "err")
            return
        if not (HOVER_THR_MIN <= h <= HOVER_THR_MAX):
            self._log(f"هاور خارج از محدوده {HOVER_THR_MIN}–{HOVER_THR_MAX}",
                      "err")
            return
        self._send(cmd_set_hover(h), b"", f"SET_HOVER({h:.2f})")

    # ================= حلقه اصلی (نخ tkinter) =================
    def _poll(self):
        now = time.time()
        # تخلیه صف — همیشه در نخ اصلی (اصلاح #۳)
        if self.link:
            for kind, t, s_, p in self.link.drain():
                if kind == 'frame':
                    self._on_frame_ui(t, s_, p)
                else:
                    self.stats['crc'] += 1
                    self._log("فریم خراب (CRC) رد شد", "warn")
        if self.demo:
            for kind, t, s_, p in self.demo.drain():
                if kind == 'frame':
                    self._on_frame_ui(t, s_, p)
        # نظارت لینک و ACK
        if (self.link or self.demo) and self.last_frame_t and \
                now - self.last_frame_t > LINK_DEAD_S:
            self._set_link_state(False)
        for seq in list(self.pending.keys()):
            label, t0 = self.pending[seq]
            if now - t0 > ACK_TIMEOUT_S:
                del self.pending[seq]
                self._log(f"ACK فرمان {label} دریافت نشد (timeout)", "warn")
        self.root.after(POLL_MS, self._poll)

    def _on_frame_ui(self, t, s_, p):
        self.last_frame_t = time.time()
        if t == TYPE_STATUS:
            d = parse_status(p)
            if d:
                self._apply_status(d)
        elif t == TYPE_ACK:
            a = parse_ack(p)
            if a and a['seq'] in self.pending:
                label, _ = self.pending.pop(a['seq'])
                if a['code'] == ACK_OK:
                    self._log(f"✓ ACK {label}: {ACK_NAMES.get(a['code'], '?')}", "ok")
                else:
                    self._log(f"✗ ACK {label}: {ACK_NAMES.get(a['code'], hex(a['code']))}",
                              "err")
        elif t == TYPE_EVENT:
            e = parse_event(p)
            if e:
                name = EV_NAMES.get(e['code'], f"EV_{e['code']}")
                if e['code'] == EV_CALIB_DONE:
                    desc = calib_arg_name(e['arg'])
                    self._log(f"◆ رخداد: {name} — {desc}", "ev")
                    self._update_cal6_progress(e['arg'])
                else:
                    self._log(f"◆ رخداد: {name} ({e['arg']})", "ev")
                if e['code'] in (EV_LANDED, EV_FAILSAFE, EV_LOW_BATT,
                                 EV_LINK_LOST):
                    self.root.bell()
        elif t == TYPE_HEARTBEAT:
            hb = parse_heartbeat(p)
            if hb:
                self._set_link_state(True)
        elif t == TYPE_DEBUG:
            dbg = parse_debug(p)
            if dbg:
                self._on_debug(dbg)

    def _on_debug(self, dbg):
        """اسلات چرخشی DEBUG [slot][4×float] — اسلات‌های 9/10/11 به تب سلامت"""
        slot, f = dbg['slot'], dbg['f']
        names = DEBUG_SLOT_LABELS.get(slot)
        line = ("[" + str(slot) + "] " +
                "  ".join(f"{n}={v:.3g}" for n, v in zip(names, f))
                if names else f"[{slot}] " + "  ".join(f"{v:.4g}" for v in f))
        self.txt_dbg.config(state="normal")
        self.txt_dbg.insert("end", line + "\n")
        if float(self.txt_dbg.index('end-1c').split('.')[0]) > 400:
            self.txt_dbg.delete("1.0", "2.0")     # نگه‌داشتن ~400 خط
        self.txt_dbg.see("end")
        self.txt_dbg.config(state="disabled")
        if slot == 9:      # HWM پشته: ctrl/flgt/telm/snsr (واژه 4B)
            self.stack_hwm.update(zip(("ctrl", "flgt", "telm", "snsr"), f))
            s = self.stack_hwm
            self.lbl_v3['stack'].config(
                text="پشته (واژه): ctrl=%d flgt=%d telm=%d snsr=%d" %
                     (s.get('ctrl', 0), s.get('flgt', 0),
                      s.get('telm', 0), s.get('snsr', 0)))
        elif slot == 10:   # HWM پشته: gps/moni/leds + مینیمم هیپ (بایت)
            self.stack_hwm.update(zip(("gps", "moni", "leds"), f))
            s = self.stack_hwm
            self.lbl_v3['stack'].config(
                text="پشته (واژه): ctrl=%d flgt=%d telm=%d snsr=%d | "
                     "gps=%d moni=%d leds=%d" %
                     (s.get('ctrl', 0), s.get('flgt', 0), s.get('telm', 0),
                      s.get('snsr', 0), s.get('gps', 0), s.get('moni', 0),
                      s.get('leds', 0)))
            self.lbl_v3['heap'].config(
                text="مینیمم هیپ آزاد: %d B (%.1f KB)" % (int(f[3]), f[3] / 1024.0))
        elif slot == 11:   # شمارنده‌های سلامت
            self.lbl_v3['s11'].config(
                text="I2C تایم‌اوت: %d  |  رد مگ: %d" % (int(f[0]), int(f[1])))
            self.lbl_v3['mah'].config(
                text="مصرف: %.0f mAh  |  جریان: %.2f A" % (f[2], f[3] / 100.0))

    # ================= به‌روزرسانی UI =================
    def _apply_status(self, d):
        self._set_link_state(True)
        self.horizon.update(d['roll'], -d['pitch'])   # قرارداد هوانوردی
        self.compass.set(d['yaw'])
        self.chart.push(d['alt_cm'] / 100.0, d['volt_c'] / 100.0, d['batt_pct'])
        mode = MODE_NAMES.get(d['mode'], str(d['mode']))
        armed = "آرم" if d['state'] == SYS_ARMED else "دیس‌آرم"
        sonar = f"{d['sonar_mm10'] / 10.0:.1f}cm" if d['sonar_mm10'] >= 0 else "—"
        flag_names = []
        if d['flags'] & F_ARMED:  flag_names.append("ARMED")
        if d['flags'] & F_RC_OK:  flag_names.append("RC")
        if d['flags'] & F_GCS_OK: flag_names.append("GCS")
        if d['flags'] & F_GPS_FIX: flag_names.append("GPS")
        if d['flags'] & F_FAILSAFE: flag_names.append("FAILSAFE")
        if d['flags'] & F_AUTO:   flag_names.append("AUTO")
        self.lbl_info.config(text=(
            f"حالت: {mode}   |   {armed}\n"
            f"ارتفاع: {d['alt_cm'] / 100.0:.2f} m   هدف: {d['alt_target_dm'] / 10.0:.1f} m\n"
            f"سونار: {sonar}   سرعت: {d['speed_cms']} cm/s\n"
            f"رول {d['roll']:.1f}°  پیچ {d['pitch']:.1f}°  یاو {d['yaw']:.1f}°\n"
            f"ولتاژ: {d['volt_c'] / 100.0:.2f} V   باتری: {d['batt_pct']}%\n"
            f"GPS: {d['sats']} ماهواره {'✓' if d['gps_fix'] else '✗'}\n"
            f"موقعیت: {d['lat_e7'] / 1e7:.6f}, {d['lon_e7'] / 1e7:.6f}\n"
            f"خانه: {d['home_lat_e7'] / 1e7:.6f}, {d['home_lon_e7'] / 1e7:.6f}\n"
            f"هاور: {d['hover']:.2f}   پرچم‌ها: {' '.join(flag_names) or '—'}"))
        # سلامت سنسورها (v2)
        h = d.get('health')
        if h is not None:
            probs = []
            if not h & HEALTH_IMU_OK: probs.append("IMU")
            if not h & HEALTH_BARO_OK: probs.append("BARO")
            if not h & HEALTH_SONAR_OK: probs.append("SONAR")
            if not h & HEALTH_GPS_FRESH: probs.append("GPS")
            if not h & HEALTH_ALT_VALID: probs.append("ALT")
            if h & HEALTH_RC_FAILSAFE: probs.append("RC-FS")
            if h & HEALTH_GCS_FAILSAFE: probs.append("GCS-FS")
            if h & HEALTH_MOTOR_FAULT: probs.append("MOTOR-FAULT")
            self.lbl_health.config(text="سلامت: " + ("، ".join(probs) if probs else "همه سالم"),
                                   fg=ERR if probs else OK)
        batt_color = OK if d['batt_pct'] > 40 else (WARN if d['batt_pct'] > 20 else ERR)
        self.status.config(text=(
            f"کیفیت لینک (زمین): {self._sender().quality_pct() if self._sender() else 0}%   "
            f"کیفیت (کواد): {d['fc_quality']}%   باتری: {d['batt_pct']}%   "
            f"{' | '.join(flag_names) or ''}"), fg=batt_color)
        s = self._sender()
        if s:
            rx = getattr(s, 'rx_frames', 0)
            crc = getattr(s, 'crc_errors', 0)
            self.lbl_stats.config(text=(
                f"RX frames : {rx}\nCRC errors : {crc}\n"
                f"TX frames : {getattr(s, 'tx_frames', 0)}\n"
                f"Status Hz : ~10"))
        # --- فیلدهای v1.2 (STATUS v3 = 54 بایت) در تب «سلامت و لاگ» ---
        if d.get('loop_max_us') is not None:
            self.lbl_v3['loop'].config(
                text=f"طولانی‌ترین حلقه: {d['loop_max_us']} µs",
                fg=ERR if d['loop_max_us'] > LOOP_US_RED else
                (OK if d['loop_max_us'] > 0 else FG))
            self.lbl_v3['ovr'].config(text=f"سرریز حلقه: {d['overruns']}",
                                      fg=ERR if d['overruns'] else FG)
            self.lbl_v3['vz'].config(
                text=f"سرعت صعود: {d['vz_cms']:+d} cm/s")
            rage = d['rc_age']
            self.lbl_v3['rc_age'].config(
                text=("عمر فریم RC: قطع (>2550 ms)" if rage == 255
                      else f"عمر فریم RC: {rage * 10} ms"),
                fg=ERR if rage == 255 else (WARN if rage > 30 else OK))
            denies = [n for bit, n in ARM_DENY_NAMES if d['arm_denied'] & bit]
            self.lbl_v3['deny'].config(
                text="دلیل رد آرم: " + ("، ".join(denies) if denies else "—"),
                fg=WARN if denies else FG)
            h2 = d['health2']
            h2_names = []
            if h2 & H2_GYRO_CAL_STALE: h2_names.append("بایاس ژیرو کهنه")
            if h2 & H2_MAG_FIELD_BAD:  h2_names.append("میدان مگ بد")
            h2_names.append("سنسور جریان: " +
                            ("دارد" if h2 & H2_CURRENT_SENSOR else "ندارد"))
            self.lbl_v3['h2'].config(text="حس‌گرها: " + "، ".join(h2_names))
            gates = [n for bit, n in HOME_GATE_NAMES if d['home_gate'] & bit]
            self.lbl_v3['gate'].config(
                text="گیت خانه: " + ("، ".join(gates) if gates else "سالم"),
                fg=WARN if gates else OK)
            self._update_motor_test_byte(d['motor_test'])

    def _update_motor_test_byte(self, mt):
        """تغذیه برچسب وضعیت تب تست موتور از بایت motor_test STATUS v3"""
        lbl = self.lbl_mt
        if mt & MOTOR_TEST_ACTIVE_MASK:
            lbl.config(text="⚠ تست موتور فعال — حداکثر ۲ ثانیه (خودقطع)",
                       fg=ERR)
        else:
            reason = MOTOR_TEST_ABORT_NAMES.get(mt & MOTOR_TEST_ABORT_MASK, "—")
            lbl.config(text=f"وضعیت: خاموش   |   آخرین توقف: {reason}", fg=FG)

    def _set_link_state(self, online):
        cur = getattr(self, '_online', None)
        if cur == online:
            return
        self._online = online
        if not online:
            self.status.config(text="لینک قطع است", fg=ERR)

    def _log(self, msg, tag="info"):
        self.txt_log.config(state="normal")
        self.txt_log.insert("end", time.strftime("[%H:%M:%S] ") + msg + "\n", tag)
        self.txt_log.see("end")
        self.txt_log.config(state="disabled")

    def on_close(self):
        try:
            self._disconnect()
        finally:
            self.root.destroy()


def main():
    root = tk.Tk()
    app = App(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
