const { load } = require("./harness");
const assert = require("assert");
(async () => {
  const h = await load("build.html");
  assert.equal(h.ev(`state.sheet["necrotic grip"].weaponChance`), 0.5);
  assert.equal(h.ev(`state.sheet["celestial nighthawk"].weaponChance`), 0.25);
  const rate = (chance) => h.ev(`(() => {
    weaponNeed = (soft) => soft ? { types: [], names: ["exotic kinetic"], excl: [], el: 0, chance: ${chance}, label: "Exotic Kinetic" } : null;
    log = () => {};
    state.rules.guaranteedExoticWeapon = false; let n = 0; const N = 400;
    for (let k = 0; k < N; k++) if (rollWeapons(state.rules, 0, rollNeed(state.rules, 0)).some(i => i.def.name === "Exotic Kinetic")) n++;
    return n / N;
  })()`);
  const r1 = rate(1), r0 = rate(0);
  console.log({ r1, r0 });
  assert.equal(r1, 1);
  assert(r0 < 0.9);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message); process.exit(1); });
