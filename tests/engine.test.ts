import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEMO_BY_ID } from '../src/data/demo.ts'
import { DEFAULT_RECIPE, MATERIAL_BY_ID } from '../src/data/materials.ts'
import { MOLECULES } from '../src/data/molecules.ts'
import { DEFAULT_PARAMS, indexAt, simulate as simulateWith, type Library } from '../src/sim/engine.ts'
import type { RecipeLine, SimParams } from '../src/sim/types.ts'

// The comparison with the Python prototype always uses the prototype's own values (demo library),
// so the test does not change when the generated data is updated.
const DEMO: Library = { molecules: DEMO_BY_ID, materials: MATERIAL_BY_ID }
const simulate = (recipe: RecipeLine[], params: SimParams) => simulateWith(recipe, params, DEMO)

// Reference values: prototype/evap_proto.py (scipy LSODA), time to 90 % evaporated, in minutes
const PY_SKIN: Record<string, number> = {
  etanoli: 2.0, limoneeni: 14.4, 'beeta-pineeni': 9.3, 'gamma-terpineeni': 18.3, sineoli: 13.1,
  kamferi: 26.8, linalooli: 65.2, linalyyliasetaatti: 84.8, karyofylleeni: 341.2, seskviterpeenit: 753.3,
}
const PY_PAPER: Record<string, number> = {
  etanoli: 3.4, limoneeni: 26.8, 'beeta-pineeni': 17.0, 'gamma-terpineeni': 34.1, sineoli: 23.2,
  kamferi: 52.5, linalooli: 137.1, linalyyliasetaatti: 174.3, karyofylleeni: 790.3,
}

function check(mode: 'skin' | 'paper', ref: Record<string, number>) {
  const r = simulate(DEFAULT_RECIPE, { ...DEFAULT_PARAMS, mode })
  for (const [id, expected] of Object.entries(ref)) {
    const got = r.t90[r.moleculeIds.indexOf(id)]
    assert.ok(got !== null, `${id}: t90 missing`)
    // Python used the first grid point (rounded up), so allow 4 %
    const rel = Math.abs((got as number) - expected) / expected
    assert.ok(rel < 0.04, `${mode} ${id}: ${got?.toFixed(1)} vs ${expected} (${(rel * 100).toFixed(1)} %)`)
  }
  return r
}

test('skin: t90 matches the Python prototype', () => {
  check('skin', PY_SKIN)
})

test('paper: t90 matches the Python prototype', () => {
  check('paper', PY_PAPER)
})

test('skin: patchoulol share 10 → 30 min matches the prototype (73 % → 87 %)', () => {
  const r = simulate(DEFAULT_RECIPE, DEFAULT_PARAMS)
  const p = r.moleculeIds.indexOf('patsulioli')
  const s10 = r.share[p][indexAt(r.times, 10)]
  const s30 = r.share[p][indexAt(r.times, 30)]
  assert.ok(Math.abs(s10 - 0.726) < 0.02, `10 min: ${s10}`)
  assert.ok(Math.abs(s30 - 0.867) < 0.02, `30 min: ${s30}`)
})

test('mass balance: remaining fraction decreases monotonically', () => {
  const r = simulate(DEFAULT_RECIPE, DEFAULT_PARAMS)
  for (const rem of r.remaining) {
    for (let j = 1; j < rem.length; j++) assert.ok(rem[j] <= rem[j - 1] + 1e-12)
  }
})

test('library: every molecule has sensible values', () => {
  for (const m of MOLECULES) {
    assert.ok(m.mw > 0, `${m.id}: MW`)
    assert.ok(m.vp25.value >= 0 && Number.isFinite(m.vp25.value), `${m.id}: vapor pressure`)
    assert.ok(m.odt.value > 0, `${m.id}: odor threshold`)
    assert.ok(m.dHvap >= 0, `${m.id}: heat of vaporization`)
  }
})

test('library: every material molecule exists', () => {
  const ids = new Set(MOLECULES.map((m) => m.id))
  for (const mat of Object.values(MATERIAL_BY_ID)) {
    for (const id of Object.keys(mat.composition)) assert.ok(ids.has(id), `${mat.id}: ${id} missing`)
  }
})

