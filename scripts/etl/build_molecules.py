#!/usr/bin/env python3
"""Hakee tuoksumolekyylien tiedot PubChemistä ja Pyrfumesta ja kirjoittaa ne sovelluksen JSON-tiedostoksi.

Ajo:  python scripts/etl/build_molecules.py
Syöte:   scripts/etl/seed_molecules.csv
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
import statistics
import sys
import time
from pathlib import Path

import numpy as np
import requests
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, rdMolDescriptors

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


def cas_numbers(cids: list[int]) -> dict[int, str]:
    out: dict[int, str] = {}
    for i in range(0, len(cids), 100):
        chunk = cids[i : i + 100]
        ids = ",".join(map(str, chunk))
        js = fetch(f"{PUG}/compound/cid/synonyms/JSON", data={"cid": ids}, cache_key=f"syn:{ids}")
        for info in (js or {}).get("InformationList", {}).get("Information", []):
            for syn in info.get("Synonym", []):
                if cas_is_valid(syn):
                    out[info["CID"]] = syn
                    break
    return out


def experimental(cid: int) -> dict[str, list[tuple[str, str]]]:
    """Palauttaa {otsikko: [(teksti, lähde)]} PubChemin Experimental Properties -osiosta."""
    js = fetch(f"{VIEW}/data/compound/{cid}/JSON", params={"heading": "Experimental Properties"}, cache_key=f"view:{cid}:exp")
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


def summarize_vp(cands: list[dict], method: str) -> dict:
    values = [c["v"] for c in cands]
    sources = sorted({c["src"] for c in cands if c["src"]})
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


# ---------------------------------------------------------------- Rakennemalli puuttuville höyrynpaineille


def features(smiles: str | None) -> list[float] | None:
    mol = Chem.MolFromSmiles(smiles) if smiles else None
    if mol is None:
        return None
    return [
        1.0,
        Descriptors.MolWt(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcTPSA(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        rdMolDescriptors.CalcNumRings(mol),
    ]


class VpModel:
    """log10(VP) ~ MW + vetysidoksen luovuttajat + TPSA + renkaat, sovitettu tämän aineiston mitattuihin arvoihin."""

    def __init__(self, xs: list[list[float]], ys: list[float]):
        self.n = len(ys)
        self.coef = None
        self.rmse = float("nan")
        if self.n < 12:
            return
        x = np.array(xs)
        y = np.array(ys)
        self.coef, *_ = np.linalg.lstsq(x, y, rcond=None)
        # 5-kertainen ristiinvalidointi
        idx = np.arange(len(y))
        errs = []
        for k in range(5):
            test = idx % 5 == k
            c, *_ = np.linalg.lstsq(x[~test], y[~test], rcond=None)
            errs.extend((x[test] @ c - y[test]).tolist())
        self.rmse = float(np.sqrt(np.mean(np.square(errs)))) if errs else float("nan")

    def predict(self, f: list[float]) -> float | None:
        if self.coef is None:
            return None
        return float(10 ** (np.array(f) @ self.coef))


def choose_pubchem_odt(texts: list[tuple[str, str]], mw: float) -> list[float]:
    return [v for text, _ in texts for v in parse_odor_threshold(text, mw)]


def short_odor(texts: list[tuple[str, str]]) -> str | None:
    seen = []
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

    cids = sorted({cid for _, cid, _ in resolved})
    props = properties(cids)
    cas = cas_numbers(cids)
    abraham_raw = abraham_thresholds()
    # Hajukynnykset yhdistetään saman rakenteen stereoisomeereille (InChIKeyn ensimmäinen osa),
    # koska eri tutkimukset ovat käyttäneet eri muotoja (esim. limoneeni, d- ja l-limoneeni).
    abraham_props = properties(sorted(abraham_raw))
    abraham: dict[str, list[float]] = {}
    for acid, vals in abraham_raw.items():
        key = (abraham_props.get(acid, {}).get("InChIKey") or f"cid{acid}")[:14]
        abraham.setdefault(key, []).extend(vals)
    print(f"Abraham-kynnysarvoja {len(abraham_raw)} yhdisteelle", flush=True)

    rows = []
    for k, (row, cid, used) in enumerate(resolved, 1):
        if k % 25 == 0:
            print(f"  {k}/{len(resolved)}", flush=True)
        p = props.get(cid, {})
        exp = experimental(cid)
        rows.append((row, cid, used, p, exp))

    # Rakennemallin opetusaineisto: luotettavat (A/B) mitatut höyrynpaineet
    xs, ys = [], []
    for row, cid, used, p, exp in rows:
        good = [c for c in vp_candidates(exp.get("Vapor Pressure", [])) if c["tier"] in ("A", "B")]
        f = features(p.get("SMILES"))
        if good and f and row.get("group") != "liuotin":
            xs.append(f)
            ys.append(math.log10(log_median([c["v"] for c in good])))
    model = VpModel(xs, ys)
    print(f"Rakennemalli: n = {model.n}, ristiinvalidoitu virhe {model.rmse:.2f} log-yksikköä", flush=True)

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
            gw = grain_watson_vp(tb + 273.15, kf=GRAIN_KF.get(group, 1.0 if group in ("monoterpeeni", "seskviterpeeni", "hiilivety", "aromaattinen") else 1.05))
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

        if tier_a:
            vp = summarize_vp(tier_a, "koe")
        elif tier_b:
            vp = summarize_vp(tier_b, "koe")
        elif tier_c:
            vp = summarize_vp(tier_c, "arvio")
            vp["source"] += " (heikko lähde)"
        elif gw is not None:
            vp = {"value": gw, "n": 0, "method": "arvio", "source": f"Arvio kiehumispisteestä {tb:.0f} °C (Grain–Watson)"}
        elif pred is not None and group not in ("liuotin",):
            vp = {"value": pred, "n": 0, "method": "arvio", "source": f"Rakennemalli (n = {model.n}, virhe ±{model.rmse:.1f} log)"}
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
            odt = {"value": geometric_mean(vals), "min": min(vals), "max": max(vals), "n": len(vals), "method": "koe", "source": "Abraham ym. 2012 (Pyrfume)"}
        else:
            vals = choose_pubchem_odt(exp.get("Odor Threshold", []), mw)
            if vals:
                odt = {"value": geometric_mean(vals), "min": min(vals), "max": max(vals), "n": len(vals), "method": "koe", "source": "PubChem (HSDB/muut)"}

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
                    "method": "arvio",
                    "source": f"Ryhmän ({m['group']}) mediaani, n = {len(vals)}",
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
                    "PubChem PUG REST ja PUG View (NCBI)",
                    "Abraham ym. 2012, Chemical Senses 37:207–218, Pyrfume-arkiston kautta",
                ],
                "molecules": molecules,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    write_report(seed, molecules, unresolved, notes, model)
    RAW_REPORT.write_text("# PubChemin lähdearvot\n\nKaikki haetut höyrynpaine- ja kiehumispistetekstit tarkistusta varten.\n\n" + "\n".join(raw_lines) + "\n", encoding="utf-8")
    print(f"Kirjoitettu {OUT}: {len(molecules)} molekyyliä", flush=True)
    return 0


def write_report(seed, molecules, unresolved, notes, model):
    n = len(molecules)
    vp_koe = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "koe")
    vp_ennuste = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "ennuste")
    vp_arvio = sum(1 for m in molecules if m["vp25"] and m["vp25"]["method"] == "arvio")
    odt_koe = sum(1 for m in molecules if m["odt"] and m["odt"]["method"] == "koe")
    odt_arvio = sum(1 for m in molecules if m["odt"] and m["odt"]["method"] == "arvio")
    lines = [
        "# Molekyylidatan raportti",
        "",
        f"Ajettu {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M} UTC. Siemenlistassa {len(seed)} molekyyliä, tunnistettu {n}.",
        "",
        "| Tieto | Mitattu | PubChemin ennuste | Arvio |",
        "| --- | --- | --- | --- |",
        f"| Höyrynpaine 25 °C | {vp_koe} | {vp_ennuste} | {vp_arvio} |",
        f"| Hajukynnys | {odt_koe} | – | {odt_arvio} |",
        "",
        (
            f"Puuttuvien höyrynpaineiden rakennemalli: sovitettu {model.n} mitattuun arvoon, ristiinvalidoitu virhe {model.rmse:.2f} log10-yksikköä (kerroin {10 ** model.rmse:.1f})."
            if model.coef is not None
            else "Rakennemallia ei sovitettu (liian vähän mitattuja arvoja)."
        ),
        "",
    ]
    if unresolved:
        lines += ["## Ei löytynyt PubChemistä", ""]
        lines += [f"- `{r['id']}`: {r['query']}" for r in unresolved]
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
