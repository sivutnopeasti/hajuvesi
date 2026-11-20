"""Hajuvesityokalun prototyyppi: monikomponenttinen haihtuminen (Raoult) + odor value.

Tarkoitus: osoittaa, etta ehdotettu algoritmi tuottaa jarkevan top/heart/base-kayttaytymisen.
Arvot ovat likiarvoja; osa kynnysarvoista on arvioita (merkitty 'arvio').
"""
import json
import math

import numpy as np
from scipy.integrate import solve_ivp

R = 8.314
P_ATM = 101325.0
MMHG = 133.322

# name: (MW g/mol, VP25 mmHg, dHvap kJ/mol (arvio), ODT ppm v/v, perhe, lahde_vp, lahde_odt)
MOL = {
    "etanoli":            (46.07, 59.0,     42.3, 2.3,    "alkoholi",  "kirjallisuus", "Abraham 2012"),
    "limoneeni":          (136.24, 1.55,    49.0, 1.2,    "sitrus",    "PubChem/HSDB", "Abraham 2012 (geom. ka.)"),
    "beeta-pineeni":      (136.24, 2.9,     48.0, 0.62,   "havu",      "arvio",        "Abraham 2012"),
    "gamma-terpineeni":   (136.24, 1.1,     49.0, 9.8,    "sitrus",    "arvio",        "Abraham 2012"),
    "1,8-sineoli":        (154.25, 1.9,     46.0, 0.1,    "havu",      "arvio",        "arvio"),
    "kamferi":            (152.23, 0.65,    53.0, 0.05,   "havu",      "arvio",        "arvio"),
    "linalooli":          (154.25, 0.16,    60.0, 0.95,   "kukka",     "PubChem/HSDB", "Abraham 2012"),
    "linalyyliasetaatti": (196.29, 0.111,   58.0, 0.1,    "kukka",     "PubChem/HSDB", "arvio"),
    "beeta-karyofylleeni":(204.36, 0.013,   65.0, 0.06,   "puu",       "arvio",        "arvio"),
    "seskviterpeenit":    (204.36, 0.005,   66.0, 0.5,    "puu",       "arvio",        "arvio"),
    "patsulioli":         (222.37, 3e-4,    80.0, 4.4e-7, "puu",       "arvio",        "Park 2012"),
    "bentsyylibentsoaatti":(212.24, 2.24e-4,75.0, 0.3,    "balsami",   "PubChem/HSDB", "arvio"),
    "vanilliini":         (152.15, 1.18e-4, 85.0, 3e-4,   "balsami",   "PubChem/HSDB", "arvio"),
    "hartsi (haihtumaton)":(400.0, 0.0,     0.0,  1e9,    "-",         "-",            "-"),
}

# Raaka-aineiden tyypilliset koostumukset (massa-%), likimaaraisia
OILS = {
    "bergamotti": {"limoneeni": 40, "linalyyliasetaatti": 30, "linalooli": 10, "gamma-terpineeni": 8, "beeta-pineeni": 7},
    "laventeli": {"linalooli": 35, "linalyyliasetaatti": 38, "1,8-sineoli": 2, "kamferi": 0.5, "beeta-karyofylleeni": 4},
    "patsuli": {"patsulioli": 32, "seskviterpeenit": 28, "beeta-karyofylleeni": 3},
    "bentsoe (50 % BB:ssa)": {"bentsyylibentsoaatti": 55, "vanilliini": 1.5, "hartsi (haihtumaton)": 43.5},
}

FORMULA_G = {"bergamotti": 3.0, "laventeli": 2.5, "patsuli": 0.4, "bentsoe (50 % BB:ssa)": 1.1}
ETHANOL_G = 21.0  # 7 g oljyja / 28 g = 25 %

NAMES = list(MOL)


def composition():
    mass = {n: 0.0 for n in NAMES}
    for oil, g in FORMULA_G.items():
        for comp, pct in OILS[oil].items():
            mass[comp] += g * pct / 100.0
    mass["etanoli"] += ETHANOL_G
    return np.array([mass[n] for n in NAMES])


def psat(name, T):
    mw, vp25, dh, *_ = MOL[name]
    if vp25 == 0:
        return 0.0
    return vp25 * MMHG * math.exp(-dh * 1000 / R * (1 / T - 1 / 298.15))


