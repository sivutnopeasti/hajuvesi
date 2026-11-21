import { FAMILY_BY_ID } from '../data/families.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import type { FamilyId, SimResult } from './types.ts'

/** Weber fraction for odors (Stone 1965): a change below about 28 % is usually not noticed. */
export const WEBER = 0.28

export type ChangeKind = 'vanished' | 'appeared' | 'rose' | 'faded'

export interface Change {
  id: string
  kind: ChangeKind
  shareA: number
  shareB: number
  remainingB: number
  reason: string
}

export interface Comparison {
  changes: Change[]
  familyA: Partial<Record<FamilyId, number>>
  familyB: Partial<Record<FamilyId, number>>
  summary: string
}

const fmt = (v: number, digits = 2) =>
  v >= 0.01
    ? v.toLocaleString('en-US', { maximumSignificantDigits: digits + 1 })
    : v.toExponential(1)

const pct = (v: number) => `${Math.round(v * 100)}%`

export function familyShares(r: SimResult, j: number): Partial<Record<FamilyId, number>> {
  const out: Partial<Record<FamilyId, number>> = {}
  r.moleculeIds.forEach((id, i) => {
    const f = MOLECULE_BY_ID[id].family
    out[f] = (out[f] ?? 0) + r.share[i][j]
  })
  return out
}

/** Compares two sniff moments (output indices jA < jB) and produces the reasons. */
export function compare(r: SimResult, jA: number, jB: number): Comparison {
  const recog = r.params.recognitionFactor
  const changes: Change[] = []

  r.moleculeIds.forEach((id, i) => {
    const m = MOLECULE_BY_ID[id]
    const ovA = r.ov[i][jA]
    const ovB = r.ov[i][jB]
    const sA = r.share[i][jA]
    const sB = r.share[i][jB]
    const remB = r.remaining[i][jB]
    const remA = r.remaining[i][jA]
    const evaporated = remA > 0 ? 1 - remB / remA : 0
    const vp = m.vp25.value
    const lowOdt = m.odt.value < 1e-3
    let kind: ChangeKind | null = null

    if (ovA >= recog && ovB < recog) kind = 'vanished'
    else if (ovA < recog && ovB >= recog) kind = 'appeared'
    else if (ovA >= recog && ovB >= recog) {
      if (sB >= 0.03 && sB >= sA * (1 + WEBER)) kind = 'rose'
      else if (sA >= 0.03 && sB <= sA / (1 + WEBER)) kind = 'faded'
    }
    if (!kind) return

    let reason = ''
    if (kind === 'vanished' || kind === 'faded') {
      if (evaporated > 0.5) {
        reason = `${pct(evaporated)} evaporated in between: a vapor pressure of ${fmt(vp)} mmHg is high, so the molecule leaves quickly.`
      } else {
        reason = `Evaporates slowly (${fmt(vp)} mmHg), but stronger materials mask it.`
      }
      if (kind === 'vanished') reason += ' Its concentration fell below the recognition threshold.'
    } else if (kind === 'rose') {
      reason =
        remB > 0.8
          ? `Barely evaporates (${fmt(vp)} mmHg, ${pct(remB)} left); its share grows as the lighter materials around it disappear.`
          : `Its share grows as the faster-evaporating notes fade.`
      if (lowOdt) reason += ` Very low odor threshold (${fmt(m.odt.value)} ppm): even a small amount is noticeable.`
    } else {
      reason =
        remB > 0.5
          ? 'Its concentration rose above the recognition threshold as the ethanol evaporated and the blend became more concentrated.'
          : 'Its concentration rose above the recognition threshold.'
    }
    changes.push({ id, kind, shareA: sA, shareB: sB, remainingB: remB, reason })
  })

  const order: Record<ChangeKind, number> = { vanished: 0, faded: 1, rose: 2, appeared: 3 }
  changes.sort((x, y) => order[x.kind] - order[y.kind] || Math.abs(y.shareB - y.shareA) - Math.abs(x.shareB - x.shareA))

  const familyA = familyShares(r, jA)
  const familyB = familyShares(r, jB)
  const deltas = (Object.keys({ ...familyA, ...familyB }) as FamilyId[])
    .map((f) => ({ f, d: (familyB[f] ?? 0) - (familyA[f] ?? 0) }))
    .sort((x, y) => x.d - y.d)
  const down = deltas.at(0)
  const up = deltas.at(-1)
  let summary = 'The structure of the scent stays almost the same between these moments.'
  if (down && up && up.d > 0.03) {
    summary = `${FAMILY_BY_ID[up.f].name} rises ${pct(familyA[up.f] ?? 0)} → ${pct(familyB[up.f] ?? 0)}`
    if (down.d < -0.03) {
      summary += `, ${FAMILY_BY_ID[down.f].name.toLowerCase()} falls ${pct(familyA[down.f] ?? 0)} → ${pct(familyB[down.f] ?? 0)}`
    }
    summary += '.'
  }
  return { changes, familyA, familyB, summary }
}
