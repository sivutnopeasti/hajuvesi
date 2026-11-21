const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

/** English number formatting; very small numbers as 1.2 × 10⁻⁴. */
export function num(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '–'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 0.01 && abs < 1e6) {
    return v.toLocaleString('en-US', { maximumSignificantDigits: digits + 1 })
  }
  const [mant, exp] = v.toExponential(digits - 1).split('e')
  const e = String(Number(exp))
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('')
  return `${mant} × 10${e}`
}

export function pct(v: number): string {
  if (v > 0 && v < 0.005) return '<1%'
  return `${Math.round(v * 100)}%`
}

/** Minutes to a readable time. */
export function timeLabel(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} s`
  if (min < 10) return `${(Math.round(min * 10) / 10).toLocaleString('en-US')} min`
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  if (h >= 10 || m === 0) return `${Math.round(min / 60)} h`
  return `${h} h ${m} min`
}

/** Large time readout: [number, unit] */
export function timeParts(min: number): [string, string] {
  if (min < 1) return [String(Math.round(min * 60)), 's']
  if (min < 60) return [min < 10 ? (Math.round(min * 10) / 10).toLocaleString('en-US') : String(Math.round(min)), 'min']
  return [(Math.round((min / 60) * 10) / 10).toLocaleString('en-US'), 'h']
}
