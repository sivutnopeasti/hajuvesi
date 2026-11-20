"""PubChemin vapaamuotoisten arvojen jäsentimet (höyrynpaine, kiehumispiste, hajukynnys).

PubChemin "Experimental Properties" -arvot ovat tekstiä, esim.
  "0.159 mm Hg at 23.5 °C", "21 Pa at 25 °C", "1.18X10-4 mm Hg at 25 °C",
  "Vapor pressure, Pa at 25 °C: 21", "Odor Threshold Low: 1.0 [ppm]".
"""

from __future__ import annotations

import math
import re

NUM = r"(\d+(?:\.\d+)?(?:\s*[x×]\s*10\s*\^?\s*[-+]?\s*\d+|e[-+]?\d+)?)"
RANGE_SEP = r"\s*(?:-|–|to)\s*"

PRESSURE_TO_MMHG = {
    "mmhg": 1.0,
    "mm": 1.0,
    "torr": 1.0,
    "pa": 1 / 133.322,
    "kpa": 7.50062,
    "hpa": 0.750062,
    "mbar": 0.750062,
    "bar": 750.062,
    "atm": 760.0,
    "psi": 51.7149,
}

PRESSURE_UNIT = r"(mm\s*hg|mmhg|mm|torr|kpa|hpa|mbar|pa|atm|bar|psi)\b"


def to_float(s: str) -> float:
    s = s.lower().replace("−", "-").replace(" ", "")
    m = re.match(r"^(\d+(?:\.\d+)?)[x×]10\^?([-+]?\d+)$", s)
    if m:
        return float(m.group(1)) * 10 ** int(m.group(2))
    return float(s)


def _norm(s: str) -> str:
    return s.lower().replace("−", "-").replace("º", "°").replace("deg ", "°")


def _unit_key(u: str) -> str:
    return re.sub(r"\s+", "", u.lower())


def temp_to_c(value: float, unit: str) -> float:
    unit = unit.lower()
    if unit == "f":
        return (value - 32) * 5 / 9
    if unit == "k":
        return value - 273.15
    return value


def _find_temp(text: str) -> float | None:
    m = re.search(r"(?:at|@|,)\s*(-?\d+(?:\.\d+)?)\s*°?\s*([cfk])\b", text)
    if m:
        return temp_to_c(float(m.group(1)), m.group(2))
    m = re.search(r"\(\s*(-?\d+(?:\.\d+)?)\s*°\s*([cfk])\s*\)", text)
    if m:
        return temp_to_c(float(m.group(1)), m.group(2))
    return None


def parse_vapor_pressure(raw: str) -> list[dict]:
    """Palauttaa listan {'mmhg', 'temp_c', 'estimated'}."""
    s = _norm(raw)
    if "negligible" in s:
        return []
    estimated = "(est" in s or "estimated" in s or "calculated" in s
    out: list[dict] = []

    # ICSC-muoto: "Vapor pressure, Pa at 25 °C: 21"
    m = re.search(
        r"vapou?r pressure[^:]*?,\s*(k?pa|mm\s*hg)\s*at\s*(-?\d+(?:\.\d+)?)\s*°?\s*([cfk])\s*:\s*" + NUM,
        s,
    )
    if m:
        unit = _unit_key(m.group(1))
        out.append(
            {
                "mmhg": to_float(m.group(4)) * PRESSURE_TO_MMHG[unit],
                "temp_c": temp_to_c(float(m.group(2)), m.group(3)),
                "estimated": estimated,
            }
        )
        return out

    pattern = re.compile(NUM + r"(?:" + RANGE_SEP + NUM + r")?\s*\[?\s*" + PRESSURE_UNIT, re.I)
    for m in pattern.finditer(s):
        v1 = to_float(m.group(1))
        v2 = to_float(m.group(2)) if m.group(2) else None
        value = math.sqrt(v1 * v2) if v2 and v1 > 0 and v2 > 0 else v1
        unit = _unit_key(m.group(3))
        rest = s[m.end() : m.end() + 40]
        temp = _find_temp(rest)
        if temp is None and len(out) == 0:
            temp = _find_temp(s)
        out.append({"mmhg": value * PRESSURE_TO_MMHG[unit], "temp_c": temp, "estimated": estimated})
    return [o for o in out if o["mmhg"] > 0]


