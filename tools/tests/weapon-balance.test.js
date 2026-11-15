const { load } = require("./harness");
const assert = require("assert");
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(async () => {
    BUILD_WEIGHTS.exw["Exotic Kinetic"] = ["scorch"]; EXW_TAGS = null;
    state.rules.unownedExotics = true; state.rules.mono = false;
    const fakeInfo = { element: 3, s: { def: { name: "Dawnblade" } } };
    subclassOptions = async () => ({ infos: [fakeInfo], names: ["Exotic Helm", "Other Helm"], options: [{ n: "Exotic Helm", rule: null, infos: [fakeInfo] }, { n: "Other Helm", rule: null, infos: [fakeInfo] }] });
    let alt = 0;
    rollSubclass = async (cid) => ({ charId: cid, info: { element: 3, s: { def: { name: "Dawnblade" } } }, abilities: [], aspects: [], fragments: [], element: 3,
                                     tags: alt++ % 2 ? ["scorch"] : ["melee"] });
    const count = () => {
      const c = {}; const N = 3000;
      for (let k = 0; k < N; k++) {
        state.roll.subclass = { charId: selectedChar(), element: 3, abilities: [], aspects: [], fragments: [], info: { s: { def: { name: "Dawnblade" } } }, tags: Math.random() < 0.5 ? ["scorch"] : ["melee"] };
        const e = rollWeapons(state.rules, 0).find(isExo); c[e.def.name] = (c[e.def.name] || 0) + 1 / N;
      }
      return c;
    };
    const before = count();
    await ensureWeaponBalance(selectedChar(), selectedClass());
    const f = { ...wbal.f };
    const after = count();
    const key = wbal.key; wbal.key = ""; wbal.f = null;
    await ensureWeaponBalance(selectedChar(), selectedClass());   // should come from the cache
    let on = 0, onN = 0, off = 0, offN = 0;
    for (let k = 0; k < 4000; k++) {
      const sc = Math.random() < 0.5;
      state.roll.subclass = { charId: selectedChar(), element: 3, abilities: [], aspects: [], fragments: [], info: { s: { def: { name: "Dawnblade" } } }, tags: sc ? ["scorch"] : ["melee"] };
      const hit = rollWeapons(state.rules, 0).find(isExo).def.name === "Exotic Kinetic";
      if (sc) { onN++; on += hit; } else { offN++; off += hit; }
    }
    return JSON.stringify({ synergy: { scorch: on / onN, other: off / offN }, before, after, f, cached: wbal.key === key && wbal.f["exotic kinetic"] === f["exotic kinetic"] });
  })()`));
  console.log(r);
  assert(r.synergy.scorch > r.synergy.other * 1.6, "synergy kept");
  const lines = (h.log().match(/Exotic weapons balanced/g) || []).length;
  assert.equal(lines, 1, "balanced once, then cached");
  assert(r.cached);
  assert(r.before["Exotic Kinetic"] > 0.4);
  for (const v of Object.values(r.after)) assert(Math.abs(v - 1 / 3) < 0.04, JSON.stringify(r.after));
  console.log(h.log().split("\n").find(l => /balanced/.test(l)));
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
