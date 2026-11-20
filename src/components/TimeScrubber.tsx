import { timeLabel, timeParts } from '../lib/format.ts'

const T_MIN = 0.5
const T_MAX = 24 * 60
const STEPS = 1000
const PRESETS = [1, 10, 30, 60, 180, 480]

const toSlider = (t: number) =>
  Math.round(((Math.log10(t) - Math.log10(T_MIN)) / (Math.log10(T_MAX) - Math.log10(T_MIN))) * STEPS)
const fromSlider = (v: number) =>
  10 ** (Math.log10(T_MIN) + (v / STEPS) * (Math.log10(T_MAX) - Math.log10(T_MIN)))

interface Props {
  timeMin: number
  onChange: (t: number) => void
  sniffA: number
  sniffB: number
}

export function TimeScrubber({ timeMin, onChange, sniffA, sniffB }: Props) {
  const [value, unit] = timeParts(timeMin)
  return (
    <div className="scrubber">
      <div className="scrubber-readout" aria-live="polite">
        <span className="readout-num">{value}</span>
        <span className="readout-unit">{unit}</span>
        <span className="readout-caption">levityksestä</span>
      </div>
      <div className="scrubber-track">
        <label htmlFor="time" className="visually-hidden">
          Aika levityksestä
        </label>
        <div className="slider-wrap">
          <input
            id="time"
            type="range"
            min={0}
            max={STEPS}
            value={toSlider(timeMin)}
            onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
            aria-valuetext={timeLabel(timeMin)}
          />
          {[
            { t: sniffA, k: 'A' },
            { t: sniffB, k: 'B' },
          ].map((s) => (
            <span
              key={s.k}
              className="sniff-mark"
              style={{ left: `${(toSlider(s.t) / STEPS) * 100}%` }}
              title={`Haistohetki ${s.k}: ${timeLabel(s.t)}`}
            >
              {s.k}
            </span>
          ))}
        </div>
        <div className="presets" role="group" aria-label="Pikavalinnat">
          {PRESETS.map((p) => (
            <button
              key={p}
              className={Math.abs(Math.log(timeMin / p)) < 0.02 ? 'is-active' : ''}
              onClick={() => onChange(p)}
            >
              {timeLabel(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
