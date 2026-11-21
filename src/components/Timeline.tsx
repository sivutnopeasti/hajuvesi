import { useMemo } from 'react'
import { FAMILIES } from '../data/families.ts'
import { timeLabel } from '../lib/format.ts'
import { useWidth } from '../lib/useWidth.ts'
import { familyShares } from '../sim/explain.ts'
import type { FamilyId, SimResult } from '../sim/types.ts'

const PAD = { l: 44, r: 16, t: 22, b: 40 }
const T_MIN = 0.5
const T_MAX = 24 * 60
const ORDER: FamilyId[] = [
  'puu',
  'myski',
  'balsami',
  'mauste',
  'kukka',
  'hedelma',
  'raikas',
  'vihrea',
  'havu',
  'sitrus',
  'alkoholi',
]
const TICKS = [1, 2, 5, 10, 30, 60, 120, 240, 480, 1440]
const TICKS_COMPACT = [1, 10, 60, 480]

function scales(W: number, H: number) {
  const span = Math.log10(T_MAX) - Math.log10(T_MIN)
  return {
    X: (t: number) => PAD.l + ((Math.log10(t) - Math.log10(T_MIN)) / span) * (W - PAD.l - PAD.r),
    Y: (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b),
    invX: (x: number) => 10 ** (Math.log10(T_MIN) + ((x - PAD.l) / (W - PAD.l - PAD.r)) * span),
  }
}

interface Props {
  result: SimResult
  timeMin: number
  onTime: (t: number) => void
}

export function Timeline({ result, timeMin, onTime }: Props) {
  const [ref, W] = useWidth<HTMLElement>(1000)
  const compact = W < 640
  const H = compact ? 200 : 260
  const sc = useMemo(() => scales(W, H), [W, H])
  const { X, Y, invX } = sc

  const paths = useMemo(() => {
    const { X, Y } = sc
    const idx = result.times.map((t, j) => ({ t, j })).filter(({ t }) => t >= T_MIN)
    const shares = idx.map(({ j }) => familyShares(result, j))
    return ORDER.map((f, k) => {
      const lower = shares.map((s) => ORDER.slice(0, k).reduce((a, g) => a + (s[g] ?? 0), 0))
      const upper = shares.map((s, n) => lower[n] + (s[f] ?? 0))
      if (upper.every((u, n) => u - lower[n] < 1e-4)) return null
      const top = idx.map(({ t }, n) => `${X(t).toFixed(1)},${Y(upper[n]).toFixed(1)}`)
      const bottom = idx.map(({ t }, n) => `${X(t).toFixed(1)},${Y(lower[n]).toFixed(1)}`).reverse()
      return { f, d: `M${top.join('L')}L${bottom.join('L')}Z` }
    }).filter((p): p is { f: FamilyId; d: string } => p !== null)
  }, [result, sc])

  const fam = Object.fromEntries(FAMILIES.map((f) => [f.id, f]))

  return (
    <section className="timeline" aria-labelledby="timeline-title" ref={ref}>
      <h2 id="timeline-title" className="panel-title">
        Share of odor families over time
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Share of perceived intensity by odor family over time. Click to choose a time."
        onClick={(e) => {
          const svg = e.currentTarget
          const pt = svg.createSVGPoint()
          pt.x = e.clientX
          pt.y = e.clientY
          const loc = pt.matrixTransform(svg.getScreenCTM()?.inverse())
          const t = invX(loc.x)
          if (t >= T_MIN && t <= T_MAX) onTime(t)
        }}
      >
        {paths.map((p) => (
          <path key={p.f} d={p.d} fill={fam[p.f].color} fillOpacity={0.78}>
            <title>{fam[p.f].name}</title>
          </path>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text key={v} x={PAD.l - 8} y={Y(v) + 4} textAnchor="end" className="tick">
            {Math.round(v * 100)}%
          </text>
        ))}
        {(compact ? TICKS_COMPACT : TICKS).map((t) => (
          <text key={t} x={X(t)} y={H - PAD.b + 18} textAnchor="middle" className="tick">
            {timeLabel(t)}
          </text>
        ))}
        <line x1={X(timeMin)} x2={X(timeMin)} y1={PAD.t - 6} y2={H - PAD.b} className="now-line" />
      </svg>
      <ul className="legend-colors">
        {paths.map((p) => (
          <li key={p.f}>
            <span className="swatch" style={{ background: fam[p.f].color }} />
            {fam[p.f].name}
          </li>
        ))}
      </ul>
    </section>
  )
}
