const { load } = require("./harness");
const assert = require("assert");
// Foetracer: one weapon matches the element of the rolled grenade, melee or super; heavy weapons preferred for that pick.
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(() => {
    log = () => {};
    state.rules.guaranteedExoticWeapon = false;
    const row = state.sheet["foetracer"];
    const out = { row: { el: row.weaponElement, ammo: row.preferredAmmo } };
    const foe = { id: "F1", hash: 1, def: { name: "Foetracer", tier: TIER_EXOTIC, itemType: ITEMTYPE_ARMOR, bucket: BUCKET.HELMET, classType: selectedClass() } };
    state.roll.armor = [foe]; state.roll.armorClass = selectedClass();
    Object.assign(state.plugDefs, { 801: { n: "Arcbolt Grenade" }, 802: { n: "Withering Blade" }, 803: { n: "Golden Gun: Marksman" },
      811: { n: "Incendiary Grenade" }, 812: { n: "Knife Trick" } });
    const sub = (name, element, hs) => ({ charId: selectedChar(), element, info: { element: name === "Prismatic" ? "prism" : element, s: { def: { name } } },
      abilities: [{ kind: "grenades", hash: hs[0] }, { kind: "melee", hash: hs[1] }, { kind: "supers", hash: hs[2] }], aspects: [], fragments: [], tags: [] });
    // Prismatic: Arc grenade, Stasis melee, Solar super
    state.roll.subclass = sub("Prismatic", 3, [801, 802, 803]);
    const need = weaponNeed();
    out.els = [...need.els].sort(); out.label = need.label;
    const N = 600; let hit = 0;
    for (let k = 0; k < N; k++) if (rollWeapons(state.rules, 0, rollNeed(state.rules, 0)).some(i => need.els.includes(i.dmg))) hit++;
    out.hit = hit / N;
    // Solar Gunslinger: the Solar weapons are a special (Solar Fusion) and a heavy (Solar Sword).
    state.roll.subclass = sub("Gunslinger", 3, [811, 812, 803]);
    const solar = weaponNeed();
    out.elemental = solar.els;
    const sword = n => { let c = 0; for (let k = 0; k < N; k++) if (rollWeapons(state.rules, 0, n).some(i => i.def.name === "Solar Sword")) c++; return c / N; };
    const plain = { ...needTest(solar) }; delete plain.prefer;
    out.heavy = sword(needTest(solar)); out.heavy0 = sword(plain);
    out.pool = weaponPool(state.rules, 0).map(i => [i.def.name, i.dmg, i.def.ammo].join(":"));
    return JSON.stringify(out);
  })()`));
  console.log(JSON.stringify(r));
  assert.deepEqual(r.row, { el: ["grenade", "melee", "super"], ammo: 3 });
  assert.deepEqual(r.els, [2, 3, 6]);
  assert.match(r.label, /^an Arc\/Stasis\/Solar weapon \(matches your grenade, melee or super\)$/);
  assert.equal(r.hit, 1, "every roll has a matching weapon");
  // Expected about 0.90 with the 4x preference and 0.75 without (half the time the free heavy pick is the Sword anyway).
  assert(r.heavy > r.heavy0 + 0.07, "heavy preferred");
  assert.deepEqual(r.elemental, [3]);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message.slice(0, 800)); process.exit(1); });
