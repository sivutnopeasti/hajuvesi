import { useEffect, useRef, useState } from 'react'
import type { RecipeLine, SimParams, SimResult } from './types.ts'

/** Ajaa simulaation Web Workerissa aina, kun resepti tai parametrit muuttuvat. */
export function useSimulation(recipe: RecipeLine[], params: SimParams): SimResult | null {
  const [result, setResult] = useState<SimResult | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result: SimResult }>) => {
      if (e.data.id === reqId.current) setResult(e.data.result)
    }
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      reqId.current += 1
      workerRef.current?.postMessage({ id: reqId.current, recipe, params })
    }, 120)
    return () => window.clearTimeout(handle)
  }, [recipe, params])

  return result
}
