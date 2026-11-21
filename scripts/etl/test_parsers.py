"""Jäsentimien testit. Ajo: python scripts/etl/test_parsers.py"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from parsers import (  # noqa: E402
    cas_is_valid,
    grain_watson_vp,
    parse_boiling_point,
    parse_odor_threshold,
    parse_vapor_pressure,
    to_float,
)
from descriptors import choose_name, family_from_descriptors, pretty_name, search_synonyms  # noqa: E402


def close(a, b, rel=0.02):
    return abs(a - b) <= rel * abs(b)


def test_to_float():
    assert close(to_float("1.18X10-4"), 1.18e-4)
    assert close(to_float("2.24x10-4"), 2.24e-4)
    assert close(to_float("5.0e-3"), 5e-3)


def test_vapor_pressure():
    r = parse_vapor_pressure("0.16 [mmHg]")
    assert len(r) == 1 and close(r[0]["mmhg"], 0.16) and r[0]["temp_c"] is None

    r = parse_vapor_pressure("0.159 mm Hg at 23.5 °C")
    assert close(r[0]["mmhg"], 0.159) and close(r[0]["temp_c"], 23.5)

    r = parse_vapor_pressure("21 Pa at 25 °C")
    assert close(r[0]["mmhg"], 0.1575) and r[0]["temp_c"] == 25

    r = parse_vapor_pressure("1.18X10-4 mm Hg at 25 °C")
    assert close(r[0]["mmhg"], 1.18e-4)

    r = parse_vapor_pressure("1 mmHg at 225 °F (NTP, 1992)")
    assert close(r[0]["temp_c"], 107.2, 0.01)

    r = parse_vapor_pressure("Vapor pressure, Pa at 25 °C: 21")
    assert close(r[0]["mmhg"], 0.1575) and r[0]["temp_c"] == 25

    assert parse_vapor_pressure("Vapor pressure, Pa at 25 °C: (negligible)") == []

    r = parse_vapor_pressure("5.04X10-3 mm Hg at 25 °C (est)")
    assert r[0]["estimated"] is True

    r = parse_vapor_pressure("0.01-0.04 mm Hg at 20 °C")
    assert close(r[0]["mmhg"], 0.02)

    r = parse_vapor_pressure("15.5 mmHg at 77 °F ; 31.3 mmHg at 108 °F (NTP, 1992)")
    assert close(r[0]["temp_c"], 25) and close(r[1]["temp_c"], 42.2, 0.01)

    assert parse_vapor_pressure("VP: 1 mm Hg at 78.4 °C. Percent in saturated air: approx 0.004 at 25 °C, 760 mm Hg")[0]["temp_c"] == 78.4
    assert len(parse_vapor_pressure("VP: 1 mm Hg at 78.4 °C. Percent in saturated air: approx 0.004 at 25 °C, 760 mm Hg")) == 1
    assert parse_vapor_pressure("VP: 5 mm Hg at 80 to 81 mm Hg /L-alpha-Terpineol/") == []
    assert parse_vapor_pressure("VP: 5 mm Hg, temp not specified") == []
    assert parse_vapor_pressure("Vapor pressure range 1-760 mm Hg in the temperature range 63.8-233.0 °C") == []
    assert close(parse_vapor_pressure("3.0X01-2 mm Hg at 25 °C (extrapolated)")[0]["mmhg"], 0.03)

    r = parse_vapor_pressure("0.123 mm Hg at 25 °C (extrapolated)")
    assert close(r[0]["mmhg"], 0.123) and r[0]["temp_c"] == 25


def test_boiling_point():
    assert close(parse_boiling_point("198 °C")[0], 198)
    assert close(parse_boiling_point("388 °F at 760 mm Hg")[0], 197.8, 0.01)
    assert parse_boiling_point("85 °C at 10 mm Hg") == []
    assert close(parse_boiling_point("198-199 °C")[0], 198.5)
    assert parse_boiling_point("94.00 to 95.00 °C. @ 18.00 mm Hg") == []
    assert parse_boiling_point("116 °C at 13 mm") == []


def test_odor_threshold():
    assert close(parse_odor_threshold("Odor Threshold Low: 1.0 [ppm]", 154.25)[0], 1.0)
    assert close(parse_odor_threshold("Odor detection threshold in air: 4 ppb", 154.25)[0], 0.004)
    assert parse_odor_threshold("Odor threshold in water: 6 ppb", 154.25) == []
    v = parse_odor_threshold("0.5 mg/cu m", 154.25)[0]
    assert close(v, 0.5 * 24.45 / 154.25)


def test_cas():
    assert cas_is_valid("78-70-6")
    assert cas_is_valid("64-17-5")
    assert not cas_is_valid("78-70-5")


def test_grain_watson():
    # Limoneeni: Tb 176 °C, mitattu 1,55 mmHg (25 °C)
    est = grain_watson_vp(449.15, kf=1.0)
    assert 0.5 < est / 1.55 < 2, est
    # Linalooli: Tb 198 °C, mitattu 0,16 mmHg; alkoholin korjauskerroin
    est = grain_watson_vp(471.15, kf=1.22)
    assert 0.33 < est / 0.16 < 3, est
    assert math.isfinite(est)


def test_pretty_name():
    assert pretty_name("alpha-pinene") == "α-Pinene"
    assert pretty_name("(+)-beta-caryophyllene") == "(+)-β-Caryophyllene"
    assert pretty_name("cis-3-hexenol") == "cis-3-Hexenol"
    assert pretty_name("(e)-2-hexenal") == "(E)-2-Hexenal"
    assert pretty_name("(2e,6z)-nona-2,6-dienal") == "(2E,6Z)-Nona-2,6-dienal"
    assert pretty_name("methyl dihydrojasmonate") == "Methyl dihydrojasmonate"
    assert pretty_name("4-isopropylbenzyl alcohol") == "4-Isopropylbenzyl alcohol"
    assert pretty_name("Galaxolide") == "Galaxolide"
    assert choose_name("28940-11-6", "Watermelon ketone", None) == "Watermelon ketone"
    assert pretty_name("tetrahydro-4-methyl-2-phenyl-2h-pyran") == "Tetrahydro-4-methyl-2-phenyl-2H-pyran"
    assert choose_name("unii-if3n774v66", "Isobutyl angelate", None) == "Isobutyl angelate"
    assert choose_name("cyclohexanol, 1-methyl-4-(1-methylethyl)-", "Dihydroterpineol", None) == "Dihydroterpineol"


def test_family_from_descriptors():
    assert family_from_descriptors(["Floral", "Rose", "Sweet"])[0] == "kukka"
    assert family_from_descriptors(["Aldehydic", "Waxy", "Citrus"])[0] == "raikas"
    assert family_from_descriptors(["Sulfurous", "Tropical-Fruit", "Green"])[0] == "hedelma"
    assert family_from_descriptors(["Sulfurous", "Onion"])[0] == "vihrea"
    assert family_from_descriptors(["Acidic", "Cheesy", "Fatty"])[0] == "myski"
    assert family_from_descriptors(["Musk like", "Powdery"]) == ("myski", True)
    assert family_from_descriptors(["Woody", "Mystery"])[1] is False


def test_search_synonyms():
    syns = ["methyl dihydrojasmonate", "24851-98-7", "Hedione", "EINECS 246-495-9", "UNII-1B8J2S1T0N",
            "Methyl (3-oxo-2-pentylcyclopentyl)acetate", "DTXSID4029303", "Kharismal", "MDJ", "HSDB 7495"]
    got = search_synonyms(syns, exclude={"Methyl dihydrojasmonate"})
    assert got == ["Hedione", "Kharismal", "MDJ"], got


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
    print(f"OK: {len(tests)} testiä")
