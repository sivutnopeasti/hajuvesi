import type { Material, Molecule } from '../sim/types.ts'

const GREEK: Record<string, string> = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ω: 'omega' }

/** Pienet kirjaimet, ei aksentteja, kreikkalaiset kirjaimet sanoina, välimerkit välilyönneiksi. */
export function normalize(s: string): string {
  return s
    .replace(/[αβγδεω]/g, (c) => ` ${GREEK[c]} `)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface SearchEntry {
  material: Material
  name: string
  synonyms: string[]
  synonymsNorm: string[]
  cas: string
  odor: string
  odorNorm: string
  /** Ensimmäinen hajukuvaaja, esim. "floral" */
  odorFirst: string
}

export interface SearchHit {
  entry: SearchEntry
  score: number
  /** Synonyymi, jonka perusteella osuma löytyi (näytetään nimen alla) */
  matched?: string
}

export function buildIndex(materials: Material[], molecules: Record<string, Molecule>): SearchEntry[] {
  return materials.map((material) => {
    const ids = Object.keys(material.composition)
    const single = ids.length === 1 ? molecules[ids[0]] : undefined
    const synonyms = single?.synonyms ?? []
    const odor = single?.odor ?? ''
    return {
      material,
      name: normalize(material.name),
      synonyms,
      synonymsNorm: synonyms.map(normalize),
      cas: single?.cas ?? '',
      odor,
      odorNorm: normalize(odor),
      odorFirst: normalize(odor.split(',')[0] ?? ''),
    }
  })
}

const hasAll = (hay: string, tokens: string[]) => tokens.every((t) => hay.includes(t))

/**
 * Pisteet (pienempi parempi): 0 nimi alkaa hakusanalla, 1 jokin nimen sana alkaa sillä,
 * 2 kaikki sanat nimessä, 3 synonyymissä, 4 CAS-numero, 5 ensimmäisessä hajukuvaajassa, 6 muissa kuvaajissa.
 */
export function search(index: SearchEntry[], query: string, limit = 100): SearchHit[] {
  const q = normalize(query)
  if (!q) return []
  const tokens = q.split(' ')
  const casQuery = query.trim().replace(/\s+/g, '')
  const hits: SearchHit[] = []
  for (const entry of index) {
    let score = -1
    let matched: string | undefined
    if (entry.name.startsWith(q)) score = 0
    else if (hasAll(entry.name, tokens)) score = ` ${entry.name}`.includes(` ${tokens[0]}`) ? 1 : 2
    else {
      const k = entry.synonymsNorm.findIndex((s) => hasAll(s, tokens))
      if (k >= 0) {
        score = 3
        matched = entry.synonyms[k]
      } else if (/^\d+-?\d*-?\d*$/.test(casQuery) && casQuery.length >= 3 && entry.cas.startsWith(casQuery)) {
        score = 4
      } else if (hasAll(entry.odorNorm, tokens)) score = hasAll(entry.odorFirst, tokens) ? 5 : 6
    }
    if (score >= 0) hits.push({ entry, score, matched })
  }
  hits.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.material.name.length - b.entry.material.name.length ||
      a.entry.material.name.localeCompare(b.entry.material.name, 'en'),
  )
  return hits.slice(0, limit)
}
