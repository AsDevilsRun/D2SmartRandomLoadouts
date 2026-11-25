const { load } = require("./harness");
const assert = require("assert");
// A Special trace rifle always rolls with another Special weapon (overriding No double special), on both pages.
// Primary trace rifles aren't paired.
const setup = `(() => {
  log = () => {};
  const W = (h, id, name, bucket, ammo, dmg, tier) => {
    state.defs[h] = { name, icon: "", itemType: 3, tier, bucket, ammo, classType: 3, typeName: "Trace Rifle", dmg, coll: 1, breaker: 0, set: 0 };
    state.items.push({ id, hash: h, def: state.defs[h], owner: "vault", equipped: false, power: 10, dmg, energyCap: 0 });
  };
  W(9101, "t1", "Void Trace", BUCKET.ENERGY, 2, 4, 5);
  W(9102, "t2", "Exotic Trace", BUCKET.ENERGY, 2, 2, 6);
  W(9103, "t3", "Primary Trace", BUCKET.ENERGY, 1, 2, 5);
  window.traceBad = w => w.some(i => isSpecialTrace(i) && !w.some(o => o !== i && o.def.ammo === 2));
  window.doubleSpecialNoTrace = w => w.filter(i => i.def.ammo === 2).length > 1 && !w.some(isSpecialTrace);
})()`;

async function check(page, roll, reroll) {
  const h = await load(page);
  await h.ev(`ensureChampData()`);
  h.ev(setup);
  for (const exo of [false, true]) {
    h.ev(`Object.assign(state.rules, { noDoublePrimary: true, noDoubleSpecial: true, guaranteedDoubleSpecial: false, guaranteedExoticWeapon: ${exo}, mono: false })`);
    const r = JSON.parse(h.ev(`(() => { let bad = 0, dbl = 0, trace = 0, paired = 0;
      for (let k = 0; k < 400; k++) { const w = ${roll};
        if (traceBad(w)) bad++; if (doubleSpecialNoTrace(w)) dbl++;
        if (w.some(isSpecialTrace)) { trace++; if (w.filter(i => i.def.ammo === 2).length > 1) paired++; } }
      return JSON.stringify({ bad, dbl, trace, paired }); })()`));
    assert.equal(r.bad, 0, `${page} exo=${exo}: unpaired Special trace rifle`);
    assert.equal(r.dbl, 0, `${page} exo=${exo}: double special without a trace rifle`);
    assert.ok(r.trace > 0 && r.paired === r.trace, `${page} exo=${exo}: trace rifles roll and pair (${JSON.stringify(r)})`);
  }
  // Rerolling the Kinetic slot next to a Special trace rifle keeps a Special weapon there.
  h.ev(`state.rules.guaranteedExoticWeapon = false`);
  const kin = JSON.parse(h.ev(`(() => { const out = new Set(); let tries = 0;
    while (tries++ < 2000 && out.size < 30) { state.roll.weapons = ${roll}; if (!state.roll.weapons.some(isSpecialTrace)) continue;
      const w = ${reroll}; out.add(w.find(i => i.def.bucket === BUCKET.KINETIC).def.ammo); if (traceBad(w)) return JSON.stringify("bad"); }
    return JSON.stringify([...out]); })()`));
  assert.deepEqual(kin, [2], `${page}: Kinetic reroll beside a trace rifle`);
  // No double primary off: a Primary trace rifle can roll with a Primary Kinetic weapon.
  h.ev(`state.rules.noDoublePrimary = false`);
  const prim = h.ev(`(() => { for (let k = 0; k < 2000; k++) { const w = ${roll};
    if (w.some(i => i.id === "t3") && w.find(i => i.def.bucket === BUCKET.KINETIC).def.ammo === 1) return true; } return false; })()`);
  assert.equal(prim, true, `${page}: Primary trace rifle isn't paired`);
  h.ev(`state.rules.noDoublePrimary = true`);
  // Sturm-style replacement checks: a set with an unpaired Special trace rifle fails specialAmmoOK.
  assert.equal(h.ev(`specialAmmoOK(state.rules, [{ def: { ammo: 1, bucket: BUCKET.KINETIC } }, state.items.find(i => i.id === "t1")])`), false);
}

(async () => {
  await check("index.html", "rollWeapons(state.rules, 0)", "rerollWeaponSlot(state.rules, 0, BUCKET.KINETIC)");
  await check("build.html", "rollWeaponsPaired(state.rules, 0, null)", "rerollWeaponSlotPaired(state.rules, 0, BUCKET.KINETIC, null)");
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
