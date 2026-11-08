'use client';

// Artificial horizon (SVG) — roll/pitch indicator
export function Horizon({ roll, pitch, size = 190 }: { roll: number; pitch: number; size?: number }) {
  const R = size / 2 - 8;
  const pxPerDeg = R / 30; // 30 degrees visible
  const safePitch = Math.max(-45, Math.min(45, pitch || 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none" role="img" aria-label="افق مصنوعی">
      <defs>
        <clipPath id="hor-clip">
          <circle cx={size / 2} cy={size / 2} r={R} />
        </clipPath>
      </defs>
      <g clipPath="url(#hor-clip)">
        <g transform={`rotate(${-roll} ${size / 2} ${size / 2})`}>
          <g transform={`translate(0 ${(safePitch) * pxPerDeg})`}>
            <rect x={0} y={-size} width={size} height={size * 1.5} fill="#334155" />
            <rect x={0} y={size / 2} width={size} height={size * 1.5} fill="#78350f" />
            <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#e2e8f0" strokeWidth={1.6} />
            {[-30, -20, -10, 10, 20, 30].map(d => (
              <g key={d}>
                <line x1={size / 2 - (d % 20 === 0 ? 22 : 14)} y1={size / 2 - d * pxPerDeg} x2={size / 2 + (d % 20 === 0 ? 22 : 14)} y2={size / 2 - d * pxPerDeg} stroke="#cbd5e1" strokeWidth={1} opacity={0.8} />
                {d % 20 === 0 && <text x={size / 2 + 27} y={size / 2 - d * pxPerDeg + 3} fontSize={8} fill="#94a3b8">{Math.abs(d)}</text>}
              </g>
            ))}
          </g>
        </g>
      </g>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#3f3f46" strokeWidth={3} />
      {/* fixed aircraft symbol */}
      <g stroke="#facc15" strokeWidth={2.6} fill="none">
        <line x1={size / 2 - 34} y1={size / 2} x2={size / 2 - 10} y2={size / 2} />
        <line x1={size / 2 + 10} y1={size / 2} x2={size / 2 + 34} y2={size / 2} />
        <circle cx={size / 2} cy={size / 2} r={2.2} fill="#facc15" />
      </g>
      {/* roll pointer */}
      <g transform={`rotate(${-roll} ${size / 2} ${size / 2})`}>
        <polygon points={`${size / 2},${size / 2 - R + 3} ${size / 2 - 5},${size / 2 - R + 13} ${size / 2 + 5},${size / 2 - R + 13}`} fill="#f87171" />
      </g>
      <text x={8} y={14} fontSize={9} fill="#94a3b8">L</text>
      <text x={size - 16} y={14} fontSize={9} fill="#94a3b8">R</text>
    </svg>
  );
}
