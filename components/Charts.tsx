import { money } from '@/lib/calc';

const W = 560, H = 230, L = 52, R = 12, T = 12, B = 28;
const iw = W - L - R, ih = H - T - B;
const short = (s: string) => (s.length > 9 ? s.slice(0, 8) + '…' : s);

function Grid({ max, fmt = (v: number) => String(Math.round(v)) }: { max: number; fmt?: (v: number) => string }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map(g => {
        const y = T + ih - (ih * g) / 4;
        return (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--border)" />
            <text x={L - 6} y={y + 4} textAnchor="end">{fmt((max * g) / 4)}</text>
          </g>
        );
      })}
    </>
  );
}

export function LineChart({ labels, series }: { labels: string[]; series: { name: string; color: string; values: number[] }[] }) {
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const x = (i: number) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => T + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img">
      <Grid max={max} />
      {labels.map((l, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{short(l)}</text>)}
      {series.map(s => (
        <g key={s.name}>
          <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} />
          {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color}><title>{`${labels[i]} – ${s.name}: ${money(v)}`}</title></circle>)}
        </g>
      ))}
    </svg>
  );
}

/** Each bar is a stack of parts, as a share of the bar's own total (0–100%). */
export function StackedShareChart({ labels, bars }: { labels: string[]; bars: { total: number; parts: { name: string; color: string; value: number }[] }[] }) {
  const n = labels.length, slot = iw / n, bw = Math.min(46, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img">
      <Grid max={100} fmt={v => Math.round(v) + '%'} />
      {bars.map((b, i) => {
        const cx = L + slot * i + slot / 2;
        let y = T + ih;
        return (
          <g key={i}>
            {b.parts.map(p => {
              const h = Math.max(0, (p.value / (b.total || 1)) * ih);
              y -= h;
              return <rect key={p.name} x={cx - bw / 2} y={y} width={bw} height={h} fill={p.color}><title>{`${labels[i]} – ${p.name}: ${money(p.value)}`}</title></rect>;
            })}
            <text x={cx} y={H - 8} textAnchor="middle">{short(labels[i])}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PairedBars({ labels, a, b }: { labels: string[]; a: { name: string; color: string; values: number[] }; b: { name: string; color: string; values: number[] } }) {
  const n = labels.length, slot = iw / n, bw = Math.min(22, slot * 0.38);
  const max = Math.max(1, ...a.values, ...b.values);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img">
      <Grid max={max} />
      {labels.map((l, i) => {
        const cx = L + slot * i + slot / 2;
        const ha = (a.values[i] / max) * ih, hb = (b.values[i] / max) * ih;
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={T + ih - ha} width={bw} height={ha} fill={a.color}><title>{`${l} – ${a.name}: ${money(a.values[i])}`}</title></rect>
            <rect x={cx + 1} y={T + ih - hb} width={bw} height={hb} fill={b.color}><title>{`${l} – ${b.name}: ${money(b.values[i])}`}</title></rect>
            <text x={cx} y={H - 8} textAnchor="middle">{short(l)}</text>
          </g>
        );
      })}
    </svg>
  );
}
