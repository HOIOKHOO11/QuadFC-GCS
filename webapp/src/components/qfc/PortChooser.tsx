'use client';

// In-app COM port chooser for the Electron shell (v2.1.0).
// The main-process ChooserHub pushes the live port list here ('qfc:chooser')
// and the user picks a port BY NAME (COM…). Pure browsers never see this —
// they use Chrome's own chooser.

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGS } from '@/lib/qfc/store';
import { chooserRefresh, chooserLabel, qfcBridge } from '@/lib/qfc/serial';
import { Loader2, RefreshCw, Usb, X } from 'lucide-react';

const LAST_COM_KEY = 'qfc.lastCom';

export function PortChooser() {
  const ch = useGS(s => s.chooser);
  const apply = useGS(s => s.chooserApply);
  const dismiss = useGS(s => s.chooserDismiss);
  const [lastCom, setLastCom] = useState('');
  const [tick, setTick] = useState(0); // countdown ticker
  const openAtRef = useRef(0);

  useEffect(() => {
    const b = qfcBridge();
    if (!b) return;
    return b.onChooser(msg => apply(msg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reset per-open state when a new chooser request opens
  useEffect(() => {
    if (ch.open) {
      openAtRef.current = Date.now();
      try { setLastCom(localStorage.getItem(LAST_COM_KEY) ?? ''); } catch { setLastCom(''); }
    }
  }, [ch.open, ch.requestId]);

  useEffect(() => {
    if (!ch.open) return;
    const iv = window.setInterval(() => setTick(t => t + 1), 500);
    return () => window.clearInterval(iv);
  }, [ch.open]);

  if (!ch.open) return null;

  const bridge = qfcBridge();
  const elapsed = Date.now() - openAtRef.current;
  const remainSec = Math.max(0, Math.ceil((ch.remainingMs - elapsed) / 1000));
  const urgent = remainSec <= 5;

  const pick = (id: string) => bridge?.pick(ch.requestId, id);
  const cancel = () => bridge?.pick(ch.requestId, null);
  const refresh = () => { chooserRefresh(); bridge?.pick(ch.requestId, 'refresh'); };

  return (
    <Dialog open onOpenChange={o => { if (!o) cancel(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Usb className="w-4 h-4 text-emerald-400" />
            انتخاب پورت سریال
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-zinc-400 leading-6">
          پورت <span className="font-mono" dir="ltr">COM</span> آداپتور HC-12 را انتخاب کن.
          اگر آداپتور را همین حالا وصل کنی، به‌محض شناسایی به فهرست اضافه می‌شود.
        </p>

        {ch.waitingNew ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2.5 text-xs text-amber-200">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            هنوز پورتی نیست — آداپتور USB-TTL را وصل کن؛ تا ۳۰ ثانیه منتظر می‌مانیم.
          </div>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto pl-0.5">
            {ch.ports.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-right transition-colors hover:border-emerald-700 hover:bg-emerald-950/30 ${p.comName && p.comName === lastCom ? 'border-emerald-700 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/60'}`}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-semibold text-zinc-100" dir="ltr">
                    {p.comName || '?'}
                  </span>
                  <span className="block truncate text-[10px] text-zinc-500" dir="ltr">
                    {[p.displayName, p.vid && p.pid ? `VID:${p.vid} PID:${p.pid}` : '', p.serial ? `SN:${p.serial}` : ''].filter(Boolean).join(' · ') || '\u00a0'}
                  </span>
                </span>
                {p.comName && p.comName === lastCom && (
                  <span className="shrink-0 rounded bg-emerald-900/70 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">آخرین اتصال</span>
                )}
              </button>
            ))}
          </div>
        )}

        {ch.note && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[11px] text-zinc-300">
            {ch.note}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={refresh} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> بروزرسانی فهرست
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> لغو
          </Button>
          <div className="flex-1" />
          <span className={`font-mono text-[10px] ${urgent ? 'text-amber-400' : 'text-zinc-500'}`} dir="ltr" data-tick={tick}>
            auto-close {remainSec}s
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
