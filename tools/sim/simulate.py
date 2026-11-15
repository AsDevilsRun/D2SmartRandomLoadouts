# Monte Carlo of build.html "Roll build", assuming every exotic and every subclass item is owned.
# Reads the repo's data/*.csv files and mirrors build.html's subclass, ability, aspect, fragment and exotic weapon picks,
# with subclass, ability and exotic weapon balancing on. See CLAUDE.md for how to run it and what it doesn't model.
#   python3 tools/sim/simulate.py [presses] [output folder]      (defaults: 60000, tools/sim/out)
import csv, json, math, os, random, sys, unicodedata
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..", "..", "data") + os.sep
INP = lambda f: os.path.join(HERE, "inputs", f)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
LEG_PER_TYPE = 5
random.seed(7)

def rd(f): return list(csv.DictReader(open(REPO + f, encoding="utf-8")))
def norm(s): return unicodedata.normalize("NFKD", (s or "").replace("’", "'")).encode("ascii", "ignore").decode().lower().strip()
def lst(v): return [x.strip() for x in (v or "").split(",") if x.strip()]

TAGW = {r["Tag"]: float(r["Points"]) for r in rd("tag_points.csv")}
TIER = {r["Tier"]: float(r["Weight"]) for r in rd("tiers.csv")}
PLUG = {r["Name"]: {"k": r["Kind"], "w": TIER.get(r["Tier"], 1), "t": lst(r["Tags"])} for r in rd("subclass_plugs.csv")}
PLUGN = {norm(k): k for k in PLUG}
ARM = {r["Exotic"]: {"c": r["Class"], "t": lst(r["Tags"]), "m": {norm(x) for x in lst(r["Mentions"])}} for r in rd("exotic_armor.csv")}
ARMN = {norm(k): k for k in ARM}
EXW = {r["Exotic"]: lst(r["Tags"]) for r in rd("exotic_weapons.csv")}
SYN = {norm(r["Exotic"]): r for r in rd("exotic_synergy.csv")}

ASP = json.load(open(INP("aspects.json"), encoding="utf-8"))              # class -> subclass -> aspects (Compendium)
SLOTS = json.load(open(INP("fragment_slots.json"), encoding="utf-8"))                  # aspect -> fragment slots (Endgame Analysis)
W = json.load(open(INP("exotic_weapons.json"), encoding="utf-8"))   # exotic weapon type / ammo / slot
PREFIX = {"solar": "Ember", "arc": "Spark", "void": "Echo", "stasis": "Whisper", "strand": "Thread", "prismatic": "Facet"}
FRAG = {e: [n for n, v in PLUG.items() if v["k"] == "fragment" and n.startswith(p + " ")] for e, p in PREFIX.items()}
SUBS = ["arc", "solar", "void", "stasis", "strand", "prismatic"]

def wpick(items, wf):
    ws = [wf(x) for x in items]; t = sum(ws)
    if t <= 0: return random.choice(items)
    r = random.random() * t
    for x, w in zip(items, ws):
        r -= w
        if r <= 0: return x
    return items[-1]
def wsample(items, n, wf):
    p, o = list(items), []
    while len(o) < n and p:
        x = wpick(p, wf); o.append(x); p.remove(x)
    return o

# ---- exotic armor rules ----
def rule(name):
    r = SYN.get(norm(name))
    if not r: return None
    g = lambda c: (r.get(c) or "").strip()
    return {"els": [e.lower() for e in lst(g("Elements"))], "prism": g("Prismatic OK").upper() == "Y",
            "aspects": lst(g("Aspects")), "prismNeeds": lst(g("Prismatic needs")),
            "types": lst(g("Weapon types")), "weapons": lst(g("Weapons")), "excl": {norm(x) for x in lst(g("Excluded weapons"))},
            "supers": lst(g("Supers")), "grenades": lst(g("Grenades")), "melees": lst(g("Melees")),
            "classAbilities": lst(g("Class abilities")), "movement": lst(g("Movement")), "forceEl": g("Force element ability").upper(),
            "force": g("Force weapon").upper() != "N", "orw": g("Or Weapon").upper().startswith("Y"), "share": parse_share(g("Or weapon share")), "chance": parse_share(g("Weapon chance")) if g("Weapon chance") else 0.0}
