import type { Material, RecipeLine } from '../sim/types.ts'
import { MOLECULES } from './molecules.ts'

/** Tyypilliset koostumukset (massa-%), kirjallisuuden likiarvoja. Loput prosentit ovat pieniä komponentteja, joita demo ei mallinna. */
const OILS: Material[] = [
  {
    id: 'bergamotti',
    name: 'Bergamotti',
    kind: 'öljy',
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
    name: 'Laventeli',
    kind: 'öljy',
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
    name: 'Patsuli',
    kind: 'öljy',
    composition: { patsulioli: 32, seskviterpeenit: 28, karyofylleeni: 3 },
  },
  {
    id: 'bentsoe',
    name: 'Bentsoe (50 % bentsyylibentsoaatissa)',
    kind: 'resinoidi',
    composition: { bentsyylibentsoaatti: 55, vanilliini: 1.5, hartsi: 43.5 },
    note: 'Haihtumaton hartsiosa ei näy GC-MS-raportissa, mutta hidastaa muiden haihtumista.',
  },
]

const SOLVENT: Material = {
  id: 'etanoli',
  name: 'Etanoli',
  kind: 'liuotin',
  composition: { etanoli: 100 },
}

/** Jokainen kirjaston molekyyli on käytettävissä myös puhtaana eristeenä / synteettinä. */
const ISOLATES: Material[] = MOLECULES.filter((m) => m.id !== 'etanoli' && m.id !== 'hartsi').map(
  (m) => ({
    id: `eriste:${m.id}`,
    name: `${m.name} (eriste)`,
    kind: 'eriste' as const,
    composition: { [m.id]: 100 },
  }),
)

export const MATERIALS: Material[] = [...OILS, SOLVENT, ...ISOLATES]

export const MATERIAL_BY_ID: Record<string, Material> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
)

/** Taustatutkimuksen prototyypin esimerkkiseos (25 % konsentraatti). */
export const DEFAULT_RECIPE: RecipeLine[] = [
  { materialId: 'bergamotti', grams: 3 },
  { materialId: 'laventeli', grams: 2.5 },
  { materialId: 'patsuli', grams: 0.4 },
  { materialId: 'bentsoe', grams: 1.1 },
  { materialId: 'etanoli', grams: 21 },
]
