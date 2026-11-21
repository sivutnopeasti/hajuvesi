import { MOLECULE_BY_ID } from '../data/molecules.ts'
import { pct, timeLabel } from '../lib/format.ts'
import { indexAt } from '../sim/engine.ts'
import { compare, type ChangeKind } from '../sim/explain.ts'
import type { SimResult } from '../sim/types.ts'

const OPTIONS = [1, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480]

const KIND_TITLE: Record<ChangeKind, string> = {
  vanished: 'Disappeared',
  faded: 'Faded',
  rose: 'Came forward',
  appeared: 'Crossed the recognition threshold',
}

interface Props {
  result: SimResult
  sniffA: number
  sniffB: number
  onA: (t: number) => void
  onB: (t: number) => void
  onShow: (t: number) => void
}

export function ComparePanel({ result, sniffA, sniffB, onA, onB, onShow }: Props) {
  const [a, b] = sniffA <= sniffB ? [sniffA, sniffB] : [sniffB, sniffA]
  const cmp = compare(result, indexAt(result.times, a), indexAt(result.times, b))
  const kinds: ChangeKind[] = ['vanished', 'faded', 'rose', 'appeared']

  return (
    <div className="compare">
      <div className="compare-head">
        <h2 id="compare-title">What changed between the two sniffs?</h2>
        <div className="compare-pickers">
          <label>
            First sniff
            <select value={sniffA} onChange={(e) => onA(Number(e.target.value))}>
              {OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {timeLabel(o)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Second sniff
            <select value={sniffB} onChange={(e) => onB(Number(e.target.value))}>
              {OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {timeLabel(o)}
                </option>
              ))}
            </select>
          </label>
          <button className="ghost-button" onClick={() => onShow(sniffA)}>
            Show first on map
          </button>
          <button className="ghost-button" onClick={() => onShow(sniffB)}>
            Show second on map
          </button>
        </div>
      </div>
      <p className="compare-summary">{cmp.summary}</p>
      {cmp.changes.length === 0 ? (
        <p className="muted">No molecule changed by more than the difference threshold (about 28%).</p>
      ) : (
        <div className="change-groups">
          {kinds
            .filter((k) => cmp.changes.some((c) => c.kind === k))
            .map((k) => (
              <div key={k} className={`change-group kind-${k}`}>
                <h3>{KIND_TITLE[k]}</h3>
                <ul>
                  {cmp.changes
                    .filter((c) => c.kind === k)
                    .map((c) => (
                      <li key={c.id}>
                        <div className="change-line">
                          <span className="change-name">{MOLECULE_BY_ID[c.id].name}</span>
                          <span className="change-shares">
                            {pct(c.shareA)} → {pct(c.shareB)}
                          </span>
                        </div>
                        <p className="change-reason">{c.reason}</p>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
      <p className="muted small">
        Comparing {timeLabel(a)} → {timeLabel(b)}. A change is counted when a share grows or shrinks by more than
        28% (the odor difference threshold), or when a molecule crosses the recognition threshold.
      </p>
    </div>
  )
}