def parse_share(t):
    if not t: return 0.2
    x = float(t.rstrip("%"))
    return x / 100 if t.endswith("%") or x > 1 else x
def strict_fits(R, el):
    if not R: return True
    if el == "prismatic": return R["prism"] or "prismatic" in R["els"]
    only = [e for e in R["els"] if e != "prismatic"]
    if "prismatic" in R["els"] and not only: return False
    return not only or el in only
def odds(R, subs, w):
    if R and R["orw"] and (R["types"] or R["weapons"]):
        st = [s for s in subs if strict_fits(R, s)]; lo = [s for s in subs if s not in st]
        if st and lo:
            out = {}
            for grp, p in ((st, 1 - R["share"]), (lo, R["share"])):
                t = sum(w[s] for s in grp)
                for s in grp: out[s] = p * w[s] / t
            return out
    t = sum(w[s] for s in subs)
    return {s: w[s] / t for s in subs}
def fits(R, el):
    return strict_fits(R, el) or bool(R and R["orw"] and (R["types"] or R["weapons"]))

armor_by_class = defaultdict(list)
for n, a in ARM.items():
    if a["c"]: armor_by_class[a["c"]].append(n)

# balanceSubclassWeights, as in build.html
BAL = {}
for cls, names in armor_by_class.items():
    opts = [(n, [s for s in SUBS if fits(rule(n), s)]) for n in names]
    opts = [o for o in opts if o[1]]
    w = {s: 1.0 for s in SUBS}
    present = [s for s in SUBS if any(s in o[1] for o in opts)]
    target = 1 / len(present)
    for _ in range(200):
        share = defaultdict(float)
        for n, o in opts:
            od = odds(rule(n), o, w)
            for s in o: share[s] += od[s] / len(opts)
        for s in SUBS:
            if share[s] > 0: w[s] *= math.sqrt(target / share[s])
    BAL[cls] = (opts, w)

def plug_w(name, tags, mentions):
    v = PLUG.get(name)
    if not v: return 1
    sc = sum(TAGW.get(t, 1) for t in v["t"] if t in tags)
    b = 1 + min(sc, 6)
    if norm(name) in mentions: b *= 3
    return v["w"] * min(b, 10)

# ---- weapons ----
TYPES = sorted({v["type"] for v in W.values()})
AMMO_OF = {}
for v in W.values(): AMMO_OF.setdefault(v["type"], v["ammo"])
LEG = [{"name": f"(legendary {t})", "type": t, "ammo": AMMO_OF[t], "bucket": "power" if AMMO_OF[t] == "power" else ("kinetic" if i % 2 else "energy"), "exo": False}
       for t in TYPES for i in range(LEG_PER_TYPE)]
EXO = [{"name": n, **W[n], "exo": True} for n in EXW if n in W]
def meets(w, need):
    if norm(w["name"]) in need["excl"]: return False
    return w["name"] in need["weapons"] or w["type"] in need["types"]


