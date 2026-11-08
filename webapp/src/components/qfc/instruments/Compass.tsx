'use client';

import { headingDirFa } from '@/lib/qfc/format';

// Compass rose with tilt-compensated heading from magnetometer
export function Compass({ heading, size = 190, sub }: { heading: number | null; size?: number; sub?: string }) {
  const R = size / 2 - 10;
  const c = size / 2;
  const rad = ((heading ?? 0) - 90) * (Math.PI / 180);
  const needleLen = R - 16;
  const nx = c + needleLen * Math.cos(rad);
  const ny = c + needleLen * Math.sin(rad);
  const ticks = [];
  for (let a = 0; a < 360; a += 15) {
    const major = a % 45 === 0;
    const r1 = R - (major ? 12 : 6);
    const radA = (a - 90) * (Math.PI / 180);
    ticks.push(
      <line key={a}
        x1={c + r1 * Math.cos(radA)} y1={c + r1 * Math.sin(radA)}
        x2={c + R * Math.cos(radA)} y2={c + R * Math.sin(radA)}
        stroke={major ? '#a1a1aa' : '#52525b'} strokeWidth={major ? 1.6 : 1} />,
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} dir="ltr" className="select-none" role="img" aria-label="قطب‌نما">
        <circle cx={c} cy={c} r={R} fill="#18181b" stroke="#3f3f46" strokeWidth={2} />
        {ticks}
        <text x={c} y={c - R + 24} fontSize={13} fontWeight={700} fill="#f87171" textAnchor="middle">N</text>
        <text x={c + R - 22} y={c + 5} fontSize={11} fill="#a1a1aa" textAnchor="middle">E</text>
        <text x={c} y={c + R - 15} fontSize={11} fill="#a1a1aa" textAnchor="middle">S</text>
        <text x={c - R + 22} y={c + 5} fontSize={11} fill="#a1a1aa" textAnchor="middle">W</text>
        {heading !== null && (
          <g>
            <line x1={c} y1={c} x2={nx} y2={ny} stroke="#34d399" strokeWidth={3} strokeLinecap="round" />
            <polygon points={`${nx},${ny} ${nx - 7 * Math.cos(rad - 0.4)},${ny - 7 * Math.sin(rad - 0.4)} ${nx - 7 * Math.cos(rad + 0.4)},${ny - 7 * Math.sin(rad + 0.4)}`} fill="#34d399" />
            <circle cx={c} cy={c} r={3.5} fill="#34d399" />
          </g>
        )}
      </svg>
      <div className="text-center">
        <div className="font-mono text-lg text-emerald-400 leading-none">
          {heading !== null ? `${heading.toFixed(1)}°` : '—'}
        </div>
        <div className="text-xs text-zinc-400">{heading !== null ? headingDirFa(heading) : 'مگنتومتر بی‌داده'}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  );
}
