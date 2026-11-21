import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildIndex, normalize, search } from '../src/lib/search.ts'
import type { Material, Molecule } from '../src/sim/types.ts'

const mol = (id: string, name: string, extra: Partial<Molecule> = {}): Molecule => ({
  id,
  name,
  mw: 150,
  vp25: { value: 0.1, method: 'measured', source: '' },
  dHvap: 55,
  odt: { value: 0.1, method: 'measured', source: '' },
  family: 'kukka',
  group: 'esteri',
  odor: '',
  ...extra,
})
const MOLS: Record<string, Molecule> = {
  a: mol('a', 'α-Pinene', { odor: 'pine, terpenic', cas: '80-56-8' }),
  b: mol('b', 'Methyl dihydrojasmonate', { odor: 'floral, fresh, jasmin', synonyms: ['Hedione', 'MDJ'], cas: '24851-98-7' }),
  c: mol('c', 'Linalool', { odor: 'floral, fresh, woody', cas: '78-70-6' }),
  d: mol('d', 'Linalyl acetate', { odor: 'bergamot, lavender', cas: '115-95-7' }),
}
const MATS: Material[] = [
  { id: 'lav', name: 'Lavender', kind: 'oil', composition: { c: 35, d: 38 } },
  ...Object.values(MOLS).map((m) => ({ id: `eriste:${m.id}`, name: m.name, kind: 'isolate' as const, composition: { [m.id]: 100 } })),
]
const index = buildIndex(MATS, MOLS)
const names = (q: string) => search(index, q).map((h) => h.entry.material.name)

test('normalize: Greek letters, accents and punctuation', () => {
  assert.equal(normalize('α-Pinène'), 'alpha pinene')
  assert.equal(normalize('(E)-2-Hexenal'), 'e 2 hexenal')
})

test('search: name prefix ranks first, shorter names first', () => {
  assert.deepEqual(names('lina'), ['Linalool', 'Linalyl acetate'])
})

test('search: Greek letter written out or abbreviated', () => {
  assert.deepEqual(names('alpha pinene'), ['α-Pinene'])
  assert.deepEqual(names('a-pinene'), ['α-Pinene'])
})

test('search: trade name finds the molecule and reports the synonym', () => {
  const [hit] = search(index, 'hedione')
  assert.equal(hit.entry.material.name, 'Methyl dihydrojasmonate')
  assert.equal(hit.matched, 'Hedione')
})

test('search: CAS number and odor', () => {
  assert.deepEqual(names('24851-98'), ['Methyl dihydrojasmonate'])
  assert.deepEqual(names('jasmin'), ['Methyl dihydrojasmonate'])
})
