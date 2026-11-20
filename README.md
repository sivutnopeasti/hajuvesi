# Hajuvesi – molekyylikartta

Työkalu hajuvesien tekijöille: näe molekyylitasolla, miten tuoksu muuttuu iholla tai paperilla ajan kuluessa ja miksi. Siirrä aikaa, ja kartta näyttää, mitkä molekyylit haihtuvat, mitkä nousevat esiin ja mikä muuttui kahden haistohetken välillä.

Sivu: https://sivutnopeasti.github.io/hajuvesi/

> Kehitysversio. Kirjastossa on 13 molekyyliä ja 4 luonnonraaka-ainetta prototyypin datalla. Osa höyrynpaineista ja hajukynnyksistä on arvioita (merkitty ≈), joten tulokset ovat suuntaa-antavia.

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
| `src/data/` | Molekyylit lähteineen, raaka-aineiden koostumukset, hajuperheet |
| `src/sim/engine.ts` | Haihtumis- ja havaintomalli |
| `src/sim/explain.ts` | Haistohetkien vertailu ja syykoodit |
| `src/sim/worker.ts` | Simulaatio Web Workerissa |
| `src/components/` | Kartta, aikajana, vertailu, resepti, taulukko |
| `tests/` | Testit (Node.js:n oma testiajuri) |
| `prototype/` | Alkuperäinen Python-prototyyppi |
| `docs/` | Taustatutkimus ja tekniset päätökset |

## Julkaisu

Jokainen push `main`-haaraan rakentaa sivun ja julkaisee sen `gh-pages`-haaraan (`.github/workflows/deploy.yml`). GitHub Pagesin lähteeksi asetetaan repon asetuksissa **Settings → Pages → Deploy from a branch → `gh-pages` / root**.

## Data ja API-avaimet

Datan haku ulkoisista lähteistä (PubChem, EPA CompTox) tehdään erillisellä skriptillä, ei selaimessa. Jos käytössä on EPA:n CTX API -avain, se luetaan ympäristömuuttujasta eikä sitä koskaan tallenneta repoon.
