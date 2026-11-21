#!/usr/bin/env python3
"""Hakee tuoksumolekyylien tiedot PubChemistä ja Pyrfumesta ja kirjoittaa ne sovelluksen JSON-tiedostoksi.

Ajo:  python scripts/etl/build_molecules.py
Syöte:   scripts/etl/seed_molecules.csv (käsin kuratoidut) ja IFRA Fragrance Ingredient Glossary 2019 (Pyrfume)
Tulos:   src/data/generated/molecules.json ja scripts/etl/report.md

PubChemin käyttöehtojen mukaisesti pyyntöjä tehdään enintään ~4 sekunnissa. Vastaukset tallennetaan
välimuistiin (scripts/etl/.cache), joten uusi ajo hakee vain muuttuneet molekyylit.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np
import requests
from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, rdMolDescriptors

sys.path.insert(0, str(Path(__file__).parent))
from parsers import (  # noqa: E402
    cas_is_valid,
    grain_watson_vp,
    log_median,
    geometric_mean,
    parse_boiling_point,
    parse_odor_threshold,
    parse_vapor_pressure,
)

from descriptors import (  # noqa: E402
    NOT_A_MOLECULE,
    TRADE_NAME_LIST,
    choose_name,
    family_from_descriptors,
    search_synonyms,
)

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "scripts/etl/seed_molecules.csv"
OUT = ROOT / "src/data/generated/molecules.json"
REPORT = ROOT / "scripts/etl/report.md"
RAW_REPORT = ROOT / "scripts/etl/raw_values.md"
CACHE = ROOT / "scripts/etl/.cache"

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view"
PYRFUME = "https://raw.githubusercontent.com/pyrfume/pyrfume-data/main"

R = 8.314
MISSING = {"__missing__": True}

session = requests.Session()
session.headers["User-Agent"] = "hajuvesi-etl/1.0 (https://github.com/sivutnopeasti/hajuvesi)"
_last_request = [0.0]


# ---------------------------------------------------------------- HTTP + välimuisti


def fetch(url: str, *, params=None, data=None, cache_key: str | None = None, text=False):
    path = None
    if cache_key:
        path = CACHE / (hashlib.sha1(cache_key.encode()).hexdigest() + (".txt" if text else ".json"))
        if path.exists():
            raw = path.read_text(encoding="utf-8")
            if text:
                return raw
            obj = json.loads(raw)
            return None if obj == MISSING else obj

    for attempt in range(7):
        wait = 0.25 - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        try:
            if data is not None:
                r = session.post(url, data=data, timeout=90)
            else:
                r = session.get(url, params=params, timeout=90)
        except requests.RequestException as e:
            print(f"  verkkovirhe {e}; yritetään uudelleen", flush=True)
            time.sleep(2**attempt)
            continue
        if r.status_code == 200:
            if path:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(r.text, encoding="utf-8")
            return r.text if text else r.json()
        if r.status_code in (400, 404):
            if path:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(MISSING), encoding="utf-8")
            return None
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(60, 2**attempt))
            continue
        r.raise_for_status()
    raise RuntimeError(f"Pyyntö epäonnistui toistuvasti: {url}")


# ---------------------------------------------------------------- PubChem


def resolve_cid(query: str) -> tuple[int | None, str | None]:
    for name in [q.strip() for q in query.split("|") if q.strip()]:
        js = fetch(f"{PUG}/compound/name/cids/JSON", data={"name": name}, cache_key=f"name:{name}")
        cids = (js or {}).get("IdentifierList", {}).get("CID", [])
        cids = [c for c in cids if c]
        if cids:
            return cids[0], name
    return None, None


def properties(cids: list[int]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for i in range(0, len(cids), 100):
        chunk = cids[i : i + 100]
        ids = ",".join(map(str, chunk))
        js = None
        for props in (
            "Title,MolecularWeight,MolecularFormula,SMILES,XLogP,IUPACName,InChIKey",
            "Title,MolecularWeight,MolecularFormula,IsomericSMILES,XLogP,IUPACName,InChIKey",
        ):
            js = fetch(f"{PUG}/compound/cid/property/{props}/JSON", data={"cid": ids}, cache_key=f"props:{props}:{ids}")
            if js:
                break
        for p in (js or {}).get("PropertyTable", {}).get("Properties", []):
            p["SMILES"] = p.get("SMILES") or p.get("IsomericSMILES") or p.get("CanonicalSMILES")
            out[p["CID"]] = p
    return out


def synonym_lists(cids: list[int]) -> dict[int, list[str]]:
    """PubChemin synonyymit CID:ittäin."""
    out: dict[int, list[str]] = {}
    for i in range(0, len(cids), 100):
        chunk = cids[i : i + 100]
        ids = ",".join(map(str, chunk))
        js = fetch(f"{PUG}/compound/cid/synonyms/JSON", data={"cid": ids}, cache_key=f"syn:{ids}")
        for info in (js or {}).get("InformationList", {}).get("Information", []):
            out[info["CID"]] = info.get("Synonym", [])
    return out


def trade_name_links(props: dict[int, dict]) -> dict[int, list[str]]:
    """Kauppanimet (Hedione, Iso E Super …) haetaan PubChemistä nimellä ja liitetään kirjaston molekyyleihin,
    joilla on sama rakenne (InChIKeyn ensimmäinen osa), vaikka PubChem olisi tallentanut nimen eri stereoisomeerille."""
    by_key: dict[str, list[int]] = {}
    for cid, p in props.items():
        if p.get("InChIKey"):
            by_key.setdefault(p["InChIKey"][:14], []).append(cid)
    found = {}
    for name in TRADE_NAME_LIST:
        cid, _ = resolve_cid(name)
        if cid:
            found[name] = cid
    trade_props = properties(sorted(set(found.values())))
    out: dict[int, list[str]] = {}
    for name, cid in found.items():
        key = (trade_props.get(cid, {}).get("InChIKey") or "")[:14]
        for target in by_key.get(key, []) if key else []:
            out.setdefault(target, []).append(name)
    return out


def first_cas(synonyms: list[str]) -> str | None:
    return next((s for s in synonyms if cas_is_valid(s)), None)


def experimental(cid: int) -> dict[str, list[tuple[str, str]]]:
    """Palauttaa {otsikko: [(teksti, lähde)]} PubChemin Experimental Properties -osiosta."""
    try:
        js = fetch(f"{VIEW}/data/compound/{cid}/JSON", params={"heading": "Experimental Properties"}, cache_key=f"view:{cid}:exp")
    except RuntimeError as e:
        print(f"  CID {cid}: {e}", flush=True)
        return {}
    if not js:
        return {}
    record = js.get("Record", {})
    refs = {r.get("ReferenceNumber"): r.get("SourceName", "") for r in record.get("Reference", [])}
    out: dict[str, list[tuple[str, str]]] = {}

    def walk(section):
        heading = section.get("TOCHeading", "")
        for info in section.get("Information", []):
            value = info.get("Value", {})
            texts = [s.get("String", "") for s in value.get("StringWithMarkup", [])]
            if "Number" in value:
                unit = value.get("Unit", "")
                texts += [f"{n} {unit}".strip() for n in value["Number"]]
            src = refs.get(info.get("ReferenceNumber"), "")
            for t in texts:
                if t:
                    out.setdefault(heading, []).append((t, src))
        for sub in section.get("Section", []):
            walk(sub)

    for sec in record.get("Section", []):
        walk(sec)
    return out


# ---------------------------------------------------------------- Pyrfume


def abraham_thresholds() -> dict[int, list[float]]:
    """Abraham ym. 2012 hajukynnykset (ppm, v/v) Pyrfume-arkistosta, CID → arvot."""
    behavior = fetch(f"{PYRFUME}/abraham_2012/behavior.csv", cache_key="pyrfume:abraham:behavior", text=True)
    stimuli = fetch(f"{PYRFUME}/abraham_2012/stimuli.csv", cache_key="pyrfume:abraham:stimuli", text=True)
    stim_to_cid = {row["Stimulus"]: int(float(row["CID"])) for row in csv.DictReader(io.StringIO(stimuli)) if row.get("CID")}
    out: dict[int, list[float]] = {}
    for row in csv.DictReader(io.StringIO(behavior)):
        cid = stim_to_cid.get(row["Stimulus"])
        try:
            log_inv = float(row["Log (1/ODT)"])
        except (TypeError, ValueError):
            continue
        if cid:
            out.setdefault(cid, []).append(10 ** (-log_inv))
    return out


def ifra_glossary() -> list[dict]:
    """IFRA Fragrance Ingredient Glossary (2019) Pyrfume-arkistosta: hajusteainesosat ja niiden 1–3 hajukuvaajaa.

    Glossaari kattaa IFRA:n Transparency Listin hajua antavat aineet. Mukaan otetaan yksittäiset molekyylit;
    eteeriset öljyt ja muut seokset, jotka PubChemissä ovat yhtenä tietueena, jätetään pois.
    """
    mols = fetch(f"{PYRFUME}/ifra_2019/molecules.csv", cache_key="pyrfume:ifra:molecules", text=True)
    behavior = fetch(f"{PYRFUME}/ifra_2019/behavior.csv", cache_key="pyrfume:ifra:behavior", text=True)
    stimuli = fetch(f"{PYRFUME}/ifra_2019/stimuli.csv", cache_key="pyrfume:ifra:stimuli", text=True)
    stim_to_cid = {r["Stimulus"]: int(float(r["CID"])) for r in csv.DictReader(io.StringIO(stimuli)) if r.get("CID")}
    descriptors: dict[int, list[str]] = {}
    for r in csv.DictReader(io.StringIO(behavior)):
        cid = stim_to_cid.get(r["Stimulus"])
        if not cid:
            continue
        lst = descriptors.setdefault(cid, [])
        for k in ("Descriptor 1", "Descriptor 2", "Descriptor 3"):
            d = (r.get(k) or "").strip()
            if d and d.lower() not in (x.lower() for x in lst):
                lst.append(d)
    out = []
    for r in csv.DictReader(io.StringIO(mols)):
        cid = int(float(r["CID"]))
        smiles = r.get("IsomericSMILES") or ""
        if cid <= 0 or "." in smiles or NOT_A_MOLECULE.search(r.get("name") or ""):
            continue
        out.append({"cid": cid, "name": r.get("name"), "iupac": r.get("IUPACName"), "descriptors": descriptors.get(cid, [])})
    return out


# ---------------------------------------------------------------- Kemiallinen luokittelu (RDKit)

SMARTS = {
    "happo": "[CX3](=O)[OX2H1]",
    "laktoni": "[#6][#6X3;R](=[OX1])[#8X2;R][#6]",
    "esteri": "[#6][CX3](=O)[OX2H0][#6]",
    "aldehydi": "[CX3H1](=O)[#6]",
    "ketoni": "[#6][CX3](=O)[#6]",
    "fenoli": "c[OX2H]",
    "alkoholi": "[CX4][OX2H]",
    "eetteri": "[OD2]([#6])[#6]",
}
PATTERNS = {k: Chem.MolFromSmarts(v) for k, v in SMARTS.items()}


def classify(smiles: str | None) -> tuple[str, int]:
    """Palauttaa (ryhmä, hiilten määrä)."""
    if not smiles:
        return "muu", 0
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return "muu", 0
    atoms = [a.GetSymbol() for a in mol.GetAtoms()]
    n_c = atoms.count("C")
    has_ns = any(a in ("N", "S") for a in atoms)
    aromatic = any(a.GetIsAromatic() for a in mol.GetAtoms())
    hit = {k: mol.HasSubstructMatch(p) for k, p in PATTERNS.items()}

    if hit["happo"]:
        return "happo", n_c
    if hit["laktoni"]:
        return "laktoni", n_c
    if hit["esteri"]:
        return "esteri", n_c
    if hit["aldehydi"]:
        return "aldehydi", n_c
    if hit["ketoni"]:
        return "ketoni", n_c
    if hit["fenoli"]:
        return "fenoli", n_c
    if hit["alkoholi"]:
        if n_c == 10 and not aromatic:
            return "terpeenialkoholi", n_c
        if n_c == 15 and not aromatic:
            return "seskviterpeenialkoholi", n_c
        return "alkoholi", n_c
    if hit["eetteri"]:
        return "eetteri-oksidi", n_c
    if has_ns:
        return "typpi-rikki", n_c
    if not any(a == "O" for a in atoms):
        if aromatic and n_c not in (10, 15):
            return "aromaattinen", n_c
        if n_c == 10:
            return "monoterpeeni", n_c
        if n_c == 15:
            return "seskviterpeeni", n_c
        return "hiilivety", n_c
    return "muu", n_c


GRAIN_KF = {"alkoholi": 1.22, "terpeenialkoholi": 1.22, "seskviterpeenialkoholi": 1.22, "fenoli": 1.2, "happo": 1.3}


# ---------------------------------------------------------------- Arvojen valinta


# Lähteiden luotettavuus: A = vertaisarvioidut kokoelmat, C = tunnetusti virheellisiä arvoja sisältävät
TIER_A = ("Hazardous Substances Data Bank", "International Chemical Safety Cards", "ICSC", "PAC Chemical Database", "DOE")
TIER_C = ("Haz-Map", "CAMEO")


def source_tier(src: str) -> str:
    if any(k in src for k in TIER_A):
        return "A"
    if any(k in src for k in TIER_C):
        return "C"
    return "B"


def vp_candidates(texts: list[tuple[str, str]]) -> list[dict]:
    """Kaikki 15–35 °C:n höyrynpainearvot korjattuna 25 °C:een, lähteen luotettavuusluokan kanssa."""
    out = []
    for text, src in texts:
        for p in parse_vapor_pressure(text):
            t = p["temp_c"]
            if t is not None and not (15 <= t <= 35):
                continue
            v = p["mmhg"]
            if t is not None and t != 25:
                v = v * math.exp(-55000 / R * (1 / 298.15 - 1 / (t + 273.15)))
            if not (1e-9 < v < 800):
                continue
            out.append({"v": v, "src": src, "tier": "C" if p["estimated"] else source_tier(src), "est": p["estimated"]})
    return out


SHORT_SOURCE = (
    ("Hazardous Substances Data Bank", "HSDB"),
    ("Chemical Safety Cards", "ICSC"),
    ("PAC Chemical Database", "PAC (US DOE)"),
    ("Haz-Map", "Haz-Map"),
    ("CAMEO", "CAMEO"),
)


def short_source(src: str) -> str:
    return next((short for key, short in SHORT_SOURCE if key in src), src)


def summarize_vp(cands: list[dict], method: str) -> dict:
    values = [c["v"] for c in cands]
    sources = sorted({short_source(c["src"]) for c in cands if c["src"]})
    return {
        "value": log_median(values),
        "min": min(values),
        "max": max(values),
        "n": len(values),
        "method": method,
        "source": ("PubChem: " + ", ".join(sources[:3])) if sources else "PubChem",
    }


def bp_candidates(texts: list[tuple[str, str]]) -> list[float]:
    return [v for text, _ in texts for v in parse_boiling_point(text)]


# Kemiallisten ryhmien englanninkieliset nimet lähdeteksteihin
GROUP_EN = {
    "liuotin": "solvent",
    "monoterpeeni": "monoterpene",
    "seskviterpeeni": "sesquiterpene",
    "hiilivety": "other hydrocarbon",
    "aromaattinen": "aromatic hydrocarbon",
    "terpeenialkoholi": "terpene alcohol",
    "seskviterpeenialkoholi": "sesquiterpene alcohol",
    "alkoholi": "other alcohol",
    "aldehydi": "aldehyde",
    "ketoni": "ketone",
    "esteri": "ester",
    "laktoni": "lactone",
    "fenoli": "phenol",
    "eetteri-oksidi": "ether/oxide",
    "happo": "acid",
    "typpi-rikki": "nitrogen/sulfur compound",
    "muu": "other",
}


# ---------------------------------------------------------------- Rakennemalli puuttuville höyrynpaineille


def features(smiles: str | None) -> list[float] | None:
    mol = Chem.MolFromSmiles(smiles) if smiles else None
    if mol is None:
        return None
    return [
        1.0,
        Descriptors.MolWt(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcNumHBA(mol),
        rdMolDescriptors.CalcTPSA(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        rdMolDescriptors.CalcNumRings(mol),
        rdMolDescriptors.CalcFractionCSP3(mol),
        Crippen.MolLogP(mol),
        Crippen.MolMR(mol),
        rdMolDescriptors.CalcNumRotatableBonds(mol),
    ]


# Grain–Watson yliarvioi tässä aineistossa keskimäärin 0,2 log-yksikköä (kerroin 1,6) mitattuihin verrattuna.
GW_BIAS = 0.2


class VpModel:
    """Ridge-regressio log10(VP) ~ rakenteen kuvaajat.

    Opetusdata: luotettavat mitatut höyrynpaineet + kiehumispisteestä lasketut arviot niille, joilta mittaus puuttuu.
    Virhe arvioidaan 10-kertaisella ristiinvalidoinnilla vain mitattuja arvoja vasten.
    """

    LAMBDA = 1.0

    def __init__(self, measured: list[tuple[list[float], float]], pseudo: list[tuple[list[float], float]]):
        self.n = len(measured)
        self.n_pseudo = len(pseudo)
        self.coef = None
        self.rmse = float("nan")
        if self.n < 12:
            return
        xm = np.array([f for f, _ in measured])
        ym = np.array([y for _, y in measured])
        xp = np.array([f for f, _ in pseudo]).reshape(-1, xm.shape[1])
        yp = np.array([y for _, y in pseudo])
        idx = np.arange(len(ym))
        errs = []
        for k in range(10):
            test = idx % 10 == k
            fit = self._fit(np.vstack([xm[~test], xp]), np.concatenate([ym[~test], yp]))
            errs.extend((self._apply(fit, xm[test]) - ym[test]).tolist())
        self.rmse = float(np.sqrt(np.mean(np.square(errs))))
        self.coef = self._fit(np.vstack([xm, xp]), np.concatenate([ym, yp]))

    def _fit(self, x, y):
        mu = x[:, 1:].mean(0)
        sd = x[:, 1:].std(0) + 1e-9
        z = np.hstack([x[:, :1], (x[:, 1:] - mu) / sd])
        reg = np.eye(z.shape[1]) * self.LAMBDA
        reg[0, 0] = 0
        c = np.linalg.solve(z.T @ z + reg, z.T @ y)
        return (c, mu, sd)

    @staticmethod
    def _apply(fit, x):
        c, mu, sd = fit
        z = np.hstack([x[:, :1], (x[:, 1:] - mu) / sd])
        return z @ c

    def predict(self, f: list[float]) -> float | None:
        if self.coef is None:
            return None
        return float(10 ** self._apply(self.coef, np.array([f]))[0])


def gw_estimate(tb_c: float, group: str) -> float:
    kf = GRAIN_KF.get(group, 1.0 if group in ("monoterpeeni", "seskviterpeeni", "hiilivety", "aromaattinen") else 1.05)
    return grain_watson_vp(tb_c + 273.15, kf=kf) / 10**GW_BIAS


def choose_pubchem_odt(texts: list[tuple[str, str]], mw: float) -> list[float]:
    return [v for text, _ in texts for v in parse_odor_threshold(text, mw)]


def short_odor(texts: list[tuple[str, str]]) -> str | None:
    seen: list[str] = []
    for text, _ in texts:
        t = re.sub(r"\s+", " ", text).strip().rstrip(".")
        if 3 < len(t) <= 140 and t.lower() not in [s.lower() for s in seen]:
            seen.append(t)
        if len(seen) == 2:
            break
    return "; ".join(seen) if seen else None


# ---------------------------------------------------------------- Pääohjelma


def main() -> int:
    seed = list(csv.DictReader(SEED.open(encoding="utf-8")))
    print(f"Siemenlistassa {len(seed)} molekyyliä", flush=True)

    resolved, unresolved = [], []
    for row in seed:
        cid, used = resolve_cid(row["query"])
        if cid:
            resolved.append((row, cid, used))
        else:
            unresolved.append(row)
    print(f"PubChem tunnisti {len(resolved)}/{len(seed)}", flush=True)
    for row in seed:
        row["origin"] = "seed"

    # IFRA:n hajusteainesosat, joita kuratoidussa listassa ei vielä ole
    seed_cids = {cid for _, cid, _ in resolved}
    ifra = ifra_glossary()
    unknown_descriptors: dict[str, int] = {}
    for item in ifra:
        cid = item["cid"]
        if cid in seed_cids:
            continue
        family, known = family_from_descriptors(item["descriptors"])
        if not known:
            for d in item["descriptors"]:
                unknown_descriptors[d] = unknown_descriptors.get(d, 0) + 1
        row = {
            "id": f"cid-{cid}",
            "name": item["name"] or "",
            "iupac": item["iupac"] or "",
            "query": f"cid:{cid}",
            "family": family,
            "odor": ", ".join(d.lower() for d in item["descriptors"]),
            "group": "",
            "origin": "ifra",
        }
        resolved.append((row, cid, f"cid:{cid}"))
        seed_cids.add(cid)
    n_ifra = sum(1 for r, _, _ in resolved if r["origin"] == "ifra")
    print(f"IFRA-glossaarista {len(ifra)} molekyyliä, joista {n_ifra} uusia", flush=True)

    cids = sorted({cid for _, cid, _ in resolved})
    props = properties(cids)
    synonyms = synonym_lists(cids)
    cas = {cid: c for cid in cids if (c := first_cas(synonyms.get(cid, [])))}
    trade = trade_name_links(props)
    print(f"Kauppanimiä liitetty {sum(len(v) for v in trade.values())} kpl {len(trade)} molekyyliin", flush=True)

    # Nimet IFRA-riveille: Pyrfumen yleisnimi tai PubChemin otsikko; samannimiset erotetaan CAS-numerolla
    taken = {r["name"].lower() for r, _, _ in resolved if r["origin"] == "seed"}
    for row, cid, _ in resolved:
        if row["origin"] != "ifra":
            continue
        p = props.get(cid, {})
        name = choose_name(row["name"], p.get("Title"), p.get("IUPACName") or row.get("iupac"))
        if name.lower() in taken:
            name = f"{name} ({cas.get(cid) or f'CID {cid}'})"
        taken.add(name.lower())
        row["name"] = name
    abraham_raw = abraham_thresholds()
    # Hajukynnykset yhdistetään saman rakenteen stereoisomeereille (InChIKeyn ensimmäinen osa),
    # koska eri tutkimukset ovat käyttäneet eri muotoja (esim. limoneeni, d- ja l-limoneeni).
    abraham_props = properties(sorted(abraham_raw))
    abraham: dict[str, list[float]] = {}
    abraham_cids: dict[str, set[int]] = {}
    for acid, vals in abraham_raw.items():
        key = (abraham_props.get(acid, {}).get("InChIKey") or f"cid{acid}")[:14]
        abraham.setdefault(key, []).extend(vals)
        abraham_cids.setdefault(key, set()).add(acid)
    print(f"Abraham-kynnysarvoja {len(abraham_raw)} yhdisteelle", flush=True)

    rows = []
    for k, (row, cid, used) in enumerate(resolved, 1):
        if k % 100 == 0:
            print(f"  {k}/{len(resolved)}", flush=True)
        p = props.get(cid, {})
        exp = experimental(cid)
        rows.append((row, cid, used, p, exp))

    # Rakennemallin opetusaineisto
    measured, pseudo = [], []
    for row, cid, used, p, exp in rows:
        if row.get("group") == "liuotin":
            continue
        f = features(p.get("SMILES"))
        if not f:
            continue
        good = [c for c in vp_candidates(exp.get("Vapor Pressure", [])) if c["tier"] in ("A", "B")]
        tbs = bp_candidates(exp.get("Boiling Point", []))
        if good:
            measured.append((f, math.log10(log_median([c["v"] for c in good]))))
        elif tbs:
            group, _ = classify(p.get("SMILES"))
            pseudo.append((f, math.log10(gw_estimate(max(tbs), group))))
    model = VpModel(measured, pseudo)
    print(f"Rakennemalli: {model.n} mitattua + {model.n_pseudo} kiehumispistearviota, ristiinvalidoitu virhe {model.rmse:.2f} log-yksikköä", flush=True)

    molecules, notes, raw_lines = [], [], []
    for row, cid, used, p, exp in rows:
        mw = float(p.get("MolecularWeight") or 0)
        smiles = p.get("SMILES")
        group, n_c = classify(smiles)
        if row.get("group"):
            group = row["group"]
        f = features(smiles)
        pred = model.predict(f) if f else None
        tol = 10 ** max(1.0, 3 * model.rmse) if model.coef is not None else 1e9  # sallittu poikkeama rakennemallista

        cands = vp_candidates(exp.get("Vapor Pressure", []))
        tbs = bp_candidates(exp.get("Boiling Point", []))
        tb = max(tbs) if tbs else None  # alennetun paineen arvot ovat aina liian pieniä, joten suurin on turvallisin
        gw = None
        if tb is not None:
            gw = gw_estimate(tb, group)
            if pred and not (pred / tol <= gw <= pred * tol):
                notes.append((row["id"], f"kiehumispiste {tb:.0f} °C ristiriidassa rakenteen kanssa; ohitettu"))
                tb, gw = None, None

        def plausible(v: float) -> bool:
            ref = gw or pred
            return ref is None or ref / tol <= v <= ref * tol

        tier_a = [c for c in cands if c["tier"] == "A"]
        tier_b = [c for c in cands if c["tier"] == "B" and plausible(c["v"])]
        tier_c = [c for c in cands if c["tier"] == "C" and plausible(c["v"])]
        rejected = [c for c in cands if c not in tier_a + tier_b + tier_c]
        if rejected:
            notes.append((row["id"], "hylätty epäuskottava höyrynpaine: " + ", ".join(f"{c['v']:.3g} mmHg ({c['src']})" for c in rejected)))

        if tier_a and gw is not None:
            # Ristiriitaiset vertaisarvioidut arvot: pidetään kiehumispisteen kanssa sopusoinnussa olevat
            ok = [c for c in tier_a if gw / 10 <= c["v"] <= gw * 10]
            if ok and len(ok) < len(tier_a):
                dropped = [c for c in tier_a if c not in ok]
                notes.append((row["id"], "ristiriitainen arvo ohitettu: " + ", ".join(f"{c['v']:.3g} mmHg ({c['src']})" for c in dropped)))
                tier_a = ok
        if tier_a:
            vp = summarize_vp(tier_a, "measured")
            if gw is not None and not (gw / 10 <= vp["value"] <= gw * 10):
                vp["min"] = min(vp["min"], gw)
                vp["max"] = max(vp["max"], gw)
                notes.append((row["id"], f"mitattu {vp['value']:.3g} mmHg poikkeaa kiehumispistearviosta {gw:.3g} mmHg; vaihteluväli kattaa molemmat"))
        elif tier_b:
            vp = summarize_vp(tier_b, "measured")
        elif tier_c:
            vp = summarize_vp(tier_c, "estimate")
            vp["source"] += " (weak source)"
        elif gw is not None:
            vp = {"value": gw, "n": 0, "method": "estimate", "source": f"Estimated from boiling point {tb:.0f} °C (Grain–Watson)"}
        elif pred is not None and group not in ("liuotin",):
            vp = {"value": pred, "n": 0, "method": "estimate", "source": f"Structure model (typical error about {10 ** model.rmse:.0f}×)"}
        else:
            vp = None
            notes.append((row["id"], "ei höyrynpainetta"))

        if vp and tb is not None and 0 < vp["value"] < 760:
            dh = R * math.log(760 / vp["value"]) / (1 / 298.15 - 1 / (tb + 273.15))
            dh_kj = min(110.0, max(35.0, dh / 1000))
        elif vp and 0 < vp["value"] < 760:
            # Kiehumispistettä ei ole: arvio Troutonin säännön tyyppisestä riippuvuudesta
            dh_kj = min(110.0, max(35.0, 45.0 - 6.5 * math.log10(vp["value"])))
        else:
            dh_kj = 55.0

        key = (p.get("InChIKey") or f"cid{cid}")[:14]
        odt = None
        if key in abraham:
            vals = abraham[key]
            pooled = len(abraham_cids.get(key, ())) > 1 or cid not in abraham_cids.get(key, ())
            odt = {
                "value": geometric_mean(vals),
                "min": min(vals),
                "max": max(vals),
                "n": len(vals),
                "method": "measured",
                "source": "Abraham et al. 2012 (Pyrfume)" + (", incl. stereoisomers" if pooled else ""),
            }
        else:
            vals = choose_pubchem_odt(exp.get("Odor Threshold", []), mw)
            if vals:
                odt = {"value": geometric_mean(vals), "min": min(vals), "max": max(vals), "n": len(vals), "method": "measured", "source": "PubChem (HSDB/other)"}

        raw_lines.append(f"### {row['id']} ({p.get('Title')}, CID {cid})")
        for text, src in exp.get("Vapor Pressure", []):
            raw_lines.append(f"- VP: {text} — *{src}*")
        for text, src in exp.get("Boiling Point", []):
            raw_lines.append(f"- Tb: {text} — *{src}*")
        raw_lines.append(f"- Rakennemalli: {pred:.3g} mmHg" if pred else "- Rakennemalli: –")
        raw_lines.append("")

        molecules.append(
            {
                "id": row["id"],
                "name": row["name"],
                "cid": cid,
                "cas": cas.get(cid),
                "pubchemTitle": p.get("Title"),
                "query": used,
                "formula": p.get("MolecularFormula"),
                "smiles": smiles,
                "mw": round(mw, 2),
                "xlogp": p.get("XLogP"),
                "tbC": round(tb, 1) if tb is not None else None,
                "vp25": vp,
                "dHvap": round(dh_kj, 1),
                "odt": odt,
                "family": row["family"],
                "group": group,
                "carbons": n_c,
                "odor": row["odor"],
                "odorEn": short_odor(exp.get("Odor", [])),
                "synonyms": search_synonyms(
                    trade.get(cid, []) + [p.get("Title") or ""] + synonyms.get(cid, []), exclude={row["name"]}
                ),
                "origin": row["origin"],
            }
        )

    # Hajukynnyksen varaarvo: kemiallisen ryhmän mediaani niistä, joilla on mitattu arvo
    by_group: dict[str, list[float]] = {}
    for m in molecules:
        if m["odt"]:
            by_group.setdefault(m["group"], []).append(m["odt"]["value"])
    all_odt = [v for vals in by_group.values() for v in vals]
    for m in molecules:
        if m["odt"] is None and m["group"] not in ("liuotin",):
            vals = by_group.get(m["group"]) or all_odt
            if vals:
                m["odt"] = {
                    "value": log_median(vals),
                    "n": 0,
                    "method": "estimate",
                    "source": f"Median of chemical group ({GROUP_EN.get(m['group'], m['group'])}), n = {len(vals)}",
                }

    for m in molecules:
        for key in ("vp25", "odt"):
            v = m.get(key)
            if v:
                for f in ("value", "min", "max"):
                    if f in v and v[f] is not None:
                        v[f] = float(f"{v[f]:.4g}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sources": [
                    "PubChem PUG REST and PUG View (NCBI)",
                    "Abraham et al. 2012, Chemical Senses 37:207–218, via the Pyrfume archive",
                    "IFRA Fragrance Ingredient Glossary (2019), via the Pyrfume archive",
                ],
                "molecules": molecules,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    write_report(seed, molecules, unresolved, notes, model, unknown_descriptors)
    RAW_REPORT.write_text("# PubChemin lähdearvot\n\nKaikki haetut höyrynpaine- ja kiehumispistetekstit tarkistusta varten.\n\n" + "\n".join(raw_lines) + "\n", encoding="utf-8")
    print(f"Kirjoitettu {OUT}: {len(molecules)} molekyyliä", flush=True)
    return 0


def write_report(seed, molecules, unresolved, notes, model, unknown_descriptors=None):
    n = len(molecules)
    vp_koe = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "measured")
    vp_ennuste = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "predicted")
    vp_arvio = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "estimate")
    odt_koe = sum(1 for m in molecules if m["odt"] and m["odt"]["method"] == "measured")
    odt_arvio = sum(1 for m in molecules if m["odt"] and m["odt"]["method"] == "estimate")
    lines = [
        "# Molekyylidatan raportti",
        "",
        f"Ajettu {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M} UTC. Kuratoidussa siemenlistassa {len(seed)} molekyyliä; "
        f"IFRA-glossaarista lisätty {sum(1 for m in molecules if m.get('origin') == 'ifra')}. Yhteensä {n}.",
        "",
        "Hajuperheet: "
        + ", ".join(
            f"{f} {c}"
            for f, c in sorted(
                {f: sum(1 for m in molecules if m["family"] == f) for f in {m["family"] for m in molecules}}.items(),
                key=lambda kv: -kv[1],
            )
        ),
        "",
        "| Tieto | Mitattu | PubChemin ennuste | Arvio |",
        "| --- | --- | --- | --- |",
        f"| Höyrynpaine 25 °C | {vp_koe} | {vp_ennuste} | {vp_arvio} |",
        f"| Hajukynnys | {odt_koe} | – | {odt_arvio} |",
        "",
        (
            f"Puuttuvien höyrynpaineiden rakennemalli: {model.n} mitattua arvoa + {model.n_pseudo} kiehumispistearviota, ristiinvalidoitu virhe {model.rmse:.2f} log10-yksikköä (kerroin {10 ** model.rmse:.1f})."
            if model.coef is not None
            else "Rakennemallia ei sovitettu (liian vähän mitattuja arvoja)."
        ),
        "",
    ]
    if unresolved:
        lines += ["## Ei löytynyt PubChemistä", ""]
        lines += [f"- `{r['id']}`: {r['query']}" for r in unresolved]
        lines.append("")
    if unknown_descriptors:
        lines += ["## Tuntemattomat IFRA-kuvaajat (lisää scripts/etl/descriptors.py-tiedostoon)", ""]
        lines += [f"- {d}: {c}" for d, c in sorted(unknown_descriptors.items(), key=lambda kv: -kv[1])]
        lines.append("")
    if notes:
        lines += ["## Huomiot", ""]
        lines += [f"- `{i}`: {t}" for i, t in notes]
        lines.append("")
    lines += [
        "## Tunnistukset (tarkista, että PubChemin nimi vastaa tarkoitettua)",
        "",
        "| id | Haku | PubChem | CID | MW | VP 25 °C (mmHg) | Hajukynnys (ppm) |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for m in molecules:
        vp = m["vp25"]
        odt = m["odt"]
        vp_s = f"{vp['value']:.3g} ({vp['method']})" if vp else "–"
        odt_s = f"{odt['value']:.3g} ({odt['method']})" if odt else "–"
        lines.append(f"| {m['id']} | {m['query']} | {m['pubchemTitle']} | {m['cid']} | {m['mw']} | {vp_s} | {odt_s} |")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
