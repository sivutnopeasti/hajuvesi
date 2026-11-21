const REPO = 'https://github.com/sivutnopeasti/hajuvesi/blob/main'

export function About() {
  return (
    <section className="section about" id="about" aria-labelledby="about-title">
      <h2 id="about-title">How the map is calculated</h2>
      <div className="about-cols">
        <div>
          <h3>Evaporation</h3>
          <p>
            Each molecule evaporates faster the higher its vapor pressure and the larger its share of what is left
            of the blend (Raoult’s law). Skin is about 32 °C and paper is at room temperature, so the same blend
            develops roughly twice as fast on skin.
          </p>
          <p>
            Heavy and non-volatile materials, such as the resin in resinoids, dilute the light molecules and slow
            their evaporation. This is the basic mechanism behind fixatives.
          </p>
        </div>
        <div>
          <h3>Perception</h3>
          <p>
            A molecule is smelled when its concentration in the air exceeds its odor threshold. The recognition
            threshold is assumed to be three times the odor threshold, and intensity grows with the square root of
            concentration.
          </p>
          <p>
            Odor thresholds are the least certain part of the model: values for the same molecule can differ a
            hundredfold between sources. The results are therefore indicative.
          </p>
        </div>
        <div>
          <h3>Read more</h3>
          <ul className="link-list">
            <li>
              <a href={`${REPO}/docs/taustatutkimus.md`}>Background research: data sources and algorithm (Finnish)</a>
            </li>
            <li>
              <a href={`${REPO}/docs/tekniset-paatokset.md`}>Technical decisions (Finnish)</a>
            </li>
            <li>
              <a href={`${REPO}/prototype/evap_proto.py`}>Python prototype</a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
