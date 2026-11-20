import { useMemo } from 'react'
import type { ColorBy } from '../App.tsx'
import { FAMILY_BY_ID, GROUP_BY_ID } from '../data/families.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import { num, pct } from '../lib/format.ts'
import { useWidth } from '../lib/useWidth.ts'
import type { SimResult } from '../sim/types.ts'

interface Domain {
  vpHi: number
  vpLo: number
  mwLo: number
  mwHi: number
}

interface Geometry extends Domain {
  W: number
  H: number
  pad: { l: number; r: number; t: number; b: number }
  X: (vp: number) => number
  Y: (mw: number) => number
  compact: boolean
}

/** Mitat todellisissa CSS-pikseleissä, jotta teksti pysyy luettavana myös puhelimella. */
function geometry(width: number, d: Domain): Geometry {
  const compact = width < 640
  const W = width
  const H = compact ? Math.round(Math.max(420, width * 1.15)) : Math.round(width * 0.634)
  const pad = compact ? { l: 44, r: 12, t: 28, b: 58 } : { l: 64, r: 28, t: 28, b: 64 }
  const lhi = Math.log10(d.vpHi)
  const llo = Math.log10(d.vpLo)
  const X = (vp: number) => {
    const v = Math.min(d.vpHi, Math.max(d.vpLo, vp))
    return pad.l + ((lhi - Math.log10(v)) / (lhi - llo)) * (W - pad.l - pad.r)
  }
  const Y = (mw: number) => pad.t + ((mw - d.mwLo) / (d.mwHi - d.mwLo)) * (H - pad.t - pad.b)
  return { ...d, W, H, pad, X, Y, compact }
}

function decadeTicks(d: Domain, compact: boolean): number[] {
  const out: number[] = []
  const step = compact ? 2 : 1
  for (let e = Math.floor(Math.log10(d.vpHi)); e >= Math.ceil(Math.log10(d.vpLo)); e -= step) out.push(10 ** e)
  return out
}

const Y_STEP = 50
const ZONE_BOUNDS = [0.5, 0.01]
const ZONE_LABELS = [
  { label: 'Nopeasti haihtuvat', short: 'Nopeat' },
  { label: 'Keskihaihtuvat', short: 'Keski' },
  { label: 'Hitaasti haihtuvat', short: 'Hitaat' },
]

interface Props {
  result: SimResult
  j: number
  colorBy: ColorBy
  selectedId: string | null
  onSelect: (id: string | null) => void
}

interface Placed {
  id: string
  x: number
  y: number
  r: number
  r0: number
  lx: number
  ly: number
  anchor: 'start' | 'end'
}

const textWidth = (s: string) => s.length * 6.6

const radiusFor = (mass: number, ref: number, scale = 1) =>
  scale * Math.min(36, 2.5 + 30 * Math.sqrt(Math.max(mass, 0) / ref))

/** Yksinkertainen ahne nimilappujen sijoittelu: oikealle, vasemmalle, ylös tai alas – ensimmäinen vapaa. */
function placeLabels(items: { id: string; x: number; y: number; r: number; label: string }[], g: Geometry) {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = items.map((b) => ({
    x0: b.x - b.r,
    x1: b.x + b.r,
    y0: b.y - b.r,
    y1: b.y + b.r,
  }))
  const out = new Map<string, { lx: number; ly: number; anchor: 'start' | 'end' }>()
  const overlaps = (a: (typeof boxes)[number]) =>
    boxes.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0)
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const w = textWidth(it.label)
    const cands: { lx: number; ly: number; anchor: 'start' | 'end' }[] = [
      { lx: it.x + it.r + 5, ly: it.y + 4, anchor: 'start' },
      { lx: it.x - it.r - 5, ly: it.y + 4, anchor: 'end' },
      { lx: it.x + 4, ly: it.y - it.r - 6, anchor: 'start' },
      { lx: it.x + 4, ly: it.y + it.r + 14, anchor: 'start' },
      { lx: it.x + it.r + 5, ly: it.y + 18, anchor: 'start' },
      { lx: it.x + it.r + 5, ly: it.y - 10, anchor: 'start' },
    ]
    let chosen = cands[0]
    let fallback: (typeof cands)[number] | null = null
    for (const c of cands) {
      const box = {
        x0: c.anchor === 'start' ? c.lx : c.lx - w,
        x1: c.anchor === 'start' ? c.lx + w : c.lx,
        y0: c.ly - 11,
        y1: c.ly + 3,
      }
      if (box.x0 < g.pad.l - 30 || box.x1 > g.W - 2 || box.y0 < 4 || box.y1 > g.H - g.pad.b) continue
      fallback ??= c
      if (!overlaps(box)) {
        chosen = c
        fallback = null
        boxes.push(box)
        break
      }
    }
    out.set(it.id, fallback ?? chosen)
  }
  return out
}

