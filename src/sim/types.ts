/** Arvon alkuperä: koe = vertaisarvioitu mittaus, ennuste = QSAR-malli, arvio = karkea arvio. */
export type Method = 'koe' | 'ennuste' | 'arvio'

export type FamilyId = 'alkoholi' | 'sitrus' | 'havu' | 'kukka' | 'puu' | 'balsami' | 'haihtumaton'

export type GroupId =
  | 'liuotin'
  | 'monoterpeeni'
  | 'terpeenialkoholi'
  | 'esteri'
  | 'oksidi-ketoni'
  | 'seskviterpeeni'
  | 'seskviterpeenialkoholi'
  | 'aromaattinen'
  | 'haihtumaton'

export interface SourcedValue {
  value: number
  method: Method
  source: string
}

export interface Molecule {
  id: string
  name: string
  cas?: string
  /** Molekyylipaino, g/mol */
  mw: number
  /** Höyrynpaine 25 °C:ssa, mmHg (0 = haihtumaton) */
  vp25: SourcedValue
  /** Höyrystymislämpö, kJ/mol (lämpötilakorjausta varten) */
  dHvap: number
  /** Hajun havaitsemiskynnys ilmassa, ppm (v/v) */
  odt: SourcedValue
  family: FamilyId
  group: GroupId
  /** Lyhyt hajukuvaus omin sanoin */
  odor: string
  /** Stevensin eksponentti (oletus 0,5) */
  stevens?: number
}

export interface Material {
  id: string
  name: string
  kind: 'öljy' | 'resinoidi' | 'eriste' | 'liuotin'
  /** Koostumus massaprosentteina (molekyyli-id → %) */
  composition: Record<string, number>
  note?: string
}

export interface RecipeLine {
  materialId: string
  grams: number
}

export type Mode = 'iho' | 'paperi'

export interface SimParams {
  mode: Mode
  /** Levitetty määrä, mg/cm² */
  doseMgCm2: number
  /** Aineensiirtokerroin etanolille tyynessä ilmassa, m/s (kalibroitava) */
  kRef: number
  /** Laimennuskerroin pinnan höyryfaasista nenään (kalibroitava) */
  phi: number
  /** Tunnistuskynnys hajukynnyksen monikertana */
  recognitionFactor: number
  /** Loppuaika minuutteina */
  tEndMin: number
}

export interface SimResult {
  /** Ajanhetket minuutteina */
  times: number[]
  moleculeIds: string[]
  /** Alkumassa mg/cm² per molekyyli */
  initialMass: number[]
  /** [molekyyli][aika] jäljellä oleva osuus 0–1 */
  remaining: number[][]
  /** [molekyyli][aika] odor value */
  ov: number[][]
  /** [molekyyli][aika] osuus havaitusta voimakkuudesta 0–1 */
  share: number[][]
  /** Aika (min), jossa 90 % molekyylistä on haihtunut; null = ei simulaation aikana */
  t90: (number | null)[]
  params: SimParams
}
