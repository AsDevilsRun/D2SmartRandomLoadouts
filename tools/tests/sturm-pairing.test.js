const { load } = require("./harness");
const assert = require("assert");
// Sturm always rolls with a Together Forever weapon on build.html (overriding No double primary); index.html doesn't pair.
const setup = `(() => {
  log = () => {};
  const W = (h, name, bucket, ammo, dmg, tier) => { state.defs[h] = { name, icon: "", itemType: 3, tier, bucket, ammo, classType: 3, typeName: "Sidearm", dmg, coll: 1, breaker: 0, set: 0 }; };
  W(9001, "Sturm", BUCKET.KINETIC, 1, 1, 6);
  W(9002, "Drang", BUCKET.ENERGY, 1, 3, 5);
  state.items.push({ id: "s1", hash: 9001, def: state.defs[9001], owner: "vault", equipped: false, power: 10, dmg: 1, energyCap: 0 });
  state.plugDefs[7777] = { n: "Together Forever" };
  state.socketData = state.socketData || { sockets: {} };
  window.addDrang = () => { state.items.push({ id: "d1", hash: 9002, def: state.defs[9002], owner: "vault", equipped: false, power: 10, dmg: 3, energyCap: 0 });
    state.socketData.sockets.d1 = { sockets: [{ plugHash: 7777 }] }; };
  window.sturmNeed = { types: [], names: ["sturm"], excl: [], label: "Sturm", test: i => norm(i.def.name) === "sturm" };
})()`;
(async () => {
  const h = await load("build.html");
  await h.ev(`ensureChampData()`);
  h.ev(setup);
  h.ev(`state.rules.noDoublePrimary = true; state.rules.guaranteedExoticWeapon = true`);
  // No Together Forever weapon owned: Drang placeholder to pull.
  let r = JSON.parse(h.ev(`JSON.stringify(rollWeaponsPaired(state.rules, 0, sturmNeed).map(i => [i.def.name, !!i.virtual]))`));
  assert.deepEqual(r[0], ["Sturm", false]);
  assert.deepEqual(r[1], ["Drang", true]);
  // Owned Drang with the perk: that copy, despite No double primary.
  h.ev(`addDrang()`);
  for (let k = 0; k < 20; k++) {
    r = JSON.parse(h.ev(`JSON.stringify(rollWeaponsPaired(state.rules, 0, sturmNeed).map(i => i.id))`));
    assert.equal(r[0], "s1"); assert.equal(r[1], "d1");
  }
  // Plug name missing from the definitions (lite download): matched by the plug's Together Forever perk hash.
  h.ev(`delete state.plugDefs[7777]; entCache.data.pp7777 = { b: 0, pk: [4242] }; entCache.data.tfPerks = [4242]`);
  r = JSON.parse(h.ev(`JSON.stringify(rollWeaponsPaired(state.rules, 0, sturmNeed).map(i => i.id))`));
  assert.equal(r[1], "d1", "perk-hash match");
  h.ev(`entCache.data.tfPerks = []`);
  r = JSON.parse(h.ev(`JSON.stringify(rollWeaponsPaired(state.rules, 0, sturmNeed).map(i => [i.def.name, !!i.virtual]))`));
  assert.deepEqual(r[1], ["Drang", true], "no match falls back to the placeholder");
  h.ev(`entCache.data.tfPerks = [4242]`);
  // Rolls without Sturm are untouched; Sturm always has its partner over many plain rolls.
  const plain = h.ev(`(() => { let bad = 0; for (let k = 0; k < 300; k++) { const w = rollWeaponsPaired(state.rules, 0, null);
    if (w.some(isSturm) && !w.some(i => i.id === "d1")) bad++; } return bad; })()`);
  assert.equal(plain, 0);
  // Rerolling the Kinetic slot away from Sturm drops a Drang placeholder.
  const orphan = h.ev(`(() => { state.items = state.items.filter(i => i.id !== "d1");
    state.roll.weapons = rollWeaponsPaired(state.rules, 0, sturmNeed);
    const w = rerollWeaponSlotPaired(state.rules, 0, BUCKET.KINETIC, null);
    return w.some(isSturm) || w.some(i => i.togetherForever); })()`);
  assert.equal(orphan, false);
  // Monochromatic Arc: the Solar Drang placeholder doesn't fit, so Sturm can't stay.
  assert.equal(h.ev(`pairSturm([state.items.find(i => i.id === "s1"), null, null].map((x, k) => x || { def: { bucket: WEAPON_BUCKETS[k], ammo: 3, name: "x" } }), state.rules, 2, null)`), null);

  const ix = await load("index.html");
  assert.equal(ix.ev(`typeof rollWeaponsPaired`), "undefined");
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
