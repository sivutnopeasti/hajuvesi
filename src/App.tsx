import { useMemo, useState } from 'react'
import { About } from './components/About.tsx'
import { ComparePanel } from './components/ComparePanel.tsx'
import { Header } from './components/Header.tsx'
import { MoleculeMap } from './components/MoleculeMap.tsx'
import { MoleculeTable } from './components/MoleculeTable.tsx'
import { NowPanel } from './components/NowPanel.tsx'
import { RecipeEditor } from './components/RecipeEditor.tsx'
import { Timeline } from './components/Timeline.tsx'
import { TimeScrubber } from './components/TimeScrubber.tsx'
import { DEFAULT_RECIPE, OILS } from './data/materials.ts'
import { GENERATED, MOLECULES } from './data/molecules.ts'
import { DEFAULT_PARAMS, indexAt } from './sim/engine.ts'
import type { Mode, RecipeLine, SimParams } from './sim/types.ts'
import { useSimulation } from './sim/useSimulation.ts'

export type ColorBy = 'family' | 'group'

const STORAGE_KEY = 'hajuvesi.recipe.v1'

function loadRecipe(): RecipeLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RecipeLine[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* storage not available */
  }
  return DEFAULT_RECIPE
}

function saveRecipe(recipe: RecipeLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe))
  } catch {
    /* storage not available */
  }
}

export default function App() {
  const [recipe, setRecipeState] = useState<RecipeLine[]>(loadRecipe)
  const [mode, setMode] = useState<Mode>('skin')
  const [dose, setDose] = useState(DEFAULT_PARAMS.doseMgCm2)
  const [timeMin, setTimeMin] = useState(30)
  const [sniffA, setSniffA] = useState(10)
  const [sniffB, setSniffB] = useState(30)
  const [colorBy, setColorBy] = useState<ColorBy>('family')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const setRecipe = (r: RecipeLine[]) => {
    setRecipeState(r)
    saveRecipe(r)
  }

  const params: SimParams = useMemo(() => ({ ...DEFAULT_PARAMS, mode, doseMgCm2: dose }), [mode, dose])
  const result = useSimulation(recipe, params)
  const j = result ? indexAt(result.times, timeMin) : 0

  return (
    <>
      <Header />
      <main>
        <section className="hero" id="map" aria-labelledby="hero-title">
          <div className="hero-text">
            <h1 id="hero-title">What happens to your scent at the half-hour mark?</h1>
            <p className="lede">
              Move through time and see which molecules evaporate and which come forward. Bubble size is the
              amount left; the fill shows whether the nose can recognize it.
            </p>
          </div>
          <div className="mode-switch" role="radiogroup" aria-label="Surface">
            {(['skin', 'paper'] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? 'is-active' : ''}
                onClick={() => setMode(m)}
              >
                {m === 'skin' ? 'Skin, 32 °C' : 'Paper, 22 °C'}
              </button>
            ))}
          </div>
        </section>

        <p className="demo-note">
          Development version: the library has {MOLECULES.length} molecules and {OILS.length} natural materials
          {GENERATED.generatedAt
            ? ` (data fetched ${new Date(GENERATED.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`
            : ''}
          . Estimated values are marked with ≈, and the results are indicative.
        </p>

        <TimeScrubber timeMin={timeMin} onChange={setTimeMin} />

        <div className="map-layout">
          <div className="map-wrap">
            {result ? (
              <MoleculeMap
                result={result}
                j={j}
                colorBy={colorBy}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : (
              <div className="loading">Calculating…</div>
            )}
            <div className="map-controls">
              <span id="colorby-label">Color by</span>
              <div className="segmented" role="radiogroup" aria-labelledby="colorby-label">
                <button
                  role="radio"
                  aria-checked={colorBy === 'family'}
                  className={colorBy === 'family' ? 'is-active' : ''}
                  onClick={() => setColorBy('family')}
                >
                  Odor family
                </button>
                <button
                  role="radio"
                  aria-checked={colorBy === 'group'}
                  className={colorBy === 'group' ? 'is-active' : ''}
                  onClick={() => setColorBy('group')}
                >
                  Chemical group
                </button>
              </div>
            </div>
          </div>
          <aside className="side">
            {result && (
              <NowPanel
                result={result}
                j={j}
                timeMin={timeMin}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </aside>
        </div>

        {result && (
          <Timeline result={result} timeMin={timeMin} onTime={setTimeMin} />
        )}

        <section className="section" id="compare" aria-labelledby="compare-title">
          {result && (
            <ComparePanel
              result={result}
              sniffA={sniffA}
              sniffB={sniffB}
              onA={setSniffA}
              onB={setSniffB}
              onShow={setTimeMin}
            />
          )}
        </section>

        <section className="section recipe-section" id="formula" aria-labelledby="recipe-title">
          <RecipeEditor recipe={recipe} onChange={setRecipe} dose={dose} onDose={setDose} />
          {result && <MoleculeTable result={result} j={j} timeMin={timeMin} onSelect={setSelectedId} />}
        </section>

        <About />
      </main>
      <footer className="footer">
        <p>
          Model: multicomponent evaporation (Raoult’s law) and an odor-value perception model. Sources and
          limitations are described under About.
        </p>
      </footer>
    </>
  )
}
