'use client';

import { useEffect, useState } from 'react';
import { ConnectionBar } from '@/components/qfc/ConnectionBar';
import { PortChooser } from '@/components/qfc/PortChooser';
import { OverviewTab } from '@/components/qfc/tabs/OverviewTab';
import { Attitude3DTab } from '@/components/qfc/tabs/Attitude3DTab';
import { MapTab } from '@/components/qfc/tabs/MapTab';
import { SensorsTab } from '@/components/qfc/tabs/SensorsTab';
import { GpsTab } from '@/components/qfc/tabs/GpsTab';
import { BatteryTab } from '@/components/qfc/tabs/BatteryTab';
import { DiagTab } from '@/components/qfc/tabs/DiagTab';
import { CalibTab } from '@/components/qfc/tabs/CalibTab';
import { RCTab } from '@/components/qfc/tabs/RCTab';
import { ConsoleTab } from '@/components/qfc/tabs/ConsoleTab';
import { EventsTab } from '@/components/qfc/tabs/EventsTab';
import { engine } from '@/lib/qfc/engine';
import {
  LayoutDashboard, Box, Map as MapIcon, Microchip, Satellite, BatteryCharging,
  Stethoscope, Crosshair, Radio, TerminalSquare, BellRing,
} from 'lucide-react';

const TABS = [
  { id: 'overview', fa: 'نمای کلی', icon: LayoutDashboard },
  { id: '3d', fa: 'سه‌بعدی', icon: Box },
  { id: 'map', fa: 'نقشه', icon: MapIcon },
  { id: 'sensors', fa: 'سنسورها', icon: Microchip },
  { id: 'gps', fa: 'GPS', icon: Satellite },
  { id: 'battery', fa: 'باتری', icon: BatteryCharging },
  { id: 'diag', fa: 'عیب‌یابی', icon: Stethoscope },
  { id: 'calib', fa: 'کالیبراسیون', icon: Crosshair },
  { id: 'rc', fa: 'گیرنده RC', icon: Radio },
  { id: 'console', fa: 'کنسول', icon: TerminalSquare },
  { id: 'events', fa: 'رویدادها', icon: BellRing },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Home() {
  const [tab, setTab] = useState<TabId>('overview');
  const evCount = useEvCount();

  useEffect(() => { engine.init(); }, []);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/95 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight">
              ایستگاه زمینی <span className="text-emerald-400">QuadFC</span>
              <span className="text-[11px] font-normal text-zinc-500 mr-2">تشخیص خودکار فریمور: لاگر v7 یا سوئیت اعتبارسنجی v4.0 · STM32F103C8T6 · بدون خروجی موتور</span>
            </h1>
          </div>
          <ConnectionBar />
          <PortChooser />
          {/* tabs */}
          <nav className="flex gap-1 overflow-x-auto pb-1 -mb-px" aria-label="تب‌ها">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2 text-xs transition-colors ${active ? 'bg-zinc-900 text-emerald-400 border border-b-0 border-zinc-800' : 'text-zinc-400 hover:text-zinc-200'}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.fa}
                  {t.id === 'events' && evCount > 0 && (
                    <span className="absolute -top-1 left-0 rounded-full bg-rose-600 text-[9px] font-bold text-white px-1.5">{evCount}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 py-4">
        {tab === 'overview' && <OverviewTab />}
        {tab === '3d' && <Attitude3DTab />}
        {tab === 'map' && <MapTab />}
        {tab === 'sensors' && <SensorsTab />}
        {tab === 'gps' && <GpsTab />}
        {tab === 'battery' && <BatteryTab />}
        {tab === 'diag' && <DiagTab />}
        {tab === 'calib' && <CalibTab />}
        {tab === 'rc' && <RCTab />}
        {tab === 'console' && <ConsoleTab />}
        {tab === 'events' && <EventsTab />}
      </main>

      <footer className="mt-auto border-t border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-3 py-3 text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
          <span>QuadFC Ground Station · فرمت‌ها: فریم D (۹۴ فیلد) · NMEA با پیشوند N · منوی متنی سوئیت v4.0</span>
          <span>اتصال سریال با Web Serial (Chrome/Edge) · تشخیص خودکار باودریت و فریمور · شبیه‌ساز یا بازپخش لاگ</span>
        </div>
      </footer>
    </div>
  );
}

// badge count for serious events on the tab bar
function useEvCount(): number {
  const events = useEvents();
  return events.filter(e => e.sev === 'crit' || e.sev === 'err' || e.sev === 'warn').length;
}

import { useGS } from '@/lib/qfc/store';
function useEvents() {
  return useGS(s => s.events);
}
