import { FAMILY_BY_ID } from '../data/families.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import type { FamilyId, SimResult } from './types.ts'

/** Weberin suhde hajuille (Stone 1965): alle n. 28 % muutos ei yleensä erotu. */
export const WEBER = 0.28

export type ChangeKind = 'katosi' | 'ilmestyi' | 'nousi' | 'heikkeni'

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
    ? v.toLocaleString('fi-FI', { maximumSignificantDigits: digits + 1 })
    : v.toExponential(1).replace('.', ',')

const pct = (v: number) => `${Math.round(v * 100)} %`

export function familyShares(r: SimResult, j: number): Partial<Record<FamilyId, number>> {
  const out: Partial<Record<FamilyId, number>> = {}
  r.moleculeIds.forEach((id, i) => {
    const f = MOLECULE_BY_ID[id].family
    out[f] = (out[f] ?? 0) + r.share[i][j]
  })
  return out
}

/** Vertailee kahta haistohetkeä (tulostusindeksit jA < jB) ja tuottaa syykoodit. */
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

    if (ovA >= recog && ovB < recog) kind = 'katosi'
    else if (ovA < recog && ovB >= recog) kind = 'ilmestyi'
    else if (ovA >= recog && ovB >= recog) {
      if (sB >= 0.03 && sB >= sA * (1 + WEBER)) kind = 'nousi'
      else if (sA >= 0.03 && sB <= sA / (1 + WEBER)) kind = 'heikkeni'
    }
    if (!kind) return

    let reason = ''
    if (kind === 'katosi' || kind === 'heikkeni') {
      if (evaporated > 0.5) {
        reason = `${pct(evaporated)} haihtui välillä – höyrynpaine ${fmt(vp)} mmHg on korkea, joten molekyyli lähtee nopeasti.`
      } else {
        reason = `Haihtuu hitaasti (${fmt(vp)} mmHg), mutta voimakkaammat aineet peittävät sen.`
      }
      if (kind === 'katosi') reason += ' Pitoisuus putosi tunnistuskynnyksen alle.'
    } else if (kind === 'nousi') {
      reason =
        remB > 0.8
          ? `Ei juuri haihdu (${fmt(vp)} mmHg, ${pct(remB)} jäljellä); osuus kasvaa, kun kevyemmät katoavat ympäriltä.`
          : `Osuus kasvaa, kun nopeammin haihtuvat nuotit hiipuvat.`
      if (lowOdt) reason += ` Erittäin matala hajukynnys (${fmt(m.odt.value)} ppm): pienikin määrä kuuluu.`
    } else {
      reason =
        remB > 0.5
          ? 'Pitoisuus nousi tunnistuskynnyksen yli, kun etanoli haihtui ja seos väkevöityi iholla.'
          : 'Pitoisuus nousi tunnistuskynnyksen yli.'
    }
    changes.push({ id, kind, shareA: sA, shareB: sB, remainingB: remB, reason })
  })

  const order: Record<ChangeKind, number> = { katosi: 0, heikkeni: 1, nousi: 2, ilmestyi: 3 }
  changes.sort((x, y) => order[x.kind] - order[y.kind] || Math.abs(y.shareB - y.shareA) - Math.abs(x.shareB - x.shareA))

  const familyA = familyShares(r, jA)
  const familyB = familyShares(r, jB)
  const deltas = (Object.keys({ ...familyA, ...familyB }) as FamilyId[])
    .map((f) => ({ f, d: (familyB[f] ?? 0) - (familyA[f] ?? 0) }))
    .sort((x, y) => x.d - y.d)
  const down = deltas.at(0)
  const up = deltas.at(-1)
  let summary = 'Tuoksun rakenne pysyy lähes samana näiden hetkien välillä.'
  if (down && up && up.d > 0.03) {
    summary = `${FAMILY_BY_ID[up.f].name} nousee ${pct(familyA[up.f] ?? 0)} → ${pct(familyB[up.f] ?? 0)}`
    if (down.d < -0.03) {
      summary += `, ${FAMILY_BY_ID[down.f].name.toLowerCase()} laskee ${pct(familyA[down.f] ?? 0)} → ${pct(familyB[down.f] ?? 0)}`
    }
    summary += '.'
  }
  return { changes, familyA, familyB, summary }
}
