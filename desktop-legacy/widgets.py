# -*- coding: utf-8 -*-
"""ویجت‌های فلزی tkinter: افق مصنوعی، قطب‌نما، نمودار نوار_strip

⚠️ همه این ویجت‌ها فقط از نخ اصلی tkinter صدا زده می‌شوند
   (App._poll این تضمین را برقرار می‌کند).
"""
import math
import tkinter as tk

SKY   = "#1b4f8a"
GROUND = "#6b4a2b"
LINE  = "#e8e8e8"
ACCENT = "#ffb300"


class ArtificialHorizon(tk.Canvas):
    """افق مصنوعی با نردبان pitch — قرارداد هوانوردی:
    update(roll, pitch_up) ؛ pitch مثبت = دماغه بالا"""

    def __init__(self, master, **kw):
        super().__init__(master, bg="#0b0f14", highlightthickness=0, **kw)
        self.roll = 0.0
        self.pitch = 0.0
        self.k = 3.2                      # پیکسل بر درجه pitch
        self.bind("<Configure>", lambda e: self.redraw())

    def update(self, roll, pitch_up):
        self.roll = float(roll)
        self.pitch = float(pitch_up)
        self.redraw()

    def redraw(self):
        w = int(self.winfo_width())
        h = int(self.winfo_height())
        if w < 10 or h < 10:
            return
        self.delete("all")
        cx, cy = w / 2.0, h / 2.0
        a = math.radians(self.roll)
        R = math.hypot(w, h)              # شعاع بزرگ برای پوشش کامل چرخش
        off = self.pitch * self.k

        ca, sa = math.cos(a), math.sin(a)

        def pt(u, v):
            """چرخش (u,v) حول مرکز + انتقال عمودی"""
            x = cx + u * ca - v * sa
            y = cy + u * sa + v * ca - off
            return x, y

        # آسمان و زمین: صفحه چرخیده با افست pitch
        self.create_polygon([pt(-R, -R), pt(R, -R), pt(R, 0), pt(-R, 0)],
                            fill=SKY, outline=SKY)
        self.create_polygon([pt(-R, 0), pt(R, 0), pt(R, R), pt(-R, R)],
                            fill=GROUND, outline=GROUND)
        # خط افق
        self.create_line(*pt(-R, 0), *pt(R, 0), fill=LINE, width=2)
        # نردبان pitch هر 10 درجه
        for deg in (-30, -20, -10, 10, 20, 30):
            yv = -deg * self.k
            half = 40 if deg % 20 == 0 else 24
            self.create_line(*pt(-half, yv), *pt(half, yv),
                             fill=LINE, width=1)
            if deg % 20 == 0:
                self.create_text(*pt(half + 16, yv), text=str(abs(deg)),
                                 fill=LINE, font=("TkDefaultFont", 8))
        # بدنه هواپیما (ثابت)
        self.create_line(cx - 46, cy, cx - 14, cy, fill=ACCENT, width=3)
        self.create_line(cx + 14, cy, cx + 46, cy, fill=ACCENT, width=3)
        self.create_line(cx - 14, cy, cx - 4, cy + 8, fill=ACCENT, width=3)
        self.create_line(cx + 14, cy, cx + 4, cy + 8, fill=ACCENT, width=3)
        self.create_oval(cx - 3, cy - 3, cx + 3, cy + 3, fill=ACCENT, outline="")
        # مقیاس رول بالا
        for deg in (-60, -45, -30, -15, 0, 15, 30, 45, 60):
            x = cx + deg * (w / 180.0)
            yy = 6 if deg else 2
            self.create_line(x, yy, x, yy + 8, fill=LINE, width=1)


