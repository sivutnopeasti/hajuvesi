import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials.ts'
import { MOLECULE_BY_ID } from '../data/molecules.ts'
import { buildIndex, search, type SearchEntry, type SearchHit } from '../lib/search.ts'
import type { Material } from '../sim/types.ts'

const GROUPS: { label: string; kinds: Material['kind'][] }[] = [
  { label: 'Oils and resinoids', kinds: ['oil', 'resinoid'] },
  { label: 'Solvents', kinds: ['solvent'] },
  { label: 'Isolates and synthetics', kinds: ['isolate'] },
]
/** Ilman hakua näytetään kustakin ryhmästä enintään näin monta, jotta lista pysyy kevyenä. */
const BROWSE_LIMIT = 60
const RESULT_LIMIT = 80

let INDEX: SearchEntry[] | null = null
const getIndex = () => (INDEX ??= buildIndex(MATERIALS, MOLECULE_BY_ID))

interface Props {
  id: string
  label: string
  value: string
  onChange: (materialId: string) => void
}

interface Section {
  label: string
  hits: SearchHit[]
  total: number
  /** Ensimmäisen osuman järjestysnumero koko listassa (näppäimistöliikettä varten) */
  start: number
}

export function MaterialPicker({ id, label, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const sections: Section[] = useMemo(() => {
    if (!open) return []
    const index = getIndex()
    if (query.trim()) {
      const hits = search(index, query, RESULT_LIMIT)
      const label =
        hits.length === RESULT_LIMIT ? `Best ${RESULT_LIMIT} matches` : hits.length === 1 ? '1 match' : `${hits.length} matches`
      return [{ label: hits.length ? label : '', hits, total: hits.length, start: 0 }]
    }
    const groups = GROUPS.map((g) => {
      const all = index.filter((e) => g.kinds.includes(e.material.kind))
      return { label: g.label, hits: all.slice(0, BROWSE_LIMIT).map((entry) => ({ entry, score: 0 })), total: all.length }
    })
    return groups.map((g, i) => ({ ...g, start: groups.slice(0, i).reduce((n, x) => n + x.hits.length, 0) }))
  }, [open, query])

  const flat = useMemo(() => sections.flatMap((s) => s.hits), [sections])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
    popRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const openList = () => {
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (materialId: string) => {
    onChange(materialId)
    close(true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(flat.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[active]
      if (hit) choose(hit.entry.material.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const current = MATERIAL_BY_ID[value]
  const optionId = (k: number) => `${listId}-opt-${k}`

  return (
    <div className="picker" ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.name ?? 'none'}`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            openList()
          }
        }}
      >
        <span className="picker-value">{current?.name ?? 'Choose a material'}</span>
        <span className="picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="picker-pop" ref={popRef}>
          <input
            ref={inputRef}
            className="picker-search"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? optionId(active) : undefined}
            aria-label="Search materials by name, trade name, CAS number or odor"
            placeholder="Search name, trade name, CAS or odor"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="picker-list" id={listId} role="listbox" aria-label={label} ref={listRef}>
            {flat.length === 0 && (
              <li className="picker-empty" role="presentation">
                Nothing matches “{query.trim()}”. Try another name, a CAS number or an odor such as “jasmine”.
              </li>
            )}
            {sections.map((s) =>
              s.hits.length === 0 ? null : (
                <li key={s.label} role="presentation" className="picker-section">
                  {s.label && <div className="picker-section-label">{s.label}</div>}
                  <ul role="presentation">
                    {s.hits.map((hit, n) => {
                      const idx = s.start + n
                      const m = hit.entry.material
                      const meta = [hit.matched && `also ${hit.matched}`, hit.entry.odor].filter(Boolean).join('; ')
                      return (
                        <li
                          key={m.id}
                          id={optionId(idx)}
                          data-index={idx}
                          role="option"
                          aria-selected={m.id === value}
                          className={`picker-option${idx === active ? ' is-active' : ''}${m.id === value ? ' is-current' : ''}`}
                          onPointerMove={() => idx !== active && setActive(idx)}
                          onClick={() => choose(m.id)}
                        >
                          <span className="picker-name">{m.name}</span>
                          {meta && <span className="picker-meta">{meta}</span>}
                        </li>
                      )
                    })}
                  </ul>
                  {s.total > s.hits.length && (
                    <div className="picker-more">
                      {s.total - s.hits.length} more; type to search all {s.total.toLocaleString('en-US')}
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
