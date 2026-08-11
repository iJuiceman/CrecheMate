"use client";

// Small inline-SVG charts for the reports dashboard. Design per the data-viz
// method: single teal hue for magnitude/time; a validated categorical set only
// where distinct identities coexist; all text in ink tokens (never the mark
// colour); recessive axes; rounded data-ends; per-mark hover via <title>.
const TEAL = "#0d9488";
const INK = "#1f2933";
const MUTED = "#6b7280";
const LINE = "#e7e0d6";
// Validated categorical slots (blue / orange / aqua / yellow) — pass adjacent
// CVD + normal-vision gates; aqua & yellow are direct-labelled (relief rule).
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ── Vertical bars over time (single series), optional capacity reference ────
export function TrendBars({
  data,
  height = 150,
  color = TEAL,
  format = (n: number) => String(n),
  refLine,
  refLabel,
}: {
  data: { label: string; value: number; hover?: string }[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
  refLine?: number;
  refLabel?: string;
}) {
  const padL = 44, padB = 18, padT = 8;
  const w = Math.max(data.length * 16, 300);
  const h = height;
  const max = niceMax(Math.max(refLine ?? 0, ...data.map((d) => d.value), 1));
  const plotH = h - padB - padT;
  const bw = data.length ? (w - padL) / data.length : 0;
  const y = (v: number) => padT + plotH * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={w} y2={y(t)} stroke={LINE} strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>{format(t)}</text>
        </g>
      ))}
      {refLine !== undefined && (
        <g>
          <line x1={padL} y1={y(refLine)} x2={w} y2={y(refLine)} stroke={INK} strokeWidth={1} strokeDasharray="3 3" />
          {refLabel && <text x={w - 2} y={y(refLine) - 3} textAnchor="end" fontSize={9} fill={MUTED}>{refLabel}</text>}
        </g>
      )}
      {data.map((d, i) => {
        const bh = plotH * (d.value / max);
        const x = padL + i * bw + bw * 0.15;
        const bwi = bw * 0.7;
        return (
          <g key={i}>
            <rect x={x} y={y(d.value)} width={Math.max(bwi, 1)} height={Math.max(bh, d.value > 0 ? 2 : 0)} rx={2} fill={color}>
              <title>{d.hover ?? `${d.label}: ${format(d.value)}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={padL + i * bw + bw / 2} y={h - 5} textAnchor="middle" fontSize={9} fill={MUTED}>{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Stacked vertical bars over time (2 series) with legend ──────────────────
export function StackedDayBars({
  data,
  series,
  height = 150,
}: {
  data: { label: string; values: number[]; hover?: string }[];
  series: { label: string; color: string }[];
  height?: number;
}) {
  const padL = 30, padB = 18, padT = 8;
  const w = Math.max(data.length * 16, 300);
  const h = height;
  const max = niceMax(Math.max(...data.map((d) => d.values.reduce((a, b) => a + b, 0)), 1));
  const plotH = h - padB - padT;
  const bw = data.length ? (w - padL) / data.length : 0;
  const y = (v: number) => padT + plotH * (1 - v / max);
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img">
        {[0, max / 2, max].map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={w} y2={y(t)} stroke={LINE} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          const x = padL + i * bw + bw * 0.15;
          const bwi = bw * 0.7;
          return (
            <g key={i}>
              {d.values.map((v, si) => {
                const yTop = y(acc + v);
                const seg = plotH * (v / max);
                acc += v;
                return (
                  <rect key={si} x={x} y={yTop} width={Math.max(bwi, 1)} height={Math.max(seg - (v > 0 ? 2 : 0), 0)} rx={1.5} fill={series[si].color}>
                    <title>{`${d.label} · ${series[si].label}: ${v}`}</title>
                  </rect>
                );
              })}
              {i % labelEvery === 0 && (
                <text x={padL + i * bw + bw / 2} y={h - 5} textAnchor="middle" fontSize={9} fill={MUTED}>{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </div>
  );
}

// ── Horizontal bars (category → magnitude), always direct-labelled ──────────
export function HBars({
  data,
  format = (n: number) => String(n),
  colors,
}: {
  data: { label: string; value: number }[];
  format?: (n: number) => string;
  colors?: string[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const rowH = 26, labelW = 96, valueW = 64;
  const w = 360;
  const barArea = w - labelW - valueW;
  return (
    <svg viewBox={`0 0 ${w} ${data.length * rowH + 4}`} width="100%" preserveAspectRatio="xMidYMin meet" role="img">
      {data.map((d, i) => {
        const bw = barArea * (d.value / max);
        const cy = i * rowH + rowH / 2;
        return (
          <g key={i}>
            <text x={labelW - 8} y={cy + 3} textAnchor="end" fontSize={11} fill={INK}>{d.label}</text>
            <rect x={labelW} y={cy - 7} width={Math.max(bw, d.value > 0 ? 3 : 0)} height={14} rx={3} fill={(colors && colors[i]) || TEAL}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            <text x={labelW + Math.max(bw, 0) + 6} y={cy + 3} fontSize={11} fill={MUTED} fontVariant="tabular-nums">{format(d.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-3">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
