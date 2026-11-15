# Parity check on simulate.py's output: run after any change that affects randomness (see CLAUDE.md).
#   python3 tools/sim/parity.py [simulation output folder]      (default: tools/sim/out)
# Per class, compares each rate with an even share and fails if any falls outside its band:
#   exotic armor: within ARMOR_BAND of even (Roll build picks every eligible piece with equal odds, so only sampling noise)
#   subclasses:   within SUB_BAND of even (balanced exactly on every roll)
#   exotic weapons: within WEAPON_BAND of even (factors come from 20 simulated builds per armor piece, so some noise)
# Writes parity.csv (one row per class and group) next to the inputs. Exit code 1 if any group fails.
import csv, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
D = (sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out")) + os.sep
ARMOR_BAND, SUB_BAND, WEAPON_BAND = 0.15, 0.10, 0.35
CL = ["Hunter", "Titan", "Warlock"]

def rd(f): return list(csv.DictReader(open(D + f, encoding="utf-8")))

groups = defaultdict(list)   # (group, class) -> [(name, pct)]
for r in rd("exotic_armor.csv"): groups[("exotic armor", r["class"])].append((r["exotic"], float(r["rate_pct"])))
for r in rd("subclasses.csv"): groups[("subclasses", r["class"])].append((r["subclass"], float(r["rate_pct"])))
for r in rd("exotic_weapons.csv"):
    for c in CL: groups[("exotic weapons", c)].append((r["exotic"], float(r[c.lower() + "_pct"])))
band = {"exotic armor": ARMOR_BAND, "subclasses": SUB_BAND, "exotic weapons": WEAPON_BAND}

rows, failed = [], False
for (g, c) in sorted(groups, key=lambda k: (list(band).index(k[0]), CL.index(k[1]))):
    xs = groups[(g, c)]
    even = 100 / len(xs)
    lo, hi = min(xs, key=lambda x: x[1]), max(xs, key=lambda x: x[1])
    out = [n for n, p in xs if abs(p / even - 1) > band[g]]
    ok = not out
    failed |= not ok
    rows.append([g, c, len(xs), round(even, 3), lo[0], lo[1], hi[0], hi[1], round(lo[1] / even, 2), round(hi[1] / even, 2), f"±{int(band[g]*100)}%", "PASS" if ok else "FAIL", "; ".join(out)])
    print(f"{'PASS' if ok else 'FAIL'}  {g:15} {c:8} n={len(xs):3}  even {even:.2f}%  min {lo[1]:.2f}% ({lo[0]})  max {hi[1]:.2f}% ({hi[0]})" + (f"  outside ±{int(band[g]*100)}%: {', '.join(out)}" if out else ""))
with open(D + "parity.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["group", "class", "count", "even_pct", "min_name", "min_pct", "max_name", "max_pct", "min_vs_even", "max_vs_even", "band", "result", "outside_band"])
    w.writerows(rows)
print("FAILED" if failed else "ALL PASSED")
sys.exit(1 if failed else 0)
