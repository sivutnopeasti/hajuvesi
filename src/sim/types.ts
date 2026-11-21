/** Origin of a value: measured = peer-reviewed measurement, predicted = QSAR model, estimate = rough estimate. */
export type Method = 'measured' | 'predicted' | 'estimate'

export type FamilyId =
  | 'alkoholi'
  | 'sitrus'
  | 'havu'
  | 'vihrea'
  | 'kukka'
  | 'hedelma'
  | 'mauste'
  | 'balsami'
  | 'puu'
  | 'myski'
  | 'haihtumaton'

export type GroupId =
  | 'liuotin'
  | 'monoterpeeni'
  | 'seskviterpeeni'
  | 'hiilivety'
  | 'aromaattinen'
  | 'terpeenialkoholi'
  | 'seskviterpeenialkoholi'
  | 'alkoholi'
  | 'aldehydi'
  | 'ketoni'
  | 'esteri'
  | 'laktoni'
  | 'fenoli'
  | 'eetteri-oksidi'
  | 'happo'
  | 'typpi-rikki'
  | 'muu'
  | 'haihtumaton'

export interface SourcedValue {
  value: number
  method: Method
  source: string
  /** Pienin ja suurin lähteiden arvo, kun niitä on useita */
  min?: number
  max?: number
  /** Lähdearvojen määrä */
  n?: number
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
  cid?: number
  smiles?: string
  formula?: string
  /** Normaalikiehumispiste, °C */
  tbC?: number | null
  xlogp?: number | null
  /** PubChemin hajukuvaus englanniksi */
  odorEn?: string | null
}

export interface Material {
  id: string
  name: string
  kind: 'oil' | 'resinoid' | 'isolate' | 'solvent'
  /** Koostumus massaprosentteina (molekyyli-id → %) */
  composition: Record<string, number>
  note?: string
}

export interface RecipeLine {
  materialId: string
  grams: number
}

export type Mode = 'skin' | 'paper'

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