def parse_boiling_point(raw: str) -> list[float]:
    """Normaalikiehumispisteet °C. Alennetun paineen arvot ohitetaan."""
    s = _norm(raw)
    pressures = re.findall(NUM + r"\s*\[?\s*" + PRESSURE_UNIT, s)
    for val, unit in pressures:
        mmhg = to_float(val) * PRESSURE_TO_MMHG[_unit_key(unit)]
        if abs(mmhg - 760) > 40:
            return []
    if "decompos" in s and not re.search(r"\d\s*°", s):
        return []
    out = []
    for m in re.finditer(NUM + r"(?:" + RANGE_SEP + NUM + r")?\s*°?\s*([cfk])\b", s):
        v1 = to_float(m.group(1))
        v2 = to_float(m.group(2)) if m.group(2) else None
        v = (v1 + v2) / 2 if v2 else v1
        c = temp_to_c(v, m.group(3))
        if 0 < c < 500:
            out.append(c)
            break  # ensimmäinen lämpötila on itse kiehumispiste
    return out


def parse_odor_threshold(raw: str, mw: float | None) -> list[float]:
    """Hajukynnykset ilmassa, ppm (v/v). Vesi-, maku- ja ärsytyskynnykset ohitetaan."""
    s = _norm(raw)
    if any(w in s for w in ("water", "taste", "in oil", "irritat", "pungen", "flavor")):
        return []
    out = []
    for m in re.finditer(
        NUM + r"\s*\[?\s*(ppm|ppb|ppt|mg/cu\s*m|mg/m3|mg/m³|ug/cu\s*m|µg/cu\s*m|ug/m3|µg/m3|µg/m³)",
        s,
    ):
        v = to_float(m.group(1))
        unit = re.sub(r"\s+", "", m.group(2))
        if unit == "ppm":
            ppm = v
        elif unit == "ppb":
            ppm = v / 1e3
        elif unit == "ppt":
            ppm = v / 1e6
        elif unit.startswith("mg"):
            if not mw:
                continue
            ppm = v * 24.45 / mw
        else:
            if not mw:
                continue
            ppm = v * 24.45 / mw / 1e3
        if ppm > 0:
            out.append(ppm)
    return out


def geometric_mean(values: list[float]) -> float:
    return math.exp(sum(math.log(v) for v in values) / len(values))


def log_median(values: list[float]) -> float:
    logs = sorted(math.log(v) for v in values)
    n = len(logs)
    mid = logs[n // 2] if n % 2 else (logs[n // 2 - 1] + logs[n // 2]) / 2
    return math.exp(mid)


def cas_is_valid(cas: str) -> bool:
    m = re.fullmatch(r"(\d{2,7})-(\d{2})-(\d)", cas)
    if not m:
        return False
    digits = (m.group(1) + m.group(2))[::-1]
    return sum((i + 1) * int(d) for i, d in enumerate(digits)) % 10 == int(m.group(3))


def grain_watson_vp(tb_k: float, t_k: float = 298.15, kf: float = 1.0) -> float:
    """Höyrynpaineen arvio (mmHg) normaalikiehumispisteestä, modifioitu Grain–Watson-menetelmä.

    Käytetään vain, kun mitattua höyrynpainetta ei ole. Tarkkuus on tyypillisesti kertoimen 2–5 luokkaa.
    """
    rho = t_k / tb_k
    m = 0.4133 - 0.2575 * rho
    r_cal = 1.987
    d_sb = kf * (8.75 + r_cal * math.log(tb_k))
    bracket = 1 - (3 - 2 * rho) ** m / rho - 2 * m * (3 - 2 * rho) ** (m - 1) * math.log(rho)
    ln_p_atm = d_sb / r_cal * bracket
    return math.exp(ln_p_atm) * 760