def make_build(cls, armor=None):
    opts, bw = BAL[cls]
    name, subs = random.choice(opts) if armor is None else next(o for o in opts if o[0] == armor)
    od = odds(rule(name), subs, bw)
    el = wpick(subs, lambda s: od[s])
    R = rule(name); A = ARM[name]
    strict = strict_fits(R, el)
    tags, ment = set(A["t"]), A["m"]
    avail = ASP[cls][el]
    forced = []
    if R and strict:
        groups = [[x] for x in R["prismNeeds"]] if (el == "prismatic" and R["prismNeeds"]) else ([R["aspects"]] if R["aspects"] else [])
        for g in groups:
            opts_a = [a for a in g if a in avail and a not in forced]
            if opts_a and len(forced) < 2: forced.append(wpick(opts_a, lambda a: plug_w(a, tags, ment)))
    aspects = forced + wsample([a for a in avail if a not in forced], 2 - len(forced), lambda a: plug_w(a, tags, ment))
    for a in aspects: tags.update(PLUG.get(a, {"t": []})["t"])
    nf = sum(SLOTS.get(a, 2) for a in aspects)
    frags = wsample(FRAG[el], nf, lambda f: plug_w(f, tags, ment))
    for f in frags: tags.update(PLUG[f]["t"])
    need = {"types": R["types"], "weapons": R["weapons"], "excl": R["excl"]} if R and (R["types"] or R["weapons"]) else None
    hard = bool(need and ((R["orw"] and not strict) or (not R["orw"] and R["force"])))
    soft = bool(need and not hard)
    chance = R["chance"] if (soft and R) else 0
    return {"aspects": aspects, "frags": frags, "ment": ment, "atags": set(A["t"]), "cls": cls, "armor": name, "el": el, "tags": tags, "need": need, "hard": hard, "soft": soft, "chance": chance,
            "boost": soft and not chance, "moeb": cls == "Hunter" and el == "void" and random.random() < 1 / 3}

def raw_w(w, b):
    x = 1.0
    if w["exo"]:
        sc = sum(TAGW.get(t, 1) for t in EXW.get(w["name"], []) if t in b["tags"]); x = min(1 + min(sc, 6), 10)
    if b["moeb"] and w["type"] == "Combat Bow": x *= 4
    if b["boost"] and meets(w, b["need"]): x *= 4
    return x

NAMES = [w["name"] for w in EXO]; IDX = {n: i for i, n in enumerate(NAMES)}
def build_odds(b):
    free = [(IDX[w["name"]], raw_w(w, b)) for w in EXO]
    pf = 1.0 if b["hard"] else b["chance"]
    if not pf: return (0, free, [], 0)
    cands = [w for w in LEG + EXO if meets(w, b["need"])]
    if not cands: return (0, free, [], 0)
    legW = sum(raw_w(w, b) for w in cands if not w["exo"])
    return (pf, free, [(IDX[w["name"]], raw_w(w, b)) for w in cands if w["exo"]], legW)

def shares(builds, f):
    s = [0.0] * len(NAMES)
    for pf, free, forced, legW in builds:
        tf = sum(f[i] * w for i, w in free); to_free = 1.0
        if pf:
            tc = legW + sum(f[i] * w for i, w in forced)
            if tc > 0:
                for i, w in forced: s[i] += pf * f[i] * w / tc
                to_free = 1 - pf + pf * legW / tc
        for i, w in free: s[i] += to_free * f[i] * w / tf
    return [x / len(builds) for x in s]

def factors(cls, nb=400, per_armor=0):
    if per_armor:
        builds = [build_odds(make_build(cls, n)) for n, _ in BAL[cls][0] for _ in range(per_armor)]
    else:
        builds = [build_odds(make_build(cls)) for _ in range(nb)]
    f = [1.0] * len(NAMES); tgt = 1 / len(NAMES)
    for _ in range(150):
        s = shares(builds, f)
        f = [min(1000, max(0.001, fi * math.sqrt(tgt / si))) if si > 0 else fi for fi, si in zip(f, s)]
    return f

def roll(b, f):
    ww = lambda w: raw_w(w, b) * (f[IDX[w["name"]]] if w["exo"] else 1)
    hard = b["hard"] or (b["chance"] and random.random() < b["chance"])
    if hard:
        cands = {w["name"]: w for w in LEG + EXO if meets(w, b["need"])}
        if cands:
            p = wpick(list(cands.values()), ww)
            if p["exo"]: return p["name"]
            pool = [w for w in EXO if w["bucket"] != p["bucket"] and not (p["ammo"] in ("primary", "special") and w["ammo"] == p["ammo"])]
            return wpick(pool, ww)["name"]
    return wpick(EXO, ww)["name"]


