"""Tuoksusanaston käsittely: IFRA:n hajukuvaajat → sovelluksen hajuperheet, nimien siistiminen
ja hakua varten käytettävät synonyymit.

Hajuperheet (sovelluksen FamilyId):
  alkoholi, sitrus, havu, vihrea, kukka, hedelma, mauste, balsami, puu, myski, raikas, haihtumaton
"""

from __future__ import annotations

import re

# IFRA Fragrance Ingredient Glossaryn ensisijaiset kuvaajat ovat suljettu sanasto (noin 27 sanaa).
PRIMARY_FAMILY = {
    "floral": "kukka",
    "fruity": "hedelma",
    "green": "vihrea",
    "herbal": "havu",
    "woody": "puu",
    "citrus": "sitrus",
    "gourmand": "balsami",
    "spicy": "mauste",
    "aldehydic": "raikas",
    "minty": "havu",
    "musk like": "myski",
    "balsamic": "balsami",
    "food like": "balsami",
    "earthy": "puu",
    "animal like": "myski",
    "aromatic": "havu",
    "marine": "raikas",
    "powdery": "myski",
    "anisic": "mauste",
    "smoky": "puu",
    "amber": "myski",
    "tobacco like": "balsami",
    "ozonic": "raikas",
    "honey": "balsami",
    "camphoraceous": "havu",
}

# Ensisijaiset kuvaajat, joille perhe päätellään seuraavista kuvaajista (esim. "Sulfurous, Fruity").
DEFER = {"sulfurous": "vihrea", "acidic": "hedelma"}

# Kaikki muut sanat (toissijaiset ja kolmannet kuvaajat).
DESCRIPTOR_FAMILY = {
    **PRIMARY_FAMILY,
    # sitrus
    "lemon": "sitrus", "lime": "sitrus", "grapefruit": "sitrus", "orange": "sitrus", "mandarin": "sitrus",
    "tangerine": "sitrus", "bergamot": "sitrus", "verbena": "sitrus", "lemongrass": "sitrus",
    "citronella": "sitrus", "petitgrain": "sitrus",
    # havu ja yrtti
    "pine": "havu", "juniper": "havu", "eucalyptus": "havu", "lavender": "havu", "sage": "havu",
    "rosemary": "havu", "artemisia": "havu", "bayleaf": "havu", "chamomile": "havu", "tea": "havu",
    "terpenic": "havu", "cooling": "havu", "menthol": "havu", "peppermint": "havu", "spearmint": "havu",
    "medicinal": "havu", "tarragon": "havu",
    # vihreä
    "leafy": "vihrea", "grassy": "vihrea", "foliage": "vihrea", "galbanum": "vihrea", "cucumber": "vihrea",
    "vegetable": "vihrea", "celery": "vihrea", "bell pepper": "vihrea", "carrot": "vihrea", "potato": "vihrea",
    "corn": "vihrea", "onion": "vihrea", "garlic": "vihrea", "rhubarb": "vihrea", "nasturtium": "vihrea",
    "marigold": "vihrea", "bitter": "vihrea",
    # kukkainen
    "rose": "kukka", "jasmin": "kukka", "muguet": "kukka", "violet": "kukka", "neroli": "kukka",
    "geranium": "kukka", "ylang": "kukka", "hyacinth": "kukka", "lily": "kukka", "cyclamen": "kukka",
    "gardenia": "kukka", "tuberose": "kukka", "narcissus": "kukka", "magnolia": "kukka", "orris": "kukka",
    "osmanthus": "kukka", "linden": "kukka", "hawthorn": "kukka", "sweet-pea": "kukka",
    "cherry-blossom": "kukka", "indolic": "kukka",
    # hedelmäinen
    "apple": "hedelma", "pear": "hedelma", "pineapple": "hedelma", "tropical-fruit": "hedelma",
    "banana": "hedelma", "berry": "hedelma", "peach": "hedelma", "apricot": "hedelma", "melon": "hedelma",
    "watermelon": "hedelma", "honeydew": "hedelma", "plum": "hedelma", "blackcurrant": "hedelma",
    "blueberry": "hedelma", "grape": "hedelma", "strawberry": "hedelma", "raspberry": "hedelma",
    "cherry": "hedelma", "kiwi": "hedelma", "mango": "hedelma", "juicy": "hedelma", "coconut": "hedelma",
    "lactonic": "hedelma", "brandy": "hedelma", "rum": "hedelma", "fermented": "hedelma", "sour": "hedelma",
    # mausteinen
    "cinnamon": "mauste", "clove": "mauste", "peppery": "mauste", "licorice": "mauste", "cumin": "mauste",
    "nutmeg": "mauste", "saffron": "mauste", "coriander": "mauste",
    # balsami ja gourmand
    "vanilla": "balsami", "caramel": "balsami", "butterscotch": "balsami", "maple": "balsami",
    "chocolate": "balsami", "cocoa": "balsami", "coffee": "balsami", "nutty": "balsami", "almond": "balsami",
    "peanut": "balsami", "roasted": "balsami", "popcorn": "balsami", "burnt": "balsami", "buttery": "balsami",
    "creamy": "balsami", "milky": "balsami", "dairy": "balsami", "tonka": "balsami", "coumarin": "balsami",
    "hay": "balsami", "tobacco": "balsami", "savoury": "balsami", "yeast": "balsami",
    # puu ja maa
    "sandalwood": "puu", "cedarwood": "puu", "vetiver": "puu", "patchouli": "puu", "oak": "puu",
    "mossy": "puu", "mushroom": "puu", "fungal": "puu", "rooty": "puu", "musty": "puu", "phenolic": "puu",
    "dry": "puu",
    # myski ja meripihka
    "leathery": "myski", "cheesy": "myski", "warm": "myski", "soft": "myski",
    # aldehydinen ja merellinen
    "watery": "raikas", "waxy": "raikas", "oily": "raikas", "fatty": "raikas", "clean": "raikas",
    "soapy": "raikas", "metallic": "raikas", "fresh": "raikas", "light": "raikas",
    # alkoholi ja liuottimet
    "ethereal": "alkoholi", "neutral": "alkoholi", "plastic": "alkoholi", "rubbery": "alkoholi",
}

