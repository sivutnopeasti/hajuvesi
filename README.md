# Hajuvesi – molekyylikartta

Työkalu hajuvesien tekijöille: näe molekyylitasolla, miten tuoksu muuttuu iholla tai paperilla ajan kuluessa ja miksi. Siirrä aikaa, ja kartta näyttää, mitkä molekyylit haihtuvat, mitkä nousevat esiin ja mikä muuttui kahden haistohetken välillä.

Sivu: https://sivutnopeasti.github.io/hajuvesi/

> Kehitysversio. Molekyylikirjasto (noin 220 tuoksumolekyyliä) haetaan automaattisesti PubChemistä ja Pyrfumesta. Luonnonraaka-aineita on vielä vähän. Osa höyrynpaineista ja hajukynnyksistä on arvioita (merkitty ≈), joten tulokset ovat suuntaa-antavia.

## Miten se toimii

1. **Resepti → molekyylit.** Raaka-aineet puretaan molekyyleiksi tyypillisen koostumuksen mukaan.
2. **Haihtuminen.** Jokainen molekyyli haihtuu höyrynpaineensa ja mooliosuutensa mukaan (Raoultin laki). Iho 32 °C, paperi 22 °C.
3. **Havaitseminen.** Pitoisuus ilmassa jaetaan hajukynnyksellä (odor value). Voimakkuus kasvaa Stevensin lain mukaan, ja kartalla näkyy kunkin molekyylin osuus.
4. **Vertailu.** Kahden haistohetken välillä näytetään, mikä katosi, heikkeni tai nousi esiin, ja miksi.

Tarkemmin: [docs/taustatutkimus.md](docs/taustatutkimus.md) ja [docs/tekniset-paatokset.md](docs/tekniset-paatokset.md).

## Kehitys

```bash
npm install
npm run dev      # paikallinen kehityspalvelin
npm test         # simulaation testit Python-prototyyppiä vasten
npm run build    # tuotantoversio kansioon dist/
```

Vaatii Node.js 22 tai uudemman.

## Rakenne

| Polku | Sisältö |
| --- | --- |
| `src/data/` | Molekyylikirjasto, raaka-aineiden koostumukset, hajuperheet |
| `scripts/etl/` | Molekyylidatan haku (Python) |
| `src/sim/engine.ts` | Haihtumis- ja havaintomalli |
| `src/sim/explain.ts` | Haistohetkien vertailu ja syykoodit |
| `src/sim/worker.ts` | Simulaatio Web Workerissa |
| `src/components/` | Kartta, aikajana, vertailu, resepti, taulukko |
| `tests/` | Testit (Node.js:n oma testiajuri) |
| `prototype/` | Alkuperäinen Python-prototyyppi |
| `docs/` | Taustatutkimus ja tekniset päätökset |

## Julkaisu

Jokainen push `main`-haaraan rakentaa sivun ja julkaisee sen `gh-pages`-haaraan (`.github/workflows/deploy.yml`). GitHub Pagesin lähteeksi asetetaan repon asetuksissa **Settings → Pages → Deploy from a branch → `gh-pages` / root**.

## Molekyylidata

Sivu ei kutsu ulkoisia rajapintoja. Molekyylien tiedot haetaan GitHub Actionsissa ja tallennetaan repoon tiedostoon `src/data/generated/molecules.json`.

| Tiedosto | Tehtävä |
| --- | --- |
| `scripts/etl/seed_molecules.csv` | Haettavat molekyylit: tunniste, suomenkielinen nimi, PubChem-hakunimi (vaihtoehdot `\|`-merkillä), hajuperhe, lyhyt kuvaus |
| `scripts/etl/build_molecules.py` | Hakee PubChemistä rakenteen, MW:n, CAS-numeron, kokeellisen höyrynpaineen, kiehumispisteen ja hajukynnyksen sekä Pyrfumesta Abraham 2012 -hajukynnykset |
| `scripts/etl/report.md` | Ajon raportti: mitä ei löytynyt, mitkä arvot ovat arvioita ja PubChemin tunnistukset tarkistettavaksi |
| `src/data/molecules.ts` | Yhdistää generoidun datan, käsin kuratoidut arvot (lähteineen) ja demodatan |

**Molekyylin lisääminen:** lisää rivi `seed_molecules.csv`-tiedostoon ja tee commit. Työnkulku *Päivitä molekyylidata* käynnistyy, hakee tiedot, tallentaa ne repoon ja julkaisee sivun. Ajon voi käynnistää myös käsin: Actions → Päivitä molekyylidata → Run workflow.

**Arvojen valinta:**
- Höyrynpaine: PubChemin kokeelliset arvot 15–35 °C:ssa korjattuna 25 °C:een; useasta lähteestä mediaani ja vaihteluväli. Jos mitattua arvoa ei ole, arvio kiehumispisteestä (modifioitu Grain–Watson), merkitty arvioksi.
- Hajukynnys: Abraham ym. 2012 (Pyrfume), muuten PubChemin ilman hajukynnykset; jos kumpaakaan ei ole, kemiallisen ryhmän mediaani, merkitty arvioksi.
- Kemiallinen ryhmä päätellään rakenteesta RDKitillä.

Jos käytössä on EPA:n CTX API -avain, se lisätään repon salaisuudeksi (Settings → Secrets) eikä koskaan tiedostoihin.
