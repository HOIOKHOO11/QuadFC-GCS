# QuadFC GCS v2 — ایستگاه زمینی (نسخهٔ وب/شبیه‌ساز) 🛰️

[![Build Windows EXE](https://github.com/HOIOKHOO11/QuadFC-GCS/actions/workflows/build.yml/badge.svg)](https://github.com/HOIOKHOO11/QuadFC-GCS/actions/workflows/build.yml)
![Release](https://img.shields.io/github/v/release/HOIOKHOO11/QuadFC-GCS)

**همان برنامهٔ تست و شبیه‌ساز وبی** — با تشخیص خودکار فریمور، ۱۱ تب، نقشه، سه‌بعدی،
شبیه‌ساز داخلی و بازپخش لاگ PuTTY — که **کاملاً با فریمور روی برد شما
(`quadfc_logger_v7.hex` — «QuadFC HC-12 Hardware Logger v7.0») هماهنگ است**
و سوئیت اعتبارسنجی v4.0 را هم خودکار تشخیص می‌دهد.

> ⛔ **ایمنی**: هیچ‌کدام از مسیرهای این برنامه خروجی موتوری ندارند؛ PB6..PB9 همیشه دست‌نخورده است.

## 📦 دانلود EXE آماده (نسخهٔ دسکتاپ همین برنامهٔ وب)

از **Releases** آخرین نسخه را بگیرید → `QuadFC-GCS.exe` (پرتابل، بدون نصب):
👉 https://github.com/HOIOKHOO11/QuadFC-GCS/releases/latest

- نسخهٔ ۲ به بعد: **همین برنامهٔ وبی** داخل یک پوستهٔ Electron با **Web Serial** بسته‌بندی شده
- اگر SmartScreen هشدار داد: «More info → Run anyway»
- در EXE، اگر چند پورت سریال وصل باشد **اولین پورت** انتخاب می‌شود؛ بهتر است فقط دانگل برد وصل باشد

## 🌐 اجرا به‌صورت وب (بدون نصب)

```bash
cd webapp
bun install     # یا npm install
bun run dev     # یا npm run dev
```

سپس `http://localhost:3000` را با **Chrome یا Edge دسکتاپ** باز کنید (Web Serial فقط در این‌هاست).

## ✨ قابلیت‌ها

- **تشخیص خودکار فریمور و بادریت**: لاگر v7 (CSV) یا سوئیت v4.0 (منویی)؛ پیش‌فرض 9600 8N1
- **پارس دقیق لاگر v7** (ترتیب فیلدها از خود باینری فریمور استخراج شده):
  - فریم `D` — ۹۴ فیلد، هر ۵۰۰ms
  - `N,$GPRMC / $GPGGA` — با بررسی چک‌سام
  - `#Q` — خلاصهٔ هر ۱۰ ثانیه: شمارنده‌های I2C / GPS / RC / HC-12
  - فریم آسیب‌دیده **رد می‌شود**، هرگز جابجا پارس نمی‌شود
- **۱۱ تب**: نمای کلی، سه‌بعدی، نقشه، سنسورها، GPS، باتری، عیب‌یابی، کالیبراسیون، گیرنده RC، کنسول، رویدادها
- **باتری هوشمند**: تشخیص خودکار 1S..6S از `pa4_source_mV` + درصد تخمینی + هشدار ۲۵٪/۱۰٪
- **شبیه‌ساز**: بدون هیچ سخت‌افزاری همهٔ تب‌ها زنده می‌شوند (فرمت دقیق v7)
- **بازپخش لاگ**: متن خام PuTTY را بچسبانید — حتی با فاصله‌ها و خطوط شکستهٔ کپی، خودکار ترمیم می‌شود
- **رویدادهای فارسی هوشمند**: بنر HSI FALLBACK، باس گیرکرده، ACK دروغین، CRC بارومتر، #LOG_DONE و…
- در حالت لاگر v7 **هیچ بایتی به برد نوشته نمی‌شود** (فقط دریافت)

## 🖥️ ساخت EXE دسکتاپ به‌صورت دستی

```bash
cd webapp
npm install
set NEXT_OUTPUT=export      # ویندوز (PowerShell: $env:NEXT_OUTPUT='export')
npx next build
npx electron-builder --win portable --config electron-builder.yml
# خروجی: webapp/dist-desktop/QuadFC-GCS.exe
```

بیلد خودکار: هر push به `main` → Artifact؛ هر تگ `v*` → انتشار خودکار در Releases.

## 📁 ساختار ریپو

```
├── webapp/                  # ⭐ همین برنامه (سورس دقیق پرِیو + پوستهٔ Electron)
│   ├── src/lib/qfc/         #   پارسر v7 (D/N/#Q)، لایه سریال، موتور، شبیه‌ساز
│   ├── src/components/qfc/  #   رابط کاربری (تب‌ها، ابزارها)
│   └── electron/            #   پوستهٔ دسکتاپ + Web Serial
├── desktop-legacy/          # نسخهٔ قدیمی tkinter (پروتکل باینری v1.2 پرواز) — نگهداری نمی‌شود
└── .github/workflows/       # بیلد EXE ویندوز
```

## 🔌 سیم‌بندی

HC-12 / USB-TTL → USART1 برد (PA9=TX، PA10=RX) — **9600 8N1**.
قبل از اتصال، PuTTY را ببندید (پورت را قفل می‌کند).

## 🔐 امنیت

- توکن گیت‌هاب را هرگز در چت/کد/commit قرار ندهید؛ اگر افشا شد فوراً **Revoke** کنید.

## 📄 لایسنس

MIT — متن کامل در [LICENSE](LICENSE).
