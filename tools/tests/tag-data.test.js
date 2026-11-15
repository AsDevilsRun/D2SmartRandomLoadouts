const { load } = require("./harness");
const assert = require("assert");
const { execSync } = require("child_process");
(async () => {
  const h = await load("build.html");
  assert.match(h.log(), /Tag data loaded: 141 exotic weapons, 141 exotic armor, 258 subclass plugs, 56 armor sets/);
  assert.match(h.log(), /Synergy sheet loaded \(141 exotics, 6 focus mappings\)/);
  assert.equal(h.ev(`state.sheet["celestial nighthawk"].weapons[0]`), "Still Hunt");
  assert.equal(h.ev(`state.sheet["celestial nighthawk"].orWeapon`), true);
  assert.deepEqual([...h.ev(`state.focusMap["grenade"]`)], ["demolitionist", "grenadier"]);
  assert.deepEqual([...h.ev(`state.sheet["oathkeeper"].excludedWeapons`)], ["Opaque Hourglass", "A Good Shout", "Submersion", "Heirloom"]);
  const r = h.ev(`(() => { const rule = exoticRule("Oathkeeper"); const need = { types: rule.weaponTypes.map(norm), names: [], excl: rule.excludedWeapons.map(norm), el: 0 }; const it = n => ({ def: { name: n, typeName: "Combat Bow" }, dmg: 3 }); return [meetsNeed(it("Heirloom"), need), meetsNeed(it("A Good Shout"), need), meetsNeed(it("Le Monarque"), need)]; })()`);
  assert.deepEqual([...r], [false, false, true]);
  const got = JSON.parse(h.ev(`JSON.stringify({ bw: BUILD_WEIGHTS, sb: SET_BONUSES })`));
  // Compare with the data that was baked into the original build.html (git HEAD).
  const orig = execSync(`git -C "${require("path").resolve(__dirname, "..", "..")}" show ae8056e:build.html`).toString();
  const O = JSON.parse(orig.match(/const BUILD_WEIGHTS = (\{.*?\});\n/s)[1]);
  const OS = JSON.parse(orig.match(/const SET_BONUSES = (\{.*?\});\n/s)[1]);
  assert.deepEqual(got.bw.tagw, O.tagw);
  // subclass plug tags were deliberately cleaned up (commit ea58140), so they're no longer compared with the original.
  assert.deepEqual(got.sb, OS);
  const ren = { "Loreley Splendor": "Loreley Splendor Helm", "Promethium Spurs": "Promethium Spur" };
  const aeon = { Titan: "Aeon Safe", Hunter: "Aeon Swift", Warlock: "Aeon Soul" };
  for (const [k, v] of Object.entries(O.exotics)) {
    const n = k.startsWith("Sect of") ? aeon[v.c] : (ren[k] || k);
    assert.deepEqual(got.bw.exotics[n], { t: v.t, m: v.m || [], c: v.c }, n);
  }
  // exotic weapons: original minus the fixes
  const fixed = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "fixtures", "original_exotic_weapon_tags.json"))).exw; fixed["Borealis"] = [];
  fixed["Dead Messenger"] = got.bw.exw["Dead Messenger"]; assert.deepEqual(got.bw.exw, fixed);
  assert.equal(h.ev(`WEIGHT_PLUGS["controlled demolition"].w`), 2.0);
  assert.equal(h.ev(`SET_BY_NORM["atheon's memory"]["4"].w`), 2.0);
  assert.deepEqual([...h.ev(`exwTags("Ager's Scepter")`)], ["slow", "super"]);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message.slice(0, 600)); process.exit(1); });
