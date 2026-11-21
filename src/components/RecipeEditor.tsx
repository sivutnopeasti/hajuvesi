import { DEFAULT_RECIPE, MATERIALS, MATERIAL_BY_ID } from '../data/materials.ts'
import { MaterialPicker } from './MaterialPicker.tsx'
import { num } from '../lib/format.ts'
import type { RecipeLine } from '../sim/types.ts'

interface Props {
  recipe: RecipeLine[]
  onChange: (r: RecipeLine[]) => void
  dose: number
  onDose: (v: number) => void
}

export function RecipeEditor({ recipe, onChange, dose, onDose }: Props) {
  const total = recipe.reduce((s, l) => s + (l.grams || 0), 0)
  const solvent = recipe
    .filter((l) => MATERIAL_BY_ID[l.materialId]?.kind === 'solvent')
    .reduce((s, l) => s + (l.grams || 0), 0)
  const concentrate = total > 0 ? (total - solvent) / total : 0

  const update = (k: number, patch: Partial<RecipeLine>) =>
    onChange(recipe.map((l, n) => (n === k ? { ...l, ...patch } : l)))

  const unused = MATERIALS.find((m) => !recipe.some((l) => l.materialId === m.id))

  return (
    <div className="recipe">
      <h2 id="recipe-title">Formula</h2>
      <p className="muted">
        Enter amounts in grams. Materials are broken down into molecules by their typical composition, and the map
        updates immediately. The list holds {MATERIALS.length.toLocaleString('en-US')} materials; search by name,
        trade name, CAS number or odor.
      </p>
      <table className="recipe-table">
        <thead>
          <tr>
            <th scope="col">Material</th>
            <th scope="col" className="num">
              Grams
            </th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {recipe.map((line, k) => (
            <tr key={k}>
              <td>
                <MaterialPicker
                  id={`mat-${k}`}
                  label={`Material ${k + 1}`}
                  value={line.materialId}
                  onChange={(materialId) => update(k, { materialId })}
                />
              </td>
              <td className="num">
                <label className="visually-hidden" htmlFor={`g-${k}`}>
                  Grams, row {k + 1}
                </label>
                <input
                  id={`g-${k}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={line.grams}
                  onChange={(e) => update(k, { grams: Math.max(0, Number(e.target.value) || 0) })}
                />
              </td>
              <td>
                <button className="link-button" onClick={() => onChange(recipe.filter((_, n) => n !== k))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="recipe-actions">
        <button
          className="primary-button"
          onClick={() => unused && onChange([...recipe, { materialId: unused.id, grams: 0.5 }])}
          disabled={!unused}
        >
          Add material
        </button>
        <button className="ghost-button" onClick={() => onChange(DEFAULT_RECIPE)}>
          Reset to example blend
        </button>
      </div>
      <dl className="recipe-summary">
        <dt>Total</dt>
        <dd>{num(total, 3)} g</dd>
        <dt>Concentrate</dt>
        <dd>{Math.round(concentrate * 100)}%</dd>
        <dt>
          <label htmlFor="dose">Dose on skin / paper</label>
        </dt>
        <dd>
          <input
            id="dose"
            type="number"
            min={0.5}
            max={20}
            step={0.5}
            value={dose}
            onChange={(e) => onDose(Math.min(20, Math.max(0.5, Number(e.target.value) || 3)))}
          />{' '}
          mg/cm²
        </dd>
      </dl>
    </div>
  )
}