# Sanat, jotka eivät yksin kerro perhettä, ellei muuta ole.
WEAK = {"sweet", "fresh", "soft", "warm", "dry", "light", "neutral", "sharp", "pungent", "powerful", "bitter"}
WEAK_FAMILY = {"sweet": "balsami", "sharp": "mauste", "pungent": "mauste", "powerful": "puu"}


def norm_descriptor(d: str) -> str:
    return re.sub(r"\s+", " ", d.strip().lower())


def family_from_descriptors(descriptors: list[str]) -> tuple[str, bool]:
    """Palauttaa (perhe, tunnistettiinko kaikki kuvaajat). Ensisijainen kuvaaja ratkaisee."""
    ds = [norm_descriptor(d) for d in descriptors if d and d.strip()]
    known = all(d in DESCRIPTOR_FAMILY or d in WEAK or d in DEFER for d in ds)
    if not ds:
        return "puu", known
    first = ds[0]
    if first in PRIMARY_FAMILY:
        return PRIMARY_FAMILY[first], known
    for d in ds[1:] if first in DEFER else ds:
        if d in DESCRIPTOR_FAMILY and d not in WEAK:
            return DESCRIPTOR_FAMILY[d], known
    if first in DEFER:
        return DEFER[first], known
    for d in ds:
        if d in DESCRIPTOR_FAMILY:
            return DESCRIPTOR_FAMILY[d], known
        if d in WEAK_FAMILY:
            return WEAK_FAMILY[d], known
    return "puu", False


# ---------------------------------------------------------------- Nimet

