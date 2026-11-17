const { load } = require("./harness");
const assert = require("assert");
// "Weapon need" (subclass_plugs.csv): Spark of Beacons rolls only with an Arc special or heavy weapon, alongside the exotic's need.
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(async () => {
    log = (m) => { logs.push(m); };
    const logs = [];
    state.rules.guaranteedExoticWeapon = false;
    const out = { wn: WEIGHT_PLUGS["spark of beacons"].wn };
    state.plugDefs[9101] = { n: "Spark of Beacons", c: "titan.arc.fragments" };
    state.plugDefs[9102] = { n: "Spark of Shock", c: "titan.arc.fragments" };
    WEIGHT_PLUGS["spark of shock"] = { k: "fragment", w: 1, t: [] };
    const sub = frags => ({ charId: selectedChar(), element: 2, info: { element: 2, s: { def: { name: "Striker" } } }, abilities: [], aspects: [], fragments: frags, tags: [] });
    const N = 300;
    const rate = (f, needs) => { let c = 0; for (let k = 0; k < N; k++) if (f(rollWeapons(state.rules, 0, needs ?? rollNeed(state.rules, 0)))) c++; return c / N; };
    const arcSH = i => i.dmg === 2 && i.def.ammo > 1;
    // Only "Arc Rocket" is an Arc special/heavy weapon in the test inventory.
    state.roll.subclass = sub([9101]);
    out.label = plugNeeds()[0].label;
    out.with = rate(ws => ws.some(arcSH));
    state.roll.subclass = sub([9102]);
    out.without = rate(ws => ws.some(arcSH));
    // Together with an exotic-style need in another slot (Solar Fusion, energy slot): both met.
    state.roll.subclass = sub([9101]);
    const solarSpec = needTest({ types: [], names: ["solar fusion"], excl: [], els: [], label: "Solar Fusion" });
    out.both = rate(ws => ws.some(arcSH) && ws.some(i => i.def.name === "Solar Fusion"), [solarSpec, ...plugNeeds().map(needTest)]);
    // Clashing with a need for the same slot (Solar Sword, power slot): the fragment's need drops, with a note.
    const sword = needTest({ types: [], names: ["solar sword"], excl: [], els: [], label: "Solar Sword" });
    logs.length = 0;
    const ws = rollWeaponsNeeds(state.rules, 0, [sword, ...plugNeeds().map(needTest)]);
    out.clash = { sword: ws.some(i => i.def.name === "Solar Sword"), note: logs.some(m => /Spark of Beacons.*ignoring it/.test(m)) };
    // Rerolling the power slot keeps an Arc special/heavy weapon there.
    state.roll.weapons = rollWeapons(state.rules, 0, allNeeds());
    let kept = 0;
    for (let k = 0; k < 50; k++) { state.roll.weapons = rerollWeaponSlotPaired(state.rules, 0, BUCKET.POWER, allNeeds()); if (state.roll.weapons.some(arcSH)) kept++; }
    out.kept = kept / 50;
    // A subclass reroll that adds Spark of Beacons swaps a weapon in.
    state.roll.weapons = state.roll.weapons.map(i => i.def.bucket === BUCKET.POWER ? state.items.find(x => x.def.name === "Solar Sword") : i);
    ensureWeaponNeed(state.rules, 0);
    out.ensured = state.roll.weapons.some(arcSH);
    // rollSubclass leaves Spark of Beacons out when no eligible weapon meets its need (Solar Monochromatic pool here).
    const info = { element: 2, s: { id: "S1", hash: 1, def: { name: "Striker" } }, cur: [],
      groups: { supers: [], abilities: [], aspects: [1], fragments: [0] }, choices: idx => idx === 1 ? [9103] : [9101, 9102] };
    state.plugDefs[9103] = { n: "Juggernaut", c: "titan.arc.aspects", k: 1 };
    getSubclassInfo = async () => [info];
    const count = async () => { let c = 0; for (let k = 0; k < 200; k++) if ((await rollSubclass(selectedChar(), null, info)).fragments.includes(9101)) c++; return c / 200; };
    out.eligible = await count();
    const keep = weaponPool;
    weaponPool = (rules, E) => keep(rules, E).filter(i => !arcSH(i));
    out.ineligible = await count();
    weaponPool = keep;
    return JSON.stringify(out);
  })()`));
  console.log(JSON.stringify(r));
  assert.deepEqual(r.wn, [{ el: 2, ammo: 2, type: "" }, { el: 2, ammo: 3, type: "" }]);
  assert.equal(r.label, "Arc Special or Arc Heavy weapon (Spark of Beacons)");
  assert.equal(r.with, 1, "Spark of Beacons always has an Arc special/heavy weapon");
  assert(r.without < 0.9, "without it, rolls are free");
  assert.equal(r.both, 1, "both needs met");
  assert.deepEqual(r.clash, { sword: true, note: true });
  assert.equal(r.kept, 1);
  assert.equal(r.ensured, true);
  assert(r.eligible > 0.2, "Spark of Beacons rolls when a weapon meets it");
  assert.equal(r.ineligible, 0, "never without one");
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message.slice(0, 800)); process.exit(1); });
