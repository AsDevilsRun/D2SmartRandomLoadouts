const { load } = require("./harness");
const assert = require("assert");
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(async () => {
    state.plugDefs[9001] = { n: "Blade Barrage", c: "hunter.solar.supers" };
    state.plugDefs[9002] = { n: "Golden Gun: Deadshot", c: "hunter.solar.supers" };
    state.plugDefs[9003] = { n: "Golden Gun: Marksman", c: "hunter.solar.supers" };
    WEIGHT_PLUGS["blade barrage"] = { k: "ability", w: 1, t: ["melee", "scorch"] };
    WEIGHT_PLUGS["golden gun: deadshot"] = { k: "ability", w: 1, t: [] };
    WEIGHT_PLUGS["golden gun: marksman"] = { k: "ability", w: 1, t: [] };
    WEIGHT_EXOTICS["helm a"] = { t: ["melee", "scorch"], m: [], c: "Titan" };
    WEIGHT_EXOTICS["helm b"] = { t: [], m: [], c: "Titan" };
    const info = { element: 3, s: { id: "S1", hash: 1, def: { name: "Sunbreaker" } },
      groups: { supers: [0], abilities: [], aspects: [], fragments: [] }, choices: () => [9001, 9002, 9003] };
    getSubclassInfo = async () => [info];
    subclassOptions = async () => ({ infos: [info], names: ["Helm A", "Helm B"], options: [{ n: "Helm A", rule: null, infos: [info] }, { n: "Helm B", rule: null, infos: [info] }] });
    log = () => {};
    const count = async () => {
      const c = { all: {}, A: {}, B: {} }; const N = 3000;
      for (let k = 0; k < N; k++) {
        const ex = k % 2 ? "Helm A" : "Helm B";
        const s = await rollSubclass(selectedChar(), ex, info);
        const n = plugName(s.abilities[0].hash);
        c.all[n] = (c.all[n] || 0) + 1 / N; c[ex.slice(-1)][n] = (c[ex.slice(-1)][n] || 0) + 2 / N;
      }
      return c;
    };
    const before = await count();
    await ensureAbilityBalance(selectedChar(), selectedClass());
    const after = await count();
    return JSON.stringify({ before, after });
  })()`));
  console.log(JSON.stringify(r, null, 1));
  assert(r.before.all["Blade Barrage"] > 0.45);
  for (const v of Object.values(r.after.all)) assert(Math.abs(v - 1 / 3) < 0.04, JSON.stringify(r.after.all));
  assert(r.after.A["Blade Barrage"] > r.after.B["Blade Barrage"] * 2, "synergy kept");
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
