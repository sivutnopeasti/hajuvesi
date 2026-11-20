import { MATERIAL_BY_ID } from '../data/materials.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import type { Material, Molecule, Mode, RecipeLine, SimParams, SimResult } from './types.ts'

/** Molekyyli- ja raaka-ainekirjasto; testit antavat oman, kiinteän kirjastonsa. */
export interface Library {
  molecules: Record<string, Molecule>
  materials: Record<string, Material>
}

export const DEFAULT_LIBRARY: Library = { molecules: MOLECULE_BY_ID, materials: MATERIAL_BY_ID }

const R = 8.314 // J/(mol K)
const P_ATM = 101325 // Pa
const MMHG = 133.322 // Pa
const T_REF = 298.15 // K
const MW_REF = 46.07 // etanoli, aineensiirtokertoimen vertailu

export const DEFAULT_PARAMS: SimParams = {
  mode: 'iho',
  doseMgCm2: 3,
  kRef: 1e-3,
  phi: 0.05,
  recognitionFactor: 3,
  tEndMin: 24 * 60,
}

export const temperatureK = (mode: Mode): number => (mode === 'iho' ? 305.15 : 295.15)

/** Höyrynpaine (Pa) lämpötilassa T, Clausius–Clapeyron 25 °C:n arvosta. */
export function psat(m: Molecule, T: number): number {
  if (m.vp25.value <= 0) return 0
  return m.vp25.value * MMHG * Math.exp((-m.dHvap * 1000) / R * (1 / T - 1 / T_REF))
}

/** Resepti (grammoina) → molekyylien massat grammoina. Koostumuksen mallintamaton osa jätetään pois. */
export function recipeToMolecules(recipe: RecipeLine[], lib: Library = DEFAULT_LIBRARY): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of recipe) {
    const mat = lib.materials[line.materialId]
    if (!mat || !(line.grams > 0)) continue
    for (const [molId, pct] of Object.entries(mat.composition)) {
      out.set(molId, (out.get(molId) ?? 0) + (line.grams * pct) / 100)
    }
  }
  return out
}

/** Tulostusajat minuutteina: 0 + logaritminen ruudukko 0,1 min – loppuaika. */
export function timeGrid(tEndMin: number, points = 400): number[] {
  const lo = Math.log10(0.1)
  const hi = Math.log10(tEndMin)
  const grid = [0]
  for (let i = 0; i < points; i++) grid.push(10 ** (lo + ((hi - lo) * i) / (points - 1)))
  return grid
}

/**
 * Monikomponenttinen haihtuminen (Raoultin laki, γ = 1) + havaintomalli.
 *
 * dn_i/dt = -k_i · x_i · P_i(T) / (R·T),  x_i = n_i / Σn
 *
 * Koska x_i = n_i / N, yhtälö on lineaarinen n_i:n suhteen kun N tunnetaan:
 * dn_i/dt = -a_i(N) · n_i,  a_i = k_i · P_i / (R·T·N).
 * Ratkaistaan eksponentiaalisella keskipistemenetelmällä, joka on stabiili
 * jäykällekin systeemille (etanoli haihtuu minuuteissa, patsulioli päivissä).
 */
export function simulate(
  recipe: RecipeLine[],
  params: SimParams = DEFAULT_PARAMS,
  lib: Library = DEFAULT_LIBRARY,
): SimResult {
  const masses = recipeToMolecules(recipe, lib)
  const ids = [...masses.keys()].filter((id) => lib.molecules[id] && (masses.get(id) ?? 0) > 0)
  const mols = ids.map((id) => lib.molecules[id])
  const totalMass = ids.reduce((s, id) => s + (masses.get(id) ?? 0), 0)
  const T = temperatureK(params.mode)
  const doseKgM2 = params.doseMgCm2 * 0.01 // 1 mg/cm² = 0,01 kg/m²

  const nMol = ids.length
  const n = new Float64Array(nMol)
  const n0 = new Float64Array(nMol)
  const P = new Float64Array(nMol)
  const k = new Float64Array(nMol)
  const initialMass: number[] = []
  for (let i = 0; i < nMol; i++) {
    const frac = (masses.get(ids[i]) ?? 0) / totalMass
    initialMass.push(frac * params.doseMgCm2)
    n0[i] = (frac * doseKgM2) / (mols[i].mw / 1000)
    n[i] = n0[i]
    P[i] = psat(mols[i], T)
    k[i] = params.kRef * (mols[i].mw / MW_REF) ** (-1 / 3)
  }

  const times = timeGrid(params.tEndMin)
  const remaining: number[][] = ids.map(() => [])
  const ov: number[][] = ids.map(() => [])
  const share: number[][] = ids.map(() => [])

  const a = new Float64Array(nMol)
  const nHalf = new Float64Array(nMol)
  const rates = (state: Float64Array): number => {
    let N = 0
    for (let i = 0; i < nMol; i++) N += state[i]
    let dN = 0
    for (let i = 0; i < nMol; i++) {
      a[i] = N > 0 ? (k[i] * P[i]) / (R * T * N) : 0
      dN += a[i] * state[i]
    }
    return N > 0 ? dN / N : 0 // suhteellinen muutosnopeus 1/s
  }

  const record = () => {
    let N = 0
    for (let i = 0; i < nMol; i++) N += n[i]
    let psiSum = 0
    const psi = new Float64Array(nMol)
    for (let i = 0; i < nMol; i++) {
      const m = mols[i]
      const x = N > 0 ? n[i] / N : 0
      const yPpm = ((x * P[i]) / P_ATM) * 1e6
      const o = Number.isFinite(m.odt.value) ? (params.phi * yPpm) / m.odt.value : 0
      ov[i].push(o)
      remaining[i].push(n0[i] > 0 ? n[i] / n0[i] : 0)
      psi[i] = o > 1 ? o ** (m.stevens ?? 0.5) : 0
      psiSum += psi[i]
    }
    for (let i = 0; i < nMol; i++) share[i].push(psiSum > 0 ? psi[i] / psiSum : 0)
  }

  let t = 0 // sekunteina
  record()
  for (let j = 1; j < times.length; j++) {
    const tTarget = times[j] * 60
    while (t < tTarget - 1e-9) {
      const rel = rates(n)
      let h = rel > 0 ? 0.005 / rel : tTarget - t
      h = Math.min(Math.max(h, 1e-3), tTarget - t)
      for (let i = 0; i < nMol; i++) nHalf[i] = n[i] * Math.exp((-a[i] * h) / 2)
      rates(nHalf)
      for (let i = 0; i < nMol; i++) n[i] = n[i] * Math.exp(-a[i] * h)
      t += h
    }
    record()
  }

  const t90 = remaining.map((r) => {
    for (let j = 1; j < r.length; j++) {
      if (r[j] < 0.1) {
        // log-lineaarinen interpolointi ruudukon pisteiden välillä
        const t0 = times[j - 1] || times[j]
        const f = (r[j - 1] - 0.1) / Math.max(r[j - 1] - r[j], 1e-12)
        return t0 + (times[j] - t0) * f
      }
    }
    return null
  })

  return { times, moleculeIds: ids, initialMass, remaining, ov, share, t90, params }
}

/** Lähimmän tulostusajan indeksi (minuutit). */
export function indexAt(times: number[], tMin: number): number {
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(Math.log((times[i] || 0.05) / tMin))
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
