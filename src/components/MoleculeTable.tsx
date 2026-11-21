import { GROUP_BY_ID } from '../data/families.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import { num, pct, timeLabel } from '../lib/format.ts'
import type { SimResult, SourcedValue } from '../sim/types.ts'

interface Props {
  result: SimResult
  j: number
  timeMin: number
  onSelect: (id: string) => void
}

function Sourced({ v, unit }: { v: SourcedValue; unit: string }) {
  return (
    <span title={`${v.source} (${v.method})`}>
      {v.method === 'measured' ? '' : '≈ '}
      {num(v.value)} {unit}
    </span>
  )
}

export function MoleculeTable({ result, j, timeMin, onSelect }: Props) {
  const total = result.initialMass.reduce((s, m) => s + m, 0)
  const rows = result.moleculeIds
    .map((id, i) => ({ id, i, m: MOLECULE_BY_ID[id] }))
    .sort((a, b) => b.m.vp25.value - a.m.vp25.value)

  return (
    <div className="molecules">
      <h2>Molecules in the blend</h2>
      <p className="muted">
        Sorted from most to least volatile. ≈ marks an estimate; hover over a value to see its source. Surface:{' '}
        {result.params.mode === 'skin' ? 'skin 32 °C' : 'paper 22 °C'}.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Molecule</th>
              <th scope="col">Group</th>
              <th scope="col" className="num">
                MW
              </th>
              <th scope="col" className="num">
                Vapor pressure
              </th>
              <th scope="col" className="num">
                Odor threshold
              </th>
              <th scope="col" className="num">
                In blend
              </th>
              <th scope="col" className="num">
                90% evaporated
              </th>
              <th scope="col" className="num">
                Share at {timeLabel(timeMin)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, i, m }) => (
              <tr key={id}>
                <th scope="row">
                  <button className="link-button" onClick={() => onSelect(id)}>
                    {m.name}
                  </button>
                </th>
                <td>{GROUP_BY_ID[m.group].name}</td>
                <td className="num">{num(m.mw, 3)}</td>
                <td className="num">
                  {m.vp25.value > 0 ? <Sourced v={m.vp25} unit="mmHg" /> : 'non-volatile'}
                </td>
                <td className="num">{Number.isFinite(m.odt.value) ? <Sourced v={m.odt} unit="ppm" /> : '–'}</td>
                <td className="num">{pct(result.initialMass[i] / total)}</td>
                <td className="num">
                  {m.vp25.value <= 0 ? '–' : result.t90[i] === null ? 'over 24 h' : timeLabel(result.t90[i]!)}
                </td>
                <td className="num">{pct(result.share[i][j])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
