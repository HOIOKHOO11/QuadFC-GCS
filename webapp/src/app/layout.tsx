import type { Metadata } from "next";
import "./globals.css";
import "vazirmatn/Vazirmatn-font-face.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "ایستگاه زمینی QuadFC",
  description:
    "Ground Station برای کوادکوپتر QuadFC (STM32F103C8T6) — نقشه، مدل سه‌بعدی، سنسورها، GPS، باتری هوشمند، عیب‌یابی I2C، کالیبراسیون و گیرنده RC",
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-zinc-950 text-zinc-100 font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
