'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '../ui-helpers';
import { useGS } from '@/lib/qfc/store';
import { engine } from '@/lib/qfc/engine';
import { COMMANDS } from '@/lib/qfc/protocol';
import { VS_COMMANDS } from '@/lib/qfc/valsuite';
import { timeStr } from '@/lib/qfc/format';
import { TerminalSquare, Trash2, Download as DL, BellRing } from 'lucide-react';

type CmdItem = { cmd: string; fa: string; desc: string; long?: boolean; interactive?: boolean };

export function ConsoleTab() {
  const cons = useGS(s => s.cons);
  const conn = useGS(s => s.conn);
  const prompt = useGS(s => s.vs.prompt);
  const vsMode = conn.mode === 'valsuite';
  const cmds: CmdItem[] = vsMode ? VS_COMMANDS : COMMANDS;
  const [input, setInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [cons, autoScroll]);

  const send = () => {
    const t = input.trim();
    if (!t) return;
    engine.send(t);
    setInput('');
  };

  const exportLog = () => {
    const txt = cons.map(l => `${timeStr(l.t)} [${l.dir}] ${l.text}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quadfc_console_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card title={vsMode ? 'فرمان‌های سوئیت v4.0' : 'فرمان‌های لاگر v7'} icon={<TerminalSquare className="w-4 h-4 text-emerald-400" />} className="lg:col-span-1">
        <div className="space-y-1.5">
          {cmds.map(c => (
            <button
              key={c.cmd}
              onClick={() => engine.send(c.cmd)}
              disabled={conn.status !== 'on'}
              title={c.desc}
              className={`w-full flex items-center gap-2 rounded-lg border bg-zinc-950/70 px-2.5 py-1.5 text-right disabled:opacity-40 transition-colors ${c.long ? 'border-amber-900 hover:border-amber-600' : 'border-zinc-800 hover:border-emerald-800 hover:bg-emerald-950/30'}`}
            >
              <span className="font-mono text-sm text-emerald-400 w-5 text-center">{c.cmd}</span>
              <span className="text-xs text-zinc-300">{c.fa}</span>
              <span className="text-[10px] text-zinc-500 mr-auto">{c.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500 mt-3 leading-5">
          فرمان به‌صورت خط + CR ارسال می‌شود (مثل تایپ در PuTTY). فریمور شناسایی‌شده منوی همین فریمور را نشان می‌دهد.
        </p>
      </Card>

      <Card title="ترمینال زنده" className="lg:col-span-3"
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-emerald-600" />
              اسکرول خودکار
            </label>
            <Button size="sm" variant="ghost" onClick={exportLog} className="h-7 px-2"><DL className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => useGS.getState().clearCon()} className="h-7 px-2"><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        }>
        <div ref={boxRef} dir="ltr" className="h-[440px] overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-[11px] leading-5">
          {cons.length === 0 && <div className="text-zinc-600">— خالی —</div>}
          {cons.map(l => (
            <div key={l.id} className="whitespace-pre-wrap break-all">
              <span className="text-zinc-600">{timeStr(l.t)} </span>
              {l.dir === 'tx' && <span className="text-cyan-400">› {l.text}</span>}
              {l.dir === 'rx' && <span className="text-zinc-300">{l.text}</span>}
              {l.dir === 'sys' && <span className="text-amber-400"># {l.text}</span>}
            </div>
          ))}
        </div>

        {prompt && conn.status === 'on' && (
          <div className="mt-3 rounded-lg border border-amber-700 bg-amber-950/40 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200 mb-1.5">
              <BellRing className="w-3.5 h-3.5" /> فریمور منتظر پاسخ است:
            </div>
            <div dir="ltr" className="font-mono text-[11px] text-amber-100/80 mb-2 whitespace-pre-wrap">{prompt.text}</div>
            <div className="flex flex-wrap gap-2">
              {prompt.kind === 'y' && (
                <>
                  <button onClick={() => engine.send('y')} className="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5">y — بله</button>
                  <button onClick={() => engine.send('')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">Enter — رد کردن</button>
                </>
              )}
              {prompt.kind === 'enter' && (
                <button onClick={() => engine.send('')} className="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5">Enter — ادامه</button>
              )}
              {prompt.kind === 'choice' && (
                <>
                  <button onClick={() => engine.send('1')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">1 = AT</button>
                  <button onClick={() => engine.send('2')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">2 = PING</button>
                  <button onClick={() => engine.send('3')} className="rounded-lg border border-zinc-600 text-zinc-200 text-xs px-3 py-1.5 hover:bg-zinc-800">3 = STREAM</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={vsMode ? 'فرمان سوئیت… (مثلاً S یا P)' : 'فرمان دلخواه… (مثلاً d)'}
            className="bg-zinc-950 border-zinc-800 font-mono text-xs"
            dir="ltr"
            disabled={conn.status !== 'on'}
          />
          <Button size="sm" onClick={send} disabled={conn.status !== 'on'}>ارسال</Button>
        </div>
      </Card>
    </div>
  );
}
