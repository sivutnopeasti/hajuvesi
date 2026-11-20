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


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
    print(f"OK: {len(tests)} testiä")
