const { load } = require("./harness");
const assert = require("assert");
// Artifact: rolled last from the build; 7 slots (2 take tier I, 3 take I-II, 2 take I-III); perks need what their row lists;
// better perks and better-fitting artifacts are much more likely; equipping clears a wanted perk out of the wrong slot first.
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(async () => {
    log = () => {};
    const out = {};
    let next = 70000;
    // Fake artifacts built from data/artifact_perks.csv: slots 0-1 take tier I, 2-4 tiers I-II, 5-6 tiers I-III.
    const fake = (name, cur = []) => {
      const rows = Object.values(ART.perks[norm(name)]);
      const hash = {};
      for (const p of rows) { hash[p.name] = ++next; state.plugDefs[next] = { n: p.name, ch: PC_ARTIFACT_PERK, c: "artifact" }; }
      const tiers = ["I", "I", "II", "II", "II", "III", "III"];
      const rank = { I: 1, II: 2, III: 3 };
      const sockets = tiers.map((t, idx) => ({ idx, empty: 99, options: rows.filter(p => rank[p.col] <= rank[t]).map(p => hash[p.name]) }));
      return { item: { id: "A" + name, hash: next + 1000, owner: selectedChar(), equipped: true }, name, icon: "", sockets, cur, hash };
    };
    state.plugDefs[99] = { n: "Empty Artifact Slot", ch: 0 };
    const npa = fake("NPA Repulsion Regulator"), censer = fake("Queensfoil Censer");
    loadArtifacts = async () => [npa, censer];
    state.plugDefs[811] = { n: "Ballistic Slam" }; state.plugDefs[812] = { n: "Thundercrash" }; state.plugDefs[813] = { n: "Pulse Grenade" };
    const sub = (name, element) => ({ charId: selectedChar(), element, info: { element, s: { def: { name } } },
      abilities: [{ kind: "grenades", hash: 813 }, { kind: "melee", hash: 811 }, { kind: "supers", hash: 812 }], aspects: [], fragments: [], tags: ["amplified", "jolt"] });
    const byName = n => state.items.find(i => i.def.name === n);
    // Weapons: Kinetic Primary (Auto Rifle), Arc Primary (Pulse Rifle), Solar Sword (Sword).
    state.roll.weapons = [byName("Kinetic Primary"), byName("Arc Primary"), byName("Solar Sword")];
    state.roll.subclass = sub("Striker", 2);
    const N = 400, perkCount = {}, artCount = {};
    let valid = true;
    for (let k = 0; k < N; k++) {
      const a = await rollArtifact(selectedChar());
      artCount[a.art.name] = (artCount[a.art.name] || 0) + 1;
      const hs = a.perks.map(p => p.hash);
      const cols = a.perks.map(p => p.col);
      if (a.perks.length !== 7 || new Set(hs).size !== 7) valid = false;
      if (a.perks.some(p => !a.art.sockets.find(s => s.idx === p.idx).options.includes(p.hash))) valid = false;
      if (cols.filter(c => c === "III").length > 2 || cols.filter(c => c !== "I").length > 5) valid = false;
      for (const p of a.perks) perkCount[a.art.name + "/" + p.name] = (perkCount[a.art.name + "/" + p.name] || 0) + 1;
    }
    out.valid = valid; out.artCount = artCount;
    const rate = n => (perkCount[n] || 0) / N;
    out.glaive = rate("NPA Repulsion Regulator/Suppressing Glaive") + rate("NPA Repulsion Regulator/Passive Aggressive Guard");
    out.voidGrenade = rate("NPA Repulsion Regulator/Overload Grenades");
    out.arcGrenade = rate("NPA Repulsion Regulator/Lightning Strikes Twice");
    out.shatterOrbs = rate("NPA Repulsion Regulator/Shatter Orbs"); out.improvedUnraveling = rate("NPA Repulsion Regulator/Improved Unraveling");
    out.autoRifle = rate("NPA Repulsion Regulator/Sustained Fire");
    // Solar subclass: Shock and Awe (Arc or Prismatic) never rolls.
    state.plugDefs[821] = { n: "Solar Test Grenade" }; state.plugDefs[822] = { n: "Solar Test Melee" }; state.plugDefs[823] = { n: "Solar Test Super" };
    state.roll.subclass = { ...sub("Sunbreaker", 3), abilities: [{ kind: "grenades", hash: 821 }, { kind: "melee", hash: 822 }, { kind: "supers", hash: 823 }] };
    let shock = 0;
    let needle = 0;
    for (let k = 0; k < 100; k++) {
      const a = await rollArtifact(selectedChar());
      if (a.perks.some(p => p.name === "Shock and Awe")) shock++;
      if (a.perks.some(p => p.name === "Conductive Cosmic Needle")) needle++;
    }
    out.shockSolar = shock; out.needleSolar = needle;
    // Arc grenade/melee/super (the Striker above): Conductive Cosmic Needle can roll.
    out.needleArc = rate("NPA Repulsion Regulator/Conductive Cosmic Needle");
    // Energy Acceleration needs a weapon with Micro-Missile Frame (read from the weapon's plugged sockets).
    const curio = fake("Implement of Curiosity");
    loadArtifacts = async () => [curio];
    const ea = async () => { let c = 0; for (let k = 0; k < 150; k++) { const a = await rollArtifact(selectedChar()); if (a.perks.some(p => p.name === "Energy Acceleration")) c++; } return c; };
    state.socketData = { sockets: {} };
    out.eaWithout = await ea();
    state.plugDefs[9300] = { n: "Micro-Missile Frame" };
    state.socketData = { sockets: { [state.roll.weapons[1].id]: { sockets: [{ plugHash: 9300 }] } } };
    out.eaWith = await ea();
    loadArtifacts = async () => [npa, censer];
    // Elemental Supercharger needs an Overload weapon matching the super's element (Thundercrash here: Arc).
    state.roll.subclass = sub("Striker", 2);
    const tablet = fake("Tablet of Ruin");
    loadArtifacts = async () => [tablet];
    const es = async () => { let c = 0; for (let k = 0; k < 150; k++) { const a = await rollArtifact(selectedChar()); if (a.perks.some(p => p.name === "Elemental Supercharger")) c++; } return c; };
    state.champs = {};
    out.esNone = await es();
    const solar = state.items.find(i => i.def.name === "Solar Fusion");
    state.roll.weapons = [byName("Kinetic Primary"), solar, byName("Arc Rocket")];
    state.champs = { [solar.id]: new Set(["overload"]) };
    out.esWrongEl = await es();
    state.champs = { [byName("Arc Rocket").id]: new Set(["overload"]) };
    out.esMatch = await es();
    // Boost: Argent Ordnance (Boost 10) with a rocket nearly always takes a tier III slot on Queensfoil Censer.
    loadArtifacts = async () => [censer];
    let ao = 0;
    for (let k = 0; k < 150; k++) { const a = await rollArtifact(selectedChar()); if (a.perks.some(p => p.name === "Argent Ordnance")) ao++; }
    out.argentOrdnance = ao / 150;
    state.champs = {};
    loadArtifacts = async () => [npa, censer];
    // Off: no artifact.
    state.rules.artifact = false; await rerollArtifact(); out.off = state.roll.artifact; state.rules.artifact = true;
    // Equipping: Volatile Flow (tier I) sits in slot 6 but is wanted in slot 0, Supernova goes in slot 6; slot 2 is already right.
    const calls = [];
    const real = bungie;
    bungie = async (url, init) => { if (/InsertSocketPlugFree|EquipItem/.test(url)) calls.push(init.body.plug ? [init.body.plug.socketIndex, plugName(init.body.plug.plugItemHash)] : ["equip"]); return {}; };
    socketGap = async () => {};
    const H = npa.hash;
    npa.cur = [0, 0, H["Bricks from Beyond"], 0, 0, 0, H["Volatile Flow"]];
    const roll = { charId: selectedChar(), art: npa, perks: [
      { idx: 0, hash: H["Volatile Flow"], name: "Volatile Flow" }, { idx: 2, hash: H["Bricks from Beyond"], name: "Bricks from Beyond" },
      { idx: 6, hash: H["Supernova"], name: "Supernova" }] };
    out.problems = await applyArtifact(roll, selectedChar());
    out.calls = calls;
    bungie = real;
    return JSON.stringify(out);
  })()`));
  console.log(JSON.stringify(r));
  assert.equal(r.valid, true, "7 different perks, each in a slot that takes it, slot limits kept");
  assert.equal(r.glaive, 0, "no glaive perks without a glaive");
  assert.equal(r.voidGrenade, 0, "Overload Grenades needs a Void grenade");
  assert(r.arcGrenade > 0.05, "Lightning Strikes Twice rolls with an Arc grenade");
  assert(r.autoRifle > 0, "auto rifle perk rolls with an auto rifle");
  assert(r.shatterOrbs > r.improvedUnraveling * 2, "S tier well above C tier");
  assert(r.artCount["NPA Repulsion Regulator"] > r.artCount["Queensfoil Censer"], "the Arc / auto rifle artifact fits better");
  assert.equal(r.shockSolar, 0);
  assert.equal(r.needleSolar, 0, "Conductive Cosmic Needle needs an Arc or Void ability");
  assert(r.needleArc > 0, "Conductive Cosmic Needle rolls with Arc abilities");
  assert.equal(r.eaWithout, 0, "Energy Acceleration needs a Micro-Missile Frame weapon");
  assert(r.eaWith > 0, "Energy Acceleration rolls with one");
  assert.equal(r.esNone, 0, "Elemental Supercharger needs an Overload weapon");
  assert.equal(r.esWrongEl, 0, "of the super's element");
  assert(r.esMatch > 0, "rolls with an Arc Overload weapon and an Arc super");
  assert(r.argentOrdnance > 0.8, "Boost makes Argent Ordnance near-certain with a rocket");
  assert.equal(r.off, null);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.calls, [[6, "Empty Artifact Slot"], [0, "Volatile Flow"], [6, "Supernova"]]);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message.slice(0, 800)); process.exit(1); });
