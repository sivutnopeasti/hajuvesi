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
import { DEFAULT_RECIPE } from './data/materials.ts'
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
    /* tallennus ei käytettävissä */
  }
  return DEFAULT_RECIPE
}

function saveRecipe(recipe: RecipeLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe))
  } catch {
    /* tallennus ei käytettävissä */
  }
}

export default function App() {
  const [recipe, setRecipeState] = useState<RecipeLine[]>(loadRecipe)
  const [mode, setMode] = useState<Mode>('iho')
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
        <section className="hero" id="kartta" aria-labelledby="hero-title">
          <div className="hero-text">
            <h1 id="hero-title">Mitä tuoksussasi tapahtuu puolen tunnin kohdalla?</h1>
            <p className="lede">
              Siirrä aikaa ja katso, mitkä molekyylit haihtuvat ja mitkä nousevat esiin. Kuplan koko on
              jäljellä oleva määrä, täyttö kertoo, tunnistaako nenä sen.
            </p>
          </div>
          <div className="mode-switch" role="radiogroup" aria-label="Pinta">
            {(['iho', 'paperi'] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? 'is-active' : ''}
                onClick={() => setMode(m)}
              >
                {m === 'iho' ? 'Iho, 32 °C' : 'Paperi, 22 °C'}
              </button>
            ))}
          </div>
        </section>

        <p className="demo-note">
          Kehitysversio: 13 molekyyliä ja 4 luonnonraaka-ainetta. Arvioidut arvot on merkitty ≈-merkillä,
          ja tulokset ovat suuntaa-antavia.
        </p>

        <TimeScrubber timeMin={timeMin} onChange={setTimeMin} sniffA={sniffA} sniffB={sniffB} />

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
              <div className="loading">Lasketaan…</div>
            )}
            <div className="map-controls">
              <span id="colorby-label">Väritys</span>
              <div className="segmented" role="radiogroup" aria-labelledby="colorby-label">
                <button
                  role="radio"
                  aria-checked={colorBy === 'family'}
                  className={colorBy === 'family' ? 'is-active' : ''}
                  onClick={() => setColorBy('family')}
                >
                  Hajuperhe
                </button>
                <button
                  role="radio"
                  aria-checked={colorBy === 'group'}
                  className={colorBy === 'group' ? 'is-active' : ''}
                  onClick={() => setColorBy('group')}
                >
                  Kemiallinen ryhmä
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
          <Timeline result={result} timeMin={timeMin} sniffA={sniffA} sniffB={sniffB} onTime={setTimeMin} />
        )}

        <section className="section" id="vertailu" aria-labelledby="compare-title">
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

        <section className="section recipe-section" id="resepti" aria-labelledby="recipe-title">
          <RecipeEditor recipe={recipe} onChange={setRecipe} dose={dose} onDose={setDose} />
          {result && <MoleculeTable result={result} j={j} timeMin={timeMin} onSelect={setSelectedId} />}
        </section>

        <About />
      </main>
      <footer className="footer">
        <p>
          Malli: monikomponenttinen haihtuminen (Raoultin laki) ja odor value -havaintomalli. Lähteet ja
          rajoitteet on kuvattu kohdassa Tausta.
        </p>
      </footer>
    </>
  )
}
