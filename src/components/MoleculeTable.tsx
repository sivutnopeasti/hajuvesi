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
      {v.method === 'koe' ? '' : '≈ '}
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
      <h2>Molekyylit seoksessa</h2>
      <p className="muted">
        Järjestetty haihtuvimmasta hitaimpaan. ≈ tarkoittaa arviota; vie hiiri arvon päälle nähdäksesi
        lähteen. Pinta: {result.params.mode === 'iho' ? 'iho 32 °C' : 'paperi 22 °C'}.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Molekyyli</th>
              <th scope="col">Ryhmä</th>
              <th scope="col" className="num">
                MW
              </th>
              <th scope="col" className="num">
                Höyrynpaine
              </th>
              <th scope="col" className="num">
                Hajukynnys
              </th>
              <th scope="col" className="num">
                Seoksessa
              </th>
              <th scope="col" className="num">
                90 % haihtunut
              </th>
              <th scope="col" className="num">
                Osuus {timeLabel(timeMin)}
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
                  {m.vp25.value > 0 ? <Sourced v={m.vp25} unit="mmHg" /> : 'haihtumaton'}
                </td>
                <td className="num">{Number.isFinite(m.odt.value) ? <Sourced v={m.odt} unit="ppm" /> : '–'}</td>
                <td className="num">{pct(result.initialMass[i] / total)}</td>
                <td className="num">
                  {m.vp25.value <= 0 ? '–' : result.t90[i] === null ? 'yli 24 h' : timeLabel(result.t90[i]!)}
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
