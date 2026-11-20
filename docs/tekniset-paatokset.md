# Hajuvesityökalu – tekniset päätökset (taustatutkimus 20.11.2026)

Täysi raportti: [taustatutkimus.md](taustatutkimus.md)

## Päätökset
- Data: oma versioitu molekyylitietokanta (ETL Pythonilla), ei suoria API-kutsuja selaimesta.
  - PubChem PUG REST/View: SMILES, MW, kokeellinen höyrynpaine (HSDB), hajukynnys.
  - EPA CompTox CTX API / OPERA: ennusteet puuttuviin arvoihin (merkitään "ennuste").
  - Pyrfume: Abraham 2012 -hajukynnykset (ppm v/v), Leffingwell/Good Scents -kuvaukset (lisenssirajoitukset!).
  - EssOilDB + käyttäjän GC-MS-PDF:t luonnonmateriaaleille; haihtumaton jäännös lisätään erikseen.
  - Jokaiselle arvolle: arvo, yksikkö, lämpötila, lähde, menetelmä (koe/ennuste/arvio), luotettavuus.
- ÄLÄ käytä Pythonin thermo/chemicals-kirjastoa tuoksumolekyylien höyrynpaineisiin: virhe 8–27x (linalooli 1,27 vs 0,16 mmHg).
- Tekniikka: Vite + React + TypeScript, simulaatio Web Workerissa, D3-asteikot + SVG, Zustand, staattinen hosting.
- Ulkoasu: valkoinen pohja, ohut musta yläpalkki, harvennettu antiikva + versaali-navigaatio, syvä indigo (~#2B2470) korostus.

## Algoritmi
Haihtuminen (molekyyli i, mol/m²):
  dn_i/dt = -k_g,i * gamma_i * x_i * Psat_i(T) / (R T) - k_abs,i * n_i,   x_i = n_i / sum(n)
  Psat(T) = Psat(25 °C) * exp(-dHvap/R * (1/T - 1/298.15))
  k_g,i = k_ref * (MW_i / MW_ref)^(-1/3)   (D ~ MW^-0.5, k ~ D^(2/3)); k_ref ≈ 1e-3 m/s tyynessä ilmassa (kalibroitu)
  Iho 32 °C (+ Kasting-imeytyminen), paperi 22 °C, huone = lähde + tasemalli dC/dt = J*A/V - ACH*C.
Havaitseminen:
  OV_i = c_i / ODT_i, c_i = phi * x_i * gamma_i * Psat_i / P_atm (phi kalibroitava)
  psi_i = OV_i^n (n oletus 0,5; kirjallisuus 0,13–0,72), osuus = psi_i / sum(psi)
  Tunnistuskynnys oletus 3 x ODT (Park 2012: 2–4x), erotuskynnys Weber ~0,28.
  Muutosselitys kahden haistohetken välillä: katosi / nousi esiin / syykoodit.

## Prototyypin tulokset (bergamotti 3 g, laventeli 2,5 g, patsuli 0,4 g, bentsoe 1,1 g, etanoli 21 g)
- 90 % haihtunut iholla / paperilla: limoneeni 14 / 27 min, linalooli 65 / 137 min, linalyyliasetaatti 85 / 174 min.
- 10 -> 30 min iholla: raikkaat + kukkaiset 27 % -> 13 %, patsuli 73 % -> 87 %.
- Herkkyys: patsulin ODT x100 -> osuus 30 min kohdalla 39 %, x1000 -> 17 %. Hajukynnys on suurin epävarmuus.

## Avoimet asiat
- IFRA 52. muutoksen notifikaatio odotetaan tammikuussa 2027 (aiemmin marraskuu 2026).
- EU 2023/1545: 0,001 % / 0,01 % on merkintäraja, ei käyttöraja; uudet tuotteet 31.7.2026 alkaen.

## Molekyylidatan hakuputki (21.11.2026)
- `scripts/etl/seed_molecules.csv` (217 molekyyliä) → `build_molecules.py` GitHub Actionsissa (työnkulku *Päivitä molekyylidata*) → `src/data/generated/molecules.json` + `report.md` + `raw_values.md`.
- Höyrynpaine: PubChemin lähteet luokitellaan (A: HSDB, ICSC, DOE PAC; C: Haz-Map, CAMEO/NTP 1992 – tunnetusti virheellisiä arvoja). Ristiriidat ratkaistaan kiehumispisteen (Grain–Watson, korjattu −0,2 log) avulla.
- Puuttuvat höyrynpaineet: ridge-regressio 10 RDKit-kuvaajalla, opetusdata mitatut + kiehumispistearviot; ristiinvalidoitu virhe 0,58 log (kerroin ~4).
- Hajukynnykset: Abraham 2012 (Pyrfume), yhdistetty stereoisomeereille InChIKeyn ensimmäisen osan mukaan; muuten PubChem; muuten kemiallisen ryhmän mediaani (arvio). Mitattu kynnys vain 39/217 molekyylille – suurin aukko.
- Ensimmäisen ajon tulos: 217/217 tunnistettu, 61 mitattua höyrynpainetta, 156 arviota.
