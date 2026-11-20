import { DEFAULT_RECIPE, MATERIALS, MATERIAL_BY_ID } from '../data/materials.ts'
import { num } from '../lib/format.ts'
import type { RecipeLine } from '../sim/types.ts'

interface Props {
  recipe: RecipeLine[]
  onChange: (r: RecipeLine[]) => void
  dose: number
  onDose: (v: number) => void
}

const GROUPS: { label: string; kinds: string[] }[] = [
  { label: 'Öljyt ja resinoidit', kinds: ['öljy', 'resinoidi'] },
  { label: 'Liuotin', kinds: ['liuotin'] },
  { label: 'Eristeet ja synteetit', kinds: ['eriste'] },
]

export function RecipeEditor({ recipe, onChange, dose, onDose }: Props) {
  const total = recipe.reduce((s, l) => s + (l.grams || 0), 0)
  const solvent = recipe
    .filter((l) => MATERIAL_BY_ID[l.materialId]?.kind === 'liuotin')
    .reduce((s, l) => s + (l.grams || 0), 0)
  const concentrate = total > 0 ? (total - solvent) / total : 0

  const update = (k: number, patch: Partial<RecipeLine>) =>
    onChange(recipe.map((l, n) => (n === k ? { ...l, ...patch } : l)))

  const unused = MATERIALS.find((m) => !recipe.some((l) => l.materialId === m.id))

  return (
    <div className="recipe">
      <h2 id="recipe-title">Resepti</h2>
      <p className="muted">
        Anna määrät grammoina. Raaka-aineet puretaan molekyyleiksi tyypillisen koostumuksen mukaan, ja kartta
        päivittyy heti.
      </p>
      <table className="recipe-table">
        <thead>
          <tr>
            <th scope="col">Raaka-aine</th>
            <th scope="col" className="num">
              Grammaa
            </th>
            <th scope="col">
              <span className="visually-hidden">Toiminnot</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {recipe.map((line, k) => (
            <tr key={k}>
              <td>
                <label className="visually-hidden" htmlFor={`mat-${k}`}>
                  Raaka-aine {k + 1}
                </label>
                <select
                  id={`mat-${k}`}
                  value={line.materialId}
                  onChange={(e) => update(k, { materialId: e.target.value })}
                >
                  {GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {MATERIALS.filter((m) => g.kinds.includes(m.kind)).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </td>
              <td className="num">
                <label className="visually-hidden" htmlFor={`g-${k}`}>
                  Grammaa, rivi {k + 1}
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
                  Poista
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
          Lisää raaka-aine
        </button>
        <button className="ghost-button" onClick={() => onChange(DEFAULT_RECIPE)}>
          Palauta esimerkkiseos
        </button>
      </div>
      <dl className="recipe-summary">
        <dt>Yhteensä</dt>
        <dd>{num(total, 3)} g</dd>
        <dt>Konsentraatti</dt>
        <dd>{Math.round(concentrate * 100)} %</dd>
        <dt>
          <label htmlFor="dose">Annos iholla / paperilla</label>
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
