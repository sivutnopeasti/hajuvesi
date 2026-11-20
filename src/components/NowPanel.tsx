import { FAMILY_BY_ID, GROUP_BY_ID } from '../data/families.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import { num, pct, timeLabel } from '../lib/format.ts'
import type { SimResult } from '../sim/types.ts'

interface Props {
  result: SimResult
  j: number
  timeMin: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function MoleculeCard({ result, j, id, onClose }: { result: SimResult; j: number; id: string; onClose: () => void }) {
  const i = result.moleculeIds.indexOf(id)
  const m = MOLECULE_BY_ID[id]
  if (i < 0 || !m) return null
  const t90 = result.t90[i]
  const recog = result.params.recognitionFactor
  const o = result.ov[i][j]
  return (
    <div className="card" aria-live="polite">
      <div className="card-head">
        <h3>{m.name}</h3>
        <button className="link-button" onClick={onClose}>
          Sulje
        </button>
      </div>
      <p className="card-odor">{m.odor}</p>
      {m.odorEn && <p className="card-odor-en">PubChem: {m.odorEn}</p>}
      <dl className="facts">
        <dt>Ryhmä</dt>
        <dd>{GROUP_BY_ID[m.group].name}</dd>
        {m.cas && (
          <>
            <dt>CAS</dt>
            <dd>
              {m.cid ? (
                <a href={`https://pubchem.ncbi.nlm.nih.gov/compound/${m.cid}`} target="_blank" rel="noreferrer">
                  {m.cas}
                </a>
              ) : (
                m.cas
              )}
            </dd>
          </>
        )}
        <dt>Molekyylipaino</dt>
        <dd>{num(m.mw, 3)} g/mol</dd>
        {m.tbC != null && (
          <>
            <dt>Kiehumispiste</dt>
            <dd>{Math.round(m.tbC)} °C</dd>
          </>
        )}
        <dt>Höyrynpaine 25 °C</dt>
        <dd title={m.vp25.source}>
          {m.vp25.method === 'koe' ? '' : '≈ '}
          {num(m.vp25.value)} mmHg
          {m.vp25.min !== undefined && m.vp25.max !== undefined && m.vp25.max / m.vp25.min > 1.2 && (
            <span className="src">
              lähteissä {num(m.vp25.min)}–{num(m.vp25.max)}
            </span>
          )}
          <span className="src">{m.vp25.source}</span>
        </dd>
        <dt>Hajukynnys</dt>
        <dd title={m.odt.source}>
          {Number.isFinite(m.odt.value) ? (
            <>
              {m.odt.method === 'koe' ? '' : '≈ '}
              {num(m.odt.value)} ppm
              {m.odt.min !== undefined && m.odt.max !== undefined && m.odt.max / m.odt.min > 1.2 && (
                <span className="src">
                  lähteissä {num(m.odt.min)}–{num(m.odt.max)}
                </span>
              )}
            </>
          ) : (
            'ei tiedossa'
          )}
          <span className="src">{m.odt.source}</span>
        </dd>
        <dt>Jäljellä nyt</dt>
        <dd>{pct(result.remaining[i][j])}</dd>
        <dt>Voimakkuus kynnykseen nähden</dt>
        <dd>
          {num(o)} × hajukynnys ({o >= recog ? 'tunnistettava' : o >= 1 ? 'havaittava' : 'ei havaittava'})
        </dd>
        <dt>90 % haihtunut</dt>
        <dd>{t90 === null ? 'yli 24 h' : timeLabel(t90)}</dd>
      </dl>
    </div>
  )
}

export function NowPanel({ result, j, timeMin, selectedId, onSelect }: Props) {
  const rows = result.moleculeIds
    .map((id, i) => ({ id, i, s: result.share[i][j], m: MOLECULE_BY_ID[id] }))
    .filter((r) => r.s >= 0.005)
    .sort((a, b) => b.s - a.s)

  return (
    <div className="now">
      {selectedId && <MoleculeCard result={result} j={j} id={selectedId} onClose={() => onSelect(null)} />}
      <h2 className="panel-title">Mitä haistat {timeLabel(timeMin)} kohdalla</h2>
      {rows.length === 0 ? (
        <p className="muted">Mikään molekyyli ei ylitä hajukynnystä tällä hetkellä.</p>
      ) : (
        <ol className="share-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className="share-row" onClick={() => onSelect(r.id)} aria-pressed={r.id === selectedId}>
                <span className="share-name">{r.m.name}</span>
                <span className="share-val">{pct(r.s)}</span>
                <span className="share-bar" aria-hidden="true">
                  <span style={{ width: `${r.s * 100}%`, background: FAMILY_BY_ID[r.m.family].color }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">
        Osuus havaitusta voimakkuudesta. Voimakkuus kasvaa hitaammin kuin pitoisuus (Stevensin laki), joten
        hyvin matalan hajukynnyksen aine voi hallita pienelläkin määrällä.
      </p>
    </div>
  )
}
