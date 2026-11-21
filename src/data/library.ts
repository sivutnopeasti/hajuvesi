import type { Library } from '../sim/engine.ts'
import type { Material, Molecule, RecipeLine } from '../sim/types.ts'
import { MATERIAL_BY_ID } from './materials.ts'
import { MOLECULE_BY_ID } from './molecules.ts'

/** Vain reseptin tarvitsemat raaka-aineet ja molekyylit, jotta Web Worker ei lataa koko kirjastoa. */
export function libraryFor(recipe: RecipeLine[]): Library {
  const materials: Record<string, Material> = {}
  const molecules: Record<string, Molecule> = {}
  for (const line of recipe) {
    const mat = MATERIAL_BY_ID[line.materialId]
    if (!mat) continue
    materials[mat.id] = mat
    for (const id of Object.keys(mat.composition)) {
      const m = MOLECULE_BY_ID[id]
      if (m) molecules[id] = m
    }
  }
  return { materials, molecules }
}
