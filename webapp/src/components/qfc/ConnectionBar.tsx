'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGS } from '@/lib/qfc/store';
import { engine } from '@/lib/qfc/engine';
import { serialSupported } from '@/lib/qfc/serial';
import { Wifi, WifiOff, Play, Square, FileInput, Settings2, Sparkles, MousePointerClick, Loader2, ChevronDown, FlaskConical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { msUp } from '@/lib/qfc/format';

const MODE_FA: Record<string, string> = {
  off: 'قطع', detect: 'شناسایی فریمور…', logger: 'لاگر v7', valsuite: 'سوئیت اعتبارسنجی v4.0', nmea: 'NMEA مستقیم', sim: 'شبیه‌ساز', replay: 'بازپخش لاگ',
};

export function ConnectionBar() {
  const conn = useGS(s => s.conn);
  const vsfw = useGS(s => s.vs.fw);
  const settings = useGS(s => s.settings);
  const setSettings = useGS(s => s.setSettings);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayText, setReplayText] = useState('');
  const [speed, setSpeed] = useState('16');
  const supported = serialSupported();

  const on = conn.status === 'on';
  const busy = conn.status === 'connecting';
  const simActive = conn.mode === 'sim' || conn.mode === 'valsuite';

  const onReplayFile = async (f: File | undefined) => {
    if (!f) return;
    const txt = await f.text();
    setReplayText(txt.slice(0, 3_000_000));
  };

  return (
    <div className="w-full flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
      {/* status */}
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${on ? 'text-emerald-400' : busy ? 'text-amber-400' : 'text-zinc-400'}`}>
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${on ? 'bg-emerald-500 animate-pulse' : busy ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
        {on ? MODE_FA[conn.mode] : busy ? 'در حال اتصال…' : 'قطع'}
      </span>
      {on && (
        <span className="font-mono text-[11px] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">
          {conn.portLabel}{conn.baud ? ` · ${conn.baud.toLocaleString('en-US')}b` : ''} · {conn.fps} line/s
          {conn.mode === 'logger' && conn.lastRxAt ? ` · آپ‌تایم ${msUp(useGS.getState().tel.fwMs)}` : ''}
          {conn.mode === 'valsuite' && vsfw ? ` · ${vsfw}` : ''}
        </span>
      )}

      <div className="flex-1" />

      {!supported && (
        <span className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-900 rounded px-2 py-1">
          Web Serial ندارد — Chrome/Edge دسکتاپ لازم است؛ فعلاً شبیه‌ساز/بازپخش کار می‌کند
        </span>
      )}

      {!on ? (
        <>
          <Button size="sm" onClick={() => void engine.connectAuto()} disabled={!supported || busy} className="gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            اتصال خودکار
          </Button>
          <Button size="sm" variant="outline" onClick={() => void engine.connectManual()} disabled={!supported || busy} className="gap-1.5">
            <MousePointerClick className="w-4 h-4" /> انتخاب پورت…
          </Button>
        </>
      ) : (
        <Button size="sm" variant="destructive" onClick={() => void engine.disconnect()} className="gap-1.5">
          <WifiOff className="w-4 h-4" /> قطع
        </Button>
      )}

      <div className="flex items-center">
        <Button size="sm" variant={simActive ? 'secondary' : 'outline'} onClick={() => (simActive ? engine.stopSim() : engine.startSim('v7'))} className="gap-1.5 rounded-l-lg rounded-r-none">
          {simActive ? <><Square className="w-3.5 h-3.5" /> خاموشی شبیه‌ساز</> : <><Play className="w-3.5 h-3.5" /> شبیه‌ساز</>}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="px-1.5 rounded-l-none border-r-0" aria-label="انتخاب نوع شبیه‌ساز"><ChevronDown className="w-3.5 h-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-zinc-950 border-zinc-800" dir="rtl">
            <DropdownMenuItem onSelect={() => engine.startSim('v7')} className="gap-2"><Play className="w-3.5 h-3.5 text-emerald-400" /> شبیه‌ساز لاگر v7 (فریم D)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => engine.startSim('vs')} className="gap-2"><FlaskConical className="w-3.5 h-3.5 text-cyan-400" /> شبیه‌ساز سوئیت اعتبارسنجی v4.0 (منو)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5"><FileInput className="w-3.5 h-3.5" /> بازپخش لاگ</Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>بازپخش لاگ PuTTY (فرمت v7)</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-zinc-400 leading-6">
            فایل لاگ یا متن کپی‌شده را بده — همان لاگی که از PuTTY ذخیره یا Paste کردی.
            فاصله‌های اضافه و شکستگی خطوط خودکار ترمیم می‌شود و فریم‌ها با زمان‌بندی واقعی پخش می‌شوند.
          </p>
          <Input type="file" accept=".txt,.log,.csv,text/plain" onChange={e => void onReplayFile(e.target.files?.[0])} className="bg-zinc-900" />
          <Textarea
            value={replayText}
            onChange={e => setReplayText(e.target.value)}
            placeholder="…یا متن لاگ را همین‌جا Paste کن"
            className="bg-zinc-900 font-mono text-[11px] min-h-32"
            dir="ltr"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">سرعت:</span>
            <Select value={speed} onValueChange={setSpeed}>
              <SelectTrigger className="w-36 bg-zinc-900"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="1">زمان واقعی ۱×</SelectItem>
                <SelectItem value="4">۴× سریع‌تر</SelectItem>
                <SelectItem value="16">۱۶× سریع‌تر</SelectItem>
                <SelectItem value="1000">فوری</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => { engine.startReplay(replayText, Number(speed)); setReplayOpen(false); }}
              disabled={!replayText.trim()}
              className="gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> پخش
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="gap-1.5"><Settings2 className="w-4 h-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 bg-zinc-950 border-zinc-800" dir="rtl">
          <div className="space-y-3">
            <div className="text-sm font-semibold">تنظیمات</div>
            <div className="space-y-1">
              <Label className="text-xs">بادریت ترجیحی (اول همین امتحان می‌شود)</Label>
              <Select value={String(settings.baudPref)} onValueChange={v => setSettings({ baudPref: Number(v) })}>
                <SelectTrigger className="bg-zinc-900"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {[9600, 19200, 38400, 57600, 115200].map(b => (
                    <SelectItem key={b} value={String(b)}>{b.toLocaleString('en-US')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">فشار سطح دریا (Pa) برای ارتفاع بارومتر</Label>
              <Input
                type="number" value={settings.p0Pa}
                onChange={e => setSettings({ p0Pa: Number(e.target.value) || 101325 })}
                className="bg-zinc-900 font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">انحراف مغناطیسی تهران (درجه)</Label>
              <Input
                type="number" step="0.1" value={settings.declDeg}
                onChange={e => setSettings({ declDeg: Number(e.target.value) || 0 })}
                className="bg-zinc-900 font-mono"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