class CompassWidget(tk.Canvas):
    """قطب‌نما: روز حلقوی + عقربه سمت + عدد دقیق"""

    def __init__(self, master, size=170, **kw):
        super().__init__(master, width=size, height=size,
                         bg="#0b0f14", highlightthickness=0, **kw)
        self.yaw = 0.0
        self.size = size
        self.bind("<Configure>", lambda e: self.redraw())

    def set(self, yaw_deg):
        self.yaw = float(yaw_deg)
        self.redraw()

    def redraw(self):
        s = int(self.winfo_width())
        if s < 20:
            return
        self.delete("all")
        c = s / 2.0
        r = s / 2.0 - 8
        self.create_oval(c - r, c - r, c + r, c + r,
                         outline="#3a4a5a", width=2)
        # تیک‌های درجه — چرخش قرص، عقربه ثابت رو به بالا
        for deg in range(0, 360, 15):
            a = math.radians(deg - self.yaw - 90)
            rr1 = r - (10 if deg % 45 == 0 else 5)
            x1 = c + rr1 * math.cos(a)
            y1 = c + rr1 * math.sin(a)
            x2 = c + r * math.cos(a)
            y2 = c + r * math.sin(a)
            self.create_line(x1, y1, x2, y2,
                             fill=LINE if deg % 45 == 0 else "#5a6a7a", width=1)
            if deg % 90 == 0:
                lbl = {0: "N", 90: "E", 180: "S", 270: "W"}[deg]
                xt = c + (r - 22) * math.cos(a)
                yt = c + (r - 22) * math.sin(a)
                self.create_text(xt, yt, text=lbl, fill=ACCENT,
                                 font=("TkDefaultFont", 10, "bold"))
        # عقربه سمت (هوانوردی: بالا = سمت فعلی)
        self.create_polygon(c, c - r + 26, c - 7, c + 8, c + 7, c + 8,
                            fill=ACCENT, outline="")
        self.create_oval(c - 4, c - 4, c + 4, c + 4, fill="#3a4a5a")
        hdg = int(round(self.yaw % 360.0))
        self.create_text(c, c + r - 24, text=f"{hdg:03d}°",
                         fill=LINE, font=("TkDefaultFont", 11, "bold"))


class StripChart(tk.Canvas):
    """نمودار نوار ارتفاع (متر) + ولتاژ (V) + درصد باتری"""

    def __init__(self, master, n=180, **kw):
        super().__init__(master, bg="#0b0f14", highlightthickness=0, **kw)
        self.n = n
        self.alt = []
        self.volt = []
        self.batt = []
        self.bind("<Configure>", lambda e: self.redraw())

    def push(self, alt_m, volt_v, batt_pct):
        self.alt.append(alt_m)
        self.volt.append(volt_v)
        self.batt.append(batt_pct)
        for arr in (self.alt, self.volt, self.batt):
            if len(arr) > self.n:
                del arr[0]
        self.redraw()

    def redraw(self):
        w = int(self.winfo_width())
        h = int(self.winfo_height())
        if w < 20 or h < 20 or not self.alt:
            return
        self.delete("all")

        def poly(arr, vmin, vmax, color, ymin=None):
            if vmax <= vmin:
                vmax = vmin + 1.0
            pts = []
            for i, v in enumerate(arr):
                x = i * w / float(self.n - 1)
                y = h - 6 - (v - vmin) * (h - 14) / (vmax - vmin)
                pts += [x, y]
            if len(pts) >= 4:
                self.create_line(*pts, fill=color, width=2)

        # بازه ارتفاع دینامیک
        amin, amax = min(self.alt), max(self.alt)
        pad = max(0.5, (amax - amin) * 0.15)
        poly(self.alt, amin - pad, amax + pad, "#4fc3f7")
        vmin, vmax = min(self.volt), max(self.volt)
        poly(self.volt, vmin - 0.05, vmax + 0.05, "#81c784")
        # باتری: محور ثابت 0..100
        poly(self.batt, 0, 100, "#ffb300")
        # راهنما
        self.create_text(8, 6,
                         text=f"ALT {self.alt[-1]:.2f}m  |  "
                              f"V {self.volt[-1]:.2f}  |  "
                              f"BATT {self.batt[-1]:.0f}%",
                         fill=LINE, anchor="nw",
                         font=("TkDefaultFont", 9, "bold"))
