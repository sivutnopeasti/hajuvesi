/// <reference lib="webworker" />
import { simulate } from './engine.ts'
import type { RecipeLine, SimParams } from './types.ts'

export interface WorkerRequest {
  id: number
  recipe: RecipeLine[]
  params: SimParams
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, recipe, params } = e.data
  const result = simulate(recipe, params)
  ;(self as unknown as Worker).postMessage({ id, result })
}