def simulate(T, dose_mg_cm2=3.0, k_ref=1e-3, phi=0.05, t_end_h=24, gamma=None):
    """Palauttaa ajat (min), jaljella olevat moolit ja OV:t.

    k_ref: kaasufaasin aineensiirtokerroin etanolille [m/s]; muille skaalataan
           diffuusiokertoimella D ~ MW^-0.5 ja Sh ~ Sc^(1/3) -> k ~ D^(2/3).
    phi:   laimennuskerroin pinnan hoyryfaasista nenaan (kalibroitava parametri).
    """
    m0 = composition()
    frac = m0 / m0.sum()
    m_area = dose_mg_cm2 * 1e-6 / 1e-4  # kg/m2
    mw = np.array([MOL[n][0] for n in NAMES]) / 1000.0
    n0 = frac * m_area / mw  # mol/m2
    P = np.array([psat(n, T) for n in NAMES])
    k = k_ref * (mw / mw[0]) ** (-1.0 / 3.0)  # (MW^-0.5)^(2/3)
    g = np.ones(len(NAMES)) if gamma is None else gamma

    def rhs(t, n):
        n = np.clip(n, 0, None)
        tot = n.sum()
        if tot <= 0:
            return np.zeros_like(n)
        x = n / tot
        return -k * g * x * P / (R * T)

    t_eval = np.concatenate([[0], np.logspace(-1, math.log10(t_end_h * 60), 400)]) * 60
    sol = solve_ivp(rhs, (0, t_eval[-1]), n0, t_eval=t_eval, method="LSODA", rtol=1e-6, atol=1e-14)
    n = np.clip(sol.y, 0, None)
    x = n / n.sum(axis=0)
    y_surface_ppm = x * g[:, None] * P[:, None] / P_ATM * 1e6
    c_nose = phi * y_surface_ppm
    odt = np.array([MOL[nm][3] for nm in NAMES])[:, None]
    ov = c_nose / odt
    remaining = n / n0[:, None].clip(1e-30)
    return sol.t / 60.0, remaining, ov


def perceived(ov, n_exp=0.5):
    psi = np.where(ov > 1, ov ** n_exp, 0.0)
    return psi


def report(T, label):
    t, rem, ov = simulate(T)
    psi = perceived(ov)
    out = {"label": label, "T": T, "rows": []}
    for tm in [1, 10, 30, 60, 180, 480]:
        i = int(np.argmin(abs(t - tm)))
        tot = psi[:, i].sum()
        row = {"t_min": tm, "molecules": []}
        for j, nm in enumerate(NAMES):
            if nm.startswith("hartsi"):
                continue
            row["molecules"].append({
                "name": nm,
                "remaining_pct": round(100 * rem[j, i], 1),
                "OV": float(f"{ov[j, i]:.3g}"),
                "share_pct": round(100 * psi[j, i] / tot, 1) if tot > 0 else 0,
            })
        out["rows"].append(row)
    # lifetime: time when remaining < 10 %
    life = {}
    for j, nm in enumerate(NAMES):
        if nm.startswith("hartsi"):
            continue
        idx = np.where(rem[j] < 0.1)[0]
        life[nm] = round(float(t[idx[0]]), 1) if len(idx) else None
    out["t90_min"] = life
    return out, t, psi


if __name__ == "__main__":
    skin, t_s, psi_s = report(305.15, "iho 32 C")
    paper, t_p, psi_p = report(295.15, "paperi 22 C")
    print(json.dumps({"skin": skin, "paper": paper}, ensure_ascii=False, indent=1)[:6000])
    # share table for charts: family shares at selected times
    fam = {}
    for nm in NAMES:
        fam.setdefault(MOL[nm][4], []).append(NAMES.index(nm))
    times = [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480]
    rows = []
    for tm in times:
        i = int(np.argmin(abs(t_s - tm)))
        tot = psi_s[:, i].sum()
        for f, idxs in fam.items():
            if f == "-":
                continue
            rows.append({"t": tm, "family": f, "share": round(100 * psi_s[idxs, i].sum() / tot, 1) if tot else 0})
    json.dump(rows, open("family_shares_skin.json", "w"), ensure_ascii=False)
    print("t90 skin", skin["t90_min"])
    print("t90 paper", paper["t90_min"])
