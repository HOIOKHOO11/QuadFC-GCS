# QuadFC Telemetry Protocol — v1.2

پروتکل باینری دوطرفه بین فریم‌ور (STM32F103) و GCS. پیاده‌سازی مرجع:
`firmware/telemetry.c` (فریم‌ور) و `protocol.py` (GCS).

> **پیوست:** برای فرمت CSV فریم‌ور «HC-12 Hardware Logger v7» (خطوط `D,` / `N,` / `#Q,`)
> بخش انتهای همین سند را ببینید — آداپتور یک‌طرفه سمت GCS است و روی پروتکل باینری اثری ندارد.

## قالب فریم

```
[A5][5A][LEN][TYPE][SEQ][PAYLOAD ...][CRC_L][CRC_H]
```

| فیلد | توضیح |
|---|---|
| `A5 5A` | امضای شروع (sync bytes) |
| `LEN` | طول PAYLOAD (0..64) — `MAX_PAYLOAD=64` |
| `TYPE` | نوع فریم (جدول زیر) |
| `SEQ` | شماره سری (mod 256) |
| `PAYLOAD` | محتوا — little-endian برای همه اعداد چندبایتی |
| `CRC` | CRC-16/CCITT-FALSE (poly `0x1021`، seed `0xFFFF`) روی `[LEN][TYPE][SEQ][PAYLOAD]`، ارسال little-endian |

## نوع فریم‌ها

| TYPE | نام | جهت | PAYLOAD |
|---|---|---|---|
| `0x01` | HEARTBEAT | GCS→FC و FC→GCS | FC: ‏`[flags][mode][quality][tick_lo]` — GCS: ‏`[0][0][quality][tick_lo]` |
| `0x02` | STATUS | FC→GCS | 41 / 43 / 54 بایت (نسخه‌ها با طول تشخیص داده می‌شوند) |
| `0x03` | ACK | FC→GCS | `[seq_of_cmd][code]` — کد: 0=OK، 1=BUSY، 2=STATE، 3=CALIB، 4=PARAM |
| `0x04` | EVENT | FC→GCS | `[code][arg]` |
| `0x10` | CMD | GCS→FC | `[cmd][args...]` |
| `0x11` | DEBUG | FC→GCS | `[slot][4×float LE]` — 12 اسلات چرخشی |

## فرمان‌ها (TYPE=0x10)

| CMD | نام | args |
|---|---|---|
| `0x01` | ARM | — |
| `0x02` | DISARM | — |
| `0x03` | TAKEOFF | — |
| `0x04` | LAND | — |
| `0x05` | RTH | — |
| `0x06` | CAL_ACC | — |
| `0x07` | CAL_MAG | — |
| `0x08` | SAVE_CFG | — |
| `0x09` | MOTOR_TEST | `[idx][us_lo][us_hi]` — سقف 1150µs، فقط دیس‌آرم، توقف خودکار 2s؛ ‏`idx=0xFF` = توقف فوری |
| `0x0A` | SET_HOVER | `float LE` (محدوده مجاز 0.35..0.75) |
| `0x0B` | CANCEL | — |
| `0x0C` | REBOOT | — |
| `0x0D` | CAL_ACC6 | `[face]` — صورت 0..5 (هر بار یک صورت) |
| `0x0E` | SET_MAG_MAT | ‏9×float LE سطر-اصلی (36 بایت) |

## رخدادها (EVENT)

| کد | نام | arg |
|---|---|---|
| 1 | HOME_SET | — |
| 2 | HOVER_LEARN | گاز یادگرفته‌شده |
| 3 | CALIB_DONE | 0=ناموفق، 1=ذخیره شد، 2=مگ انجام شد، 3=شش‌جهته اعمال شد، 4=ماتریس مگ اعمال شد، 10..15=ثبت صورت 0..5 |
| 4 | FAILSAFE | — |
| 5 | LANDED | — |
| 6 | LOW_BATT | — |
| 7 | LINK_LOST | — |

## پاکت STATUS

- **نسخه 1 (41 بایت)**: tick، flags، mode، sys_state، roll، pitch، yaw، alt (int16 cm)،
  vz، ثبات، ولتاژ، گاز، کیفیت لینک، تعداد ماهواره، lat، lon، hover_thr، quality، alt_target و...
- **نسخه 2 (+2 بایت)**: `health`، `maneuver_state`
- **نسخه 3 / v1.2 (54 بایت، offsetهای الحاقی)**: ‏`loop_max_us` (u32@45)، `overruns` (u16@49)،
  `vz` (s16@33)، `rc_age_ms` (u16@35)، `arm_denied` (@50)، `health2` (@51)،
  `home_gate` (@52)، `motor_test` (@53)

بیت‌های flags: ‏`ARMED=0x01, RC_OK=0x02, GCS_OK=0x04, GPS_FIX=0x08, FAILSAFE=0x10, AUTO=0x20`

رمزگشایی دقیق فیلد به فیلد: تابع `parse_status()` در `protocol.py`
(کامنت‌های همان تابع، مرجع اصلی است و با `send_status()` فریم‌ور بایت‌به‌بایت هم‌تراز نگه داشته می‌شود — تست ۲۹/۲۹).

---

## پیوست — آداپتور Logger v7 (فرمت CSV، فقط سمت GCS)

فریم‌ور «QuadFC HC-12 Hardware Logger v7.0» (باینری جدا، VALIDATION ONLY / NO MOTOR OUTPUT)
خروجی متنی با بادریت 9600 8N1 می‌دهد و پروتکل باینری بالا را نمی‌فهمد:

| خط | ساختار |
|---|---|
| `#CSV,D,...` | هدر ۹۴ فیلدی (در ابتدای هر لاگ) |
| `D,...` | داده: ‏seq، ms، ‏MPU (خام + مین/ماکس پنجره)، ‏HMC، ‏MS5611، ‏GPS (fix/sats/hdop/lat_e7/lon_e7/alt/speed/course)، ‏RC (ch1..ch14)، ‏ADC باتری (pa4: تقسیم 100k/33k نسبت 4.03)، شمارنده‌های I2C/GPS/UART |
| `N,$GPRMC...` | عبور خام NMEA |
| `#Q,ms,...` | ۲۲ شمارنده سلامت/آمار |
| `#LOG_START/STOP/DONE` | چرخه لاگ ۵ دقیقه‌ای |
| `0xFFFFFFFF` | فیلد ناموجود (مثل RC/GPS وقتی وصل نیستند) |

فرمان‌های حرفی v7 (فقط از ترمینال متنی، نه GCS): ‏`? d s g r v p i L x c t`

### قواعد تشخیص خودکار در GCS

1. حالت شروع: `auto` — هیچ بایتی ارسال نمی‌شود.
2. اولین بایت‌های `A5 5A` → قفل دائمی **binary** (پروتکل v1.2 + ضربان ۲Hz).
3. اولین خط متنی معتبر (`D,` / `#` / `N,` / `$` / بنر) → قفل دائمی **csv** (بدون ضربان، بدون فرمان).
4. خط `D,` از مسیر `V7Converter` به همان dict استاندارد `parse_status()` تبدیل می‌شود:
   رول/پیچ تخمینی (شتاب‌سنج، α=0.25)، ارتفاع نسبی فشارسنج (مرجع اولین نمونه)،
   ولتاژ + تشخیص خودکار 1S..6S + درصد تخمینی، بایت health ساخته‌شده از `mpu_ok/baro_ok/gps_fix`.
