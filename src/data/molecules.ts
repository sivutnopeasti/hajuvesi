import generated from './generated/molecules.json' with { type: 'json' }
import type { FamilyId, GroupId, Method, Molecule, SourcedValue } from '../sim/types.ts'
import { DEMO_BY_ID, DEMO_MOLECULES } from './demo.ts'

/** ETL:n (scripts/etl/build_molecules.py) tuottama rivi. */
interface GeneratedMolecule {
  id: string
  name: string
  cid: number
  cas: string | null
  formula: string | null
  smiles: string | null
  mw: number
  xlogp: number | null
  tbC: number | null
  vp25: (SourcedValue & { method: Method }) | null
  dHvap: number
  odt: (SourcedValue & { method: Method }) | null
  family: FamilyId
  group: GroupId
  odor: string
  odorEn: string | null
}

interface GeneratedFile {
  generatedAt: string | null
  sources: string[]
  molecules: GeneratedMolecule[]
}

export const GENERATED = generated as unknown as GeneratedFile

/**
 * Käsin kuratoidut arvot, jotka ovat parempia kuin automaattisesti haetut.
 * Jokaiselle arvolle lähde.
 */
const OVERRIDES: Record<string, Partial<Molecule>> = {
  patsulioli: { odt: { value: 4.4e-7, method: 'koe', source: 'Park 2012 (0,44 ppt), UCSD' } },
}

/** Molekyylit, joita ei ole PubChemissä yhtenä yhdisteenä (seokset ja haihtumaton jäännös). */
const PSEUDO_IDS = ['seskviterpeenit', 'hartsi']

function fromGenerated(g: GeneratedMolecule): Molecule {
  const vp25: SourcedValue = g.vp25 ?? {
    value: 0,
    method: 'arvio',
    source: 'Ei höyrynpainetta eikä kiehumispistettä – käsitellään haihtumattomana',
  }
  const odt: SourcedValue = g.odt ?? { value: Number.POSITIVE_INFINITY, method: 'arvio', source: 'Ei hajukynnystä' }
  return {
    id: g.id,
    name: g.name,
    cas: g.cas ?? undefined,
    cid: g.cid,
    formula: g.formula ?? undefined,
    smiles: g.smiles ?? undefined,
    mw: g.mw,
    xlogp: g.xlogp,
    tbC: g.tbC,
    vp25,
    dHvap: g.dHvap,
    odt,
    family: g.family,
    group: g.group,
    odor: g.odor,
    odorEn: g.odorEn,
  }
}

function buildLibrary(): Molecule[] {
  const out = new Map<string, Molecule>()
  for (const g of GENERATED.molecules) out.set(g.id, fromGenerated(g))
  // Varalle: demon molekyylit, joita generoitu data ei (vielä) sisällä
  for (const m of DEMO_MOLECULES) if (!out.has(m.id)) out.set(m.id, m)
  for (const id of PSEUDO_IDS) out.set(id, DEMO_BY_ID[id])
  for (const [id, patch] of Object.entries(OVERRIDES)) {
    const m = out.get(id)
    if (m) out.set(id, { ...m, ...patch })
  }
  return [...out.values()]
}

export const MOLECULES: Molecule[] = buildLibrary()

export const MOLECULE_BY_ID: Record<string, Molecule> = Object.fromEntries(MOLECULES.map((m) => [m.id, m]))