AB = json.load(open(INP("abilities.json"), encoding="utf-8"))
AEL = json.load(open(INP("ability_elements.json"), encoding="utf-8"))
SLOTS_ORDER = ["super", "class", "movement", "melee", "grenade"]
def nm(x): return norm(x).replace("&", "and")
def has_reqs(R): return any(R[k] for k in ("supers", "grenades", "melees", "aspects"))   # as hasReqs in build.html
def groups_for(R, el):
    prism = el == "prismatic"
    gs = []
    lists = [[x] for x in R["prismNeeds"]] if (prism and R["prismNeeds"]) else [R["supers"], R["grenades"], R["melees"], R["aspects"]]
    for l in lists + [R["classAbilities"], R["movement"]]:
        if l: gs.append({"names": {nm(x) for x in l}})
    els = [e for e in R["els"] if e != "prismatic"]
    if prism and els and R["forceEl"] != "N" and not has_reqs(R) and not R["prismNeeds"]:
        gs.append({"element": set(els), "abilityOnly": True})
    return gs
def ab_meets(h, g, slot=None):
    if "names" in g: return nm(h) in g["names"]
    return slot in ("grenade", "melee") and AEL.get(h) in g["element"]


def forced_for(R, el, cls, tags, ment):
    choices = AB[cls][el]; avail = ASP[cls][el]; forced, fasp = {}, []
    if R and strict_fits(R, el):
        for g in groups_for(R, el):
            if any(ab_meets(h, g, s) for s, h in forced.items()) or any(ab_meets(a, g) for a in fasp): continue
            o = [(s, h) for s in SLOTS_ORDER if s not in forced for h in choices[s] if ab_meets(h, g, s)]
            ao = [] if g.get("abilityOnly") or len(fasp) >= 2 else [a for a in avail if ab_meets(a, g) and a not in fasp]
            if o:
                s_, h_ = wpick(o, lambda x: plug_w(x[1], tags, ment)); forced[s_] = h_
            elif ao: fasp.append(wpick(ao, lambda a: plug_w(a, tags, ment)))
    return forced
FAC = {}
for cls in ["Hunter", "Titan", "Warlock"]:
    opts, bw = BAL[cls]
    parts = defaultdict(list)
    for name, subs in opts:
        R = rule(name); A = ARM[name]; od = odds(R, subs, bw)
        tags, ment = set(A["t"]), A["m"]
        for el in subs:
            mass = od[el] / len(opts)
            cnts = defaultdict(Counter); n = 40 if (R and strict_fits(R, el)) else 0
            for _ in range(n):
                for s_, h_ in forced_for(R, el, cls, tags, ment).items(): cnts[s_][h_] += 1
            for s_ in SLOTS_ORDER:
                ch = AB[cls][el][s_]
                if not ch: continue
                fr = {h: c / n for h, c in cnts[s_].items()} if n else {}
                parts[(el, s_)].append((mass, fr, 1 - sum(fr.values()), {h: plug_w(h, tags, ment) for h in ch}))
    for k, plist in parts.items():
        hs = sorted({h for p in plist for h in p[3]}); tot = sum(p[0] for p in plist); f = {h: 1.0 for h in hs}
        for _ in range(120):
            sh = dict.fromkeys(hs, 0.0)
            for mass, fr, free, w in plist:
                for h, q in fr.items(): sh[h] += mass * q / tot
                t = sum(f[h] * x for h, x in w.items())
                for h, x in w.items(): sh[h] += mass * free * f[h] * x / t / tot
            f = {h: min(1000, max(0.001, f[h] * math.sqrt((1 / len(hs)) / sh[h]))) if sh[h] > 0 else f[h] for h in hs}
        FAC[(cls,) + k] = f

N = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
WF = {cls: factors(cls, per_armor=20) for cls in ["Hunter", "Titan", "Warlock"]}
C = defaultdict(Counter); NC = Counter(); NS = Counter(); AC = defaultdict(Counter)
for k in range(N):
    cls = ["Hunter", "Titan", "Warlock"][k % 3]
    b = make_build(cls); el = b["el"]; NC[cls] += 1; NS[(cls, el)] += 1
    C["sub"][(cls, el)] += 1; C["armor"][(cls, b["armor"])] += 1
    for a in b["aspects"]: C["asp"][(cls, el, a)] += 1
    for f in b["frags"]: C["frag"][(cls, el, f)] += 1
    C["wep"][(cls, roll(b, WF[cls]))] += 1
    R = rule(b["armor"]); tags, ment = b["atags"], b["ment"]
    forced = forced_for(R, el, cls, tags, ment)
    for s in SLOTS_ORDER:
        ch = AB[cls][el][s]
        if not ch: continue
        h = forced.get(s) or wpick(ch, lambda h: plug_w(h, tags, ment) * FAC.get((cls, el, s), {}).get(h, 1))
        AC[(cls, el)][(s, h)] += 1
import os
D = (sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "out")) + os.sep; os.makedirs(D, exist_ok=True)
ORD = ["Arc","Solar","Void","Stasis","Strand","Prismatic"]; CL = ["Hunter","Titan","Warlock"]
TL = {r["Tier"] for r in rd("tiers.csv")}
PT = {r["Name"]: r["Tier"] for r in rd("subclass_plugs.csv")}
WT = json.load(open(INP("exotic_weapon_tiers.json"), encoding="utf-8"))
def wcsv(f, hdr, rows):
    with open(D + f, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(hdr); w.writerows(rows)
wcsv("subclasses.csv", ["class","subclass","rate_pct"], [[c, e.capitalize(), round(100*v/NC[c], 2)] for (c, e), v in sorted(C["sub"].items(), key=lambda x: (CL.index(x[0][0]), ORD.index(x[0][1].capitalize())))])
wcsv("exotic_armor.csv", ["class","exotic","rate_pct"], [[c, n, round(100*v/NC[c], 2)] for (c, n), v in sorted(C["armor"].items(), key=lambda x: (CL.index(x[0][0]), -x[1]))])
names = sorted({n for (_, n) in C["wep"]})
tot = sum(NC.values())
wr = [[n, WT.get(n, ""), round(100*sum(C["wep"][(c, n)] for c in CL)/tot, 2)] + [round(100*C["wep"][(c, n)]/NC[c], 2) for c in CL] for n in names]
wcsv("exotic_weapons.csv", ["exotic","tier","all_pct","hunter_pct","titan_pct","warlock_pct"], sorted(wr, key=lambda r: -r[2]))
for key, f, col in (("asp", "aspects.csv", "aspect"), ("frag", "fragments.csv", "fragment")):
    rows = [[c, e.capitalize(), n, PT.get(n, ""), round(100*v/NS[(c, e)], 1)] for (c, e, n), v in C[key].items()]
    rows.sort(key=lambda r: (CL.index(r[0]), ORD.index(r[1]), -r[4]))
    wcsv(f, ["class","subclass",col,"tier","rate_pct"], rows)
order = {"super": 0, "grenade": 1, "melee": 2, "class": 3, "movement": 4}
rows = [[c, e.capitalize(), s, h, round(100*v/NS[(c, e)], 1)] for (c, e), cc in AC.items() for (s, h), v in cc.items()]
rows.sort(key=lambda r: (CL.index(r[0]), ORD.index(r[1]), order[r[2]], -r[4]))
wcsv("abilities.csv", ["class","subclass","slot","ability","rate_pct"], rows)
print("done", dict(NC))
