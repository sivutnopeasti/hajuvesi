import { useLayoutEffect, useRef, useState } from 'react'

/** Elementin leveys CSS-pikseleinä; päivittyy kun leveys muuttuu. */
export function useWidth<T extends HTMLElement>(fallback = 820) {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
