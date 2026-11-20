import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_RECIPE } from '../src/data/materials.ts'
import { DEFAULT_PARAMS, indexAt, simulate } from '../src/sim/engine.ts'

// Viitearvot: prototype/evap_proto.py (scipy LSODA), aika jossa 90 % haihtunut, minuutteina
const PY_SKIN: Record<string, number> = {
  etanoli: 2.0, limoneeni: 14.4, 'beeta-pineeni': 9.3, 'gamma-terpineeni': 18.3, sineoli: 13.1,
  kamferi: 26.8, linalooli: 65.2, linalyyliasetaatti: 84.8, karyofylleeni: 341.2, seskviterpeenit: 753.3,
}
const PY_PAPER: Record<string, number> = {
  etanoli: 3.4, limoneeni: 26.8, 'beeta-pineeni': 17.0, 'gamma-terpineeni': 34.1, sineoli: 23.2,
  kamferi: 52.5, linalooli: 137.1, linalyyliasetaatti: 174.3, karyofylleeni: 790.3,
}

function check(mode: 'iho' | 'paperi', ref: Record<string, number>) {
  const r = simulate(DEFAULT_RECIPE, { ...DEFAULT_PARAMS, mode })
  for (const [id, expected] of Object.entries(ref)) {
    const got = r.t90[r.moleculeIds.indexOf(id)]
    assert.ok(got !== null, `${id}: t90 puuttuu`)
    // Python käytti ruudukon ensimmäistä pistettä (ylöspäin pyöristys), joten sallitaan 4 %
    const rel = Math.abs((got as number) - expected) / expected
    assert.ok(rel < 0.04, `${mode} ${id}: ${got?.toFixed(1)} vs ${expected} (${(rel * 100).toFixed(1)} %)`)
  }
  return r
}

test('iho: t90 vastaa Python-prototyyppiä', () => {
  check('iho', PY_SKIN)
})

test('paperi: t90 vastaa Python-prototyyppiä', () => {
  check('paperi', PY_PAPER)
})

test('iho: patsulin osuus 10 → 30 min vastaa prototyyppiä (73 % → 87 %)', () => {
  const r = simulate(DEFAULT_RECIPE, DEFAULT_PARAMS)
  const p = r.moleculeIds.indexOf('patsulioli')
  const s10 = r.share[p][indexAt(r.times, 10)]
  const s30 = r.share[p][indexAt(r.times, 30)]
  assert.ok(Math.abs(s10 - 0.726) < 0.02, `10 min: ${s10}`)
  assert.ok(Math.abs(s30 - 0.867) < 0.02, `30 min: ${s30}`)
})

test('massa säilyy: jäljellä oleva osuus pienenee monotonisesti', () => {
  const r = simulate(DEFAULT_RECIPE, DEFAULT_PARAMS)
  for (const rem of r.remaining) {
    for (let j = 1; j < rem.length; j++) assert.ok(rem[j] <= rem[j - 1] + 1e-12)
  }
})
