const REPO = 'https://github.com/sivutnopeasti/hajuvesi/blob/main'

export function About() {
  return (
    <section className="section about" id="tausta" aria-labelledby="about-title">
      <h2 id="about-title">Miten kartta lasketaan</h2>
      <div className="about-cols">
        <div>
          <h3>Haihtuminen</h3>
          <p>
            Jokainen molekyyli haihtuu sitä nopeammin, mitä korkeampi sen höyrynpaine on ja mitä suurempi osa
            jäljellä olevasta seoksesta se on (Raoultin laki). Iho on noin 32 °C ja paperi huoneenlämpöinen, joten
            sama seos kehittyy iholla noin kaksi kertaa nopeammin.
          </p>
          <p>
            Raskaat ja haihtumattomat aineet, kuten resinoidien hartsi, laimentavat kevyitä molekyylejä ja
            hidastavat niiden haihtumista. Tämä on fiksatiivien vaikutuksen perusmekanismi.
          </p>
        </div>
        <div>
          <h3>Havaitseminen</h3>
          <p>
            Molekyyli haistetaan, kun sen pitoisuus ilmassa ylittää hajukynnyksen. Tunnistuskynnykseksi oletetaan
            kolminkertainen hajukynnys, ja voimakkuus kasvaa pitoisuuden neliöjuuren tavoin.
          </p>
          <p>
            Hajukynnykset ovat mallin epävarmin osa: saman molekyylin arvot vaihtelevat lähteestä riippuen jopa
            satakertaisesti. Siksi tulokset ovat suuntaa-antavia.
          </p>
        </div>
        <div>
          <h3>Lue lisää</h3>
          <ul className="link-list">
            <li>
              <a href={`${REPO}/docs/taustatutkimus.md`}>Taustatutkimus: datalähteet ja algoritmi</a>
            </li>
            <li>
              <a href={`${REPO}/docs/tekniset-paatokset.md`}>Tekniset päätökset</a>
            </li>
            <li>
              <a href={`${REPO}/prototype/evap_proto.py`}>Python-prototyyppi</a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
