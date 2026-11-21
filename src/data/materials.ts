import type { Material, RecipeLine } from '../sim/types.ts'
import { MOLECULES } from './molecules.ts'

/** Typical compositions (mass %), approximate literature values. The remaining percent is minor components that are not modelled. */
export const OILS: Material[] = [
  {
    id: 'bergamotti',
    name: 'Bergamot',
    kind: 'oil',
    composition: {
      limoneeni: 40,
      linalyyliasetaatti: 30,
      linalooli: 10,
      'gamma-terpineeni': 8,
      'beeta-pineeni': 7,
    },
  },
  {
    id: 'laventeli',
    name: 'Lavender',
    kind: 'oil',
    composition: {
      linalooli: 35,
      linalyyliasetaatti: 38,
      sineoli: 2,
      kamferi: 0.5,
      karyofylleeni: 4,
    },
  },
  {
    id: 'patsuli',
    name: 'Patchouli',
    kind: 'oil',
    composition: { patsulioli: 32, seskviterpeenit: 28, karyofylleeni: 3 },
  },
  {
    id: 'bentsoe',
    name: 'Benzoin (50 % in benzyl benzoate)',
    kind: 'resinoid',
    composition: { bentsyylibentsoaatti: 55, vanilliini: 1.5, hartsi: 43.5 },
    note: 'The non-volatile resin does not show up in a GC-MS report, but it slows the evaporation of everything else.',
  },
]

const SOLVENT_NAMES: Record<string, string> = {
  etanoli: 'Ethanol',
  dpg: 'Dipropylene glycol (DPG)',
  trietyylisitraatti: 'Triethyl citrate',
  ipm: 'Isopropyl myristate (IPM)',
}

const SOLVENTS: Material[] = Object.entries(SOLVENT_NAMES)
  .filter(([id]) => MOLECULES.some((m) => m.id === id))
  .map(([id, name]) => ({ id, name, kind: 'solvent' as const, composition: { [id]: 100 } }))

/** Every molecule in the library is also available as a pure isolate / synthetic. */
const ISOLATES: Material[] = MOLECULES.filter(
  (m) => m.group !== 'liuotin' && m.id !== 'hartsi' && m.id !== 'seskviterpeenit',
)
  .map((m) => ({
    id: `eriste:${m.id}`,
    name: m.name,
    kind: 'isolate' as const,
    composition: { [m.id]: 100 },
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))

export const MATERIALS: Material[] = [...OILS, ...SOLVENTS, ...ISOLATES]

export const MATERIAL_BY_ID: Record<string, Material> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]))

/** Example blend from the background-research prototype (25 % concentrate). */
export const DEFAULT_RECIPE: RecipeLine[] = [
  { materialId: 'bergamotti', grams: 3 },
  { materialId: 'laventeli', grams: 2.5 },
  { materialId: 'patsuli', grams: 0.4 },
  { materialId: 'bentsoe', grams: 1.1 },
  { materialId: 'etanoli', grams: 21 },
]