export function MoleculeMap({ result, j, colorBy, selectedId, onSelect }: Props) {
  const recog = result.params.recognitionFactor
  const [ref, width] = useWidth<HTMLElement>()

  const visible = useMemo(
    () =>
      result.moleculeIds
        .map((id, i) => ({ id, i, m: MOLECULE_BY_ID[id] }))
        .filter(({ m }) => m.vp25.value > 0),
    [result],
  )

  const domain = useMemo<Domain>(() => {
    const vps = visible.flatMap(({ m }) => [m.vp25.value, m.vp25.min ?? m.vp25.value, m.vp25.max ?? m.vp25.value])
    const mws = visible.map(({ m }) => m.mw)
    const vpHi = 10 ** Math.ceil(Math.log10(Math.max(200, ...vps) * 1.5))
    const vpLo = 10 ** Math.floor(Math.log10(Math.max(1e-9, Math.min(5e-5, ...vps) / 1.5)))
    const mwHi = Math.max(240, Math.ceil((Math.max(...mws, 0) + 20) / Y_STEP) * Y_STEP)
    return { vpHi, vpLo, mwLo: 30, mwHi }
  }, [visible])

  const g = useMemo(() => geometry(width, domain), [width, domain])
  const { W, H, pad: PAD, X, Y } = g
  const bounds = [g.vpHi, ...ZONE_BOUNDS, g.vpLo]
  const zones = ZONE_LABELS.map((z, k) => ({ from: bounds[k], to: bounds[k + 1], ...z }))
  const yTicks: number[] = []
  for (let v = Y_STEP; v < g.mwHi; v += Y_STEP) yTicks.push(v)

  const mRef = useMemo(() => {
    const masses = visible.filter(({ m }) => m.group !== 'liuotin').map(({ i }) => result.initialMass[i])
    return Math.max(...masses, 1e-9)
  }, [visible, result])

  const rs = g.compact ? 0.72 : 1
  const radius = (mass: number) => radiusFor(mass, mRef, rs)

  // Nimilaput sijoitetaan alkuperäisten kuplien mukaan, jotta ne eivät hypi aikaa siirrettäessä.
  const labels = useMemo(
    () =>
      placeLabels(
        visible.map(({ id, i, m }) => ({
          id,
          x: g.X(m.vp25.value),
          y: g.Y(m.mw),
          r: radiusFor(result.initialMass[i], mRef, g.compact ? 0.72 : 1),
          label: m.name,
        })),
        g,
      ),
    [visible, mRef, result, g],
  )

  const placed: Placed[] = visible.map(({ id, i, m }) => {
    const l = labels.get(id)!
    return {
      id,
      x: X(m.vp25.value),
      y: Y(m.mw),
      r: radius(result.initialMass[i] * result.remaining[i][j]),
      r0: radius(result.initialMass[i]),
      ...l,
    }
  })

  const colorOf = (id: string) => {
    const m = MOLECULE_BY_ID[id]
    return colorBy === 'family' ? FAMILY_BY_ID[m.family].color : GROUP_BY_ID[m.group].color
  }

  const legend =
    colorBy === 'family'
      ? [...new Set(visible.map(({ m }) => m.family))].map((f) => FAMILY_BY_ID[f])
      : [...new Set(visible.map(({ m }) => m.group))].map((g) => GROUP_BY_ID[g])

  return (
    <figure className="map" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Molekyylikartta: molekyylipaino ja höyrynpaine, kuplan koko kertoo jäljellä olevan määrän"
        onClick={() => onSelect(null)}
      >
        {zones.map((z, k) => (
          <g key={z.label}>
            <rect
              x={X(z.from)}
              y={PAD.t}
              width={X(z.to) - X(z.from)}
              height={H - PAD.t - PAD.b}
              className={k % 2 === 1 ? 'zone zone-alt' : 'zone'}
            />
            <text x={(X(z.from) + X(z.to)) / 2} y={PAD.t + 16} textAnchor="middle" className="zone-label">
              {g.compact ? z.short : z.label}
            </text>
          </g>
        ))}

        {decadeTicks(g, g.compact).map((v) => (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={PAD.t} y2={H - PAD.b} className="grid" />
            <text x={X(v)} y={H - PAD.b + 18} textAnchor="middle" className="tick">
              {num(v, 1)}
            </text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} className="grid" />
            <text x={PAD.l - 10} y={Y(v) + 4} textAnchor="end" className="tick">
              {v}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 14} textAnchor="middle" className="axis-title">
          {g.compact ? 'Höyrynpaine 25 °C (mmHg), haihtuvin vasemmalla' : 'Höyrynpaine 25 °C:ssa (mmHg, log-asteikko) – haihtuvin vasemmalla'}
        </text>
        <text
          transform={`translate(${g.compact ? 12 : 18} ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-title"
        >
          Molekyylipaino (g/mol) – kevyt ylhäällä
        </text>

        {placed.map((p) => {
          const vp = MOLECULE_BY_ID[p.id].vp25
          if (!vp.min || !vp.max || vp.max / vp.min < 1.5) return null
          return (
            <g key={`range-${p.id}`} className="vp-range">
              <title>{`Höyrynpaine lähteittäin ${num(vp.min)}–${num(vp.max)} mmHg`}</title>
              <line x1={X(vp.max)} x2={X(vp.min)} y1={p.y} y2={p.y} />
              <line x1={X(vp.max)} x2={X(vp.max)} y1={p.y - 4} y2={p.y + 4} />
              <line x1={X(vp.min)} x2={X(vp.min)} y1={p.y - 4} y2={p.y + 4} />
            </g>
          )
        })}
        {placed.map((p) => (
          <circle key={`ghost-${p.id}`} cx={p.x} cy={p.y} r={p.r0} className="ghost" />
        ))}

        {placed.map((p) => {
          const i = result.moleculeIds.indexOf(p.id)
          const m = MOLECULE_BY_ID[p.id]
          const o = result.ov[i][j]
          const state = o >= recog ? 'recognized' : o >= 1 ? 'detected' : 'silent'
          const c = colorOf(p.id)
          const sel = p.id === selectedId
          const label = `${m.name}: ${pct(result.remaining[i][j])} jäljellä, ${
            state === 'recognized' ? 'tunnistettava' : state === 'detected' ? 'havaittava' : 'ei havaittava'
          }`
          return (
            <g
              key={p.id}
              className={`bubble ${state}${sel ? ' is-selected' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={label}
              aria-pressed={sel}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(sel ? null : p.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(sel ? null : p.id)
                }
              }}
            >
              <title>{label}</title>
              <circle
                cx={p.x}
                cy={p.y}
                r={Math.max(p.r, 2)}
                fill={c}
                fillOpacity={state === 'recognized' ? 0.88 : state === 'detected' ? 0.32 : 0}
                stroke={c}
                strokeWidth={sel ? 2.5 : 1.25}
                strokeDasharray={state === 'silent' ? '3 3' : undefined}
              />
              <text x={p.lx} y={p.ly} textAnchor={p.anchor} className="bubble-label">
                {m.name}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="map-legend">
        <ul className="legend-colors">
          {legend.map((l) => (
            <li key={l.id}>
              <span className="swatch" style={{ background: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
        <ul className="legend-states">
          <li>
            <span className="state-dot recognized" />
            Tunnistettava
          </li>
          <li>
            <span className="state-dot detected" />
            Havaittava
          </li>
          <li>
            <span className="state-dot silent" />
            Kynnyksen alla
          </li>
          <li>
            <span className="state-dot ghost-dot" />
            Alkuperäinen määrä
          </li>
        </ul>
      </figcaption>
    </figure>
  )
}
