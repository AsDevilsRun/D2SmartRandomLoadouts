const { load } = require("./harness");
const assert = require("assert");
(async () => {
  const h = await load("build.html");
  assert.equal(h.ev(`state.sheet["celestial nighthawk"].orWeaponShare`), 0.2);
  assert.equal(h.ev(`state.sheet["stronghold"].orWeaponShare`), 0.2);
  assert.deepEqual([h.ev(`parseShare("35%", 0.2)`), h.ev(`parseShare("0.35", 0.2)`), h.ev(`parseShare("35", 0.2)`), h.ev(`parseShare("", 0.2)`)], [0.35, 0.35, 0.35, 0.2]);
  const res = JSON.parse(await h.ev(`(async () => {
    const els = ["arc","solar","void","stasis","strand","prismatic"];
    const infos = els.map(el => ({ el, s: { def: { name: el } } }));
    getSubclassInfo = async () => infos;
    const nh = { name: "Exotic Helm", orWeapon: true, orWeaponShare: 0.2, weaponTypes: [], weapons: ["Still Hunt"] };
    exoticRule = () => nh;
    orWeaponReady = (r) => !!r.orWeapon;
    strictSubclassFits = (r, i) => i.el === "solar" || i.el === "prismatic";
    log = () => {};
    const c = {}, N = 20000;
    for (let k = 0; k < N; k++) { const { info } = await pickSubclassAndExotic("C1", 0); c[info.el] = (c[info.el] || 0) + 1; }
    for (const k in c) c[k] = c[k] / N;
    // Roll Subclass path (no balancing): same split
    const cands = infos; const odds = subclassOdds(nh, cands, null);
    return JSON.stringify({ c, odds: Object.fromEntries([...odds].map(([i, x]) => [i.el, x])) });
  })()`));
  console.log(res);
  const strict = res.c.solar + res.c.prismatic;
  assert(Math.abs(strict - 0.8) < 0.015, "strict share " + strict);
  assert(Math.abs(res.odds.solar - 0.4) < 1e-9 && Math.abs(res.odds.arc - 0.05) < 1e-9);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
