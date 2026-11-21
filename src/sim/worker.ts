/// <reference lib="webworker" />
import { simulate, type Library } from './engine.ts'
import type { RecipeLine, SimParams } from './types.ts'

export interface WorkerRequest {
  id: number
  recipe: RecipeLine[]
  params: SimParams
  lib: Library
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, recipe, params, lib } = e.data
  const result = simulate(recipe, params, lib)
  ;(self as unknown as Worker).postMessage({ id, result })
}