GREEK = {"alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "omega": "ω"}
# Etuliitteet, joita ei kirjoiteta isolla (cis-3-Hexenol, tert-Butyl, n-Butyl, dl-Menthol).
LOWER_PREFIXES = {"cis", "trans", "tert", "sec", "dl", "endo", "exo", "ortho", "meta", "para", "rac", "syn", "anti"}
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")


def looks_like_cas(s: str) -> bool:
    return bool(CAS_RE.match(s.strip()))


def pretty_name(raw: str) -> str:
    """'alpha-pinene' → 'α-Pinene', 'cis-3-hexenol' → 'cis-3-Hexenol', '(e)-2-hexenal' → '(E)-2-Hexenal'."""
    s = re.sub(r"\s+", " ", raw.strip())
    for word, letter in GREEK.items():
        s = re.sub(rf"(?<![A-Za-z]){word}(?=-)", letter, s, flags=re.I)
    # Stereokuvaajat isolla: (e)-, (z)-, (r)-, (s)-, (2e,4z)-
    s = re.sub(r"\(([0-9,]*[ezrs](?:,[0-9]*[ezrs])*)\)", lambda m: "(" + m.group(1).upper() + ")", s)
    # Indikoitu vety: 2h-pyran → 2H-pyran, 3(4h)-one → 3(4H)-one
    s = re.sub(r"(?<=\d)h(?=[-,)\s]|$)", "H", s)
    if s and not any(c.isupper() for c in s if c.isalpha() and c not in "EZRSH"):
        for m in re.finditer(r"[A-Za-z]+", s):
            run = m.group(0)
            if len(run) < 2 or run.lower() in LOWER_PREFIXES:
                continue
            s = s[: m.start()] + run[0].upper() + s[m.start() + 1 :]
            break
    return s


JUNK_NAME = re.compile(r"^(unii|dtxsid|dtxcid|einecs|schembl|nsc|zinc|akos|chebi|mfcd)\b", re.I)
# CAS-hakemiston käänteinen muoto, esim. "Cyclohexanol, 1-methyl-4-(1-methylethyl)-"
INVERTED = re.compile(r",\s*[\d(]|-$")
# Luonnonaineet ja seokset, jotka PubChemissä on tallennettu yhdeksi "yhdisteeksi"
NOT_A_MOLECULE = re.compile(
    r"\b(oil|oils|extract|absolute|resinoid|concrete|tincture|balsam|gum|resin|juice|distillate|terpenes|"
    r"fraction|oleoresin)\b",
    re.I,
)


def choose_name(pyrfume_name: str | None, title: str | None, iupac: str | None) -> str:
    """Luettavin nimi: Pyrfumen yleisnimi, PubChemin otsikko tai IUPAC-nimi; pitkä nimi vaihdetaan lyhyempään."""
    cands = [c.strip() for c in (pyrfume_name, title, iupac) if c and c.strip()]
    good = [c for c in cands if not looks_like_cas(c) and not JUNK_NAME.match(c)]
    clean = [c for c in good if not INVERTED.search(c)] or good
    if not clean:
        return pretty_name(cands[0] if cands else "?")
    best = clean[0]
    if len(best) > 40:
        best = min(clean, key=len)
    return pretty_name(best)


# ---------------------------------------------------------------- Synonyymit hakua varten

SYN_SKIP = re.compile(
    r"(^\d{2,7}-\d{2}-\d$)|(^\d{3}-\d{3}-\d$)|DTXSID|DTXCID|CHEBI|SCHEMBL|ZINC|AKOS|NSC|MFCD|FEMA|HSDB|UNII|"
    r"EINECS|BRN |CCRIS|AI3-|BDBM|^Q\d+$|^CS-|^HY-|^EN\d|^SY\d|^AC-|^AS-|^BCP|^NCGC|^SPECTRUM|^CAS-|^EC |"
    r"InChI|WLN|^D0|^DB\d|^FT-|^STR|^SBI|^KS-|^MLS|^SMR|^LS-|^ALBB|^STK|^TRA|^BBL|^VS-|^PD\d|^W-\d|^Z\d|"
    r"\[|\]|;|:",
    re.I,
)


def search_synonyms(synonyms: list[str], exclude: set[str], limit: int = 10, max_len: int = 34) -> list[str]:
    """Lyhyet, luettavat synonyymit (myös kauppanimet, kuten Hedione tai Galaxolide)."""
    out: list[str] = []
    seen = {e.lower() for e in exclude}
    for s in synonyms:
        t = s.strip()
        if not (3 <= len(t) <= max_len) or SYN_SKIP.search(t):
            continue
        digits = sum(c.isdigit() for c in t)
        if digits > max(3, len(t) // 4):
            continue
        if t.isupper() and len(t) > 6 and " " not in t:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out
