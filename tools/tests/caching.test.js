const { load } = require("./harness");
const assert = require("assert");
(async () => {
  const h = await load("build.html");
  const r = JSON.parse(await h.ev(`(async () => {
    const out = {};
    // fetchEntities: plugs already in the bulk definitions are not looked up again
    const calls = []; const realBungie = bungie;
    bungie = async p => { calls.push(p); return { displayProperties: { name: "X" } }; };
    state.plugDefs[111] = { n: "Known" };
    await fetchEntities("p", [111, 222], slimPlug);
    out.calls = calls.length; out.fetched = calls[0];
    // runPool: one summary line for failures
    bungie = async () => { throw new Error("down"); };
    const before = $("log").textContent.split("\\n").length;
    await fetchEntities("p", [301, 302, 303], slimPlug);
    out.newLines = $("log").textContent.split("\\n").length - before;
    out.summary = $("log").textContent.split("\\n")[0];
    bungie = realBungie;
    // log cap
    for (let k = 0; k < 1000; k++) log("x" + k);
    out.logLines = $("log").textContent.trim().split("\\n").length;
    out.newest = $("log").textContent.split("\\n")[0].endsWith("x999");
    // no DIM data: exotics without a sheet row have no rule, and fit every subclass
    out.noRule = exoticRule("Not In The Sheet") === null && subclassFits(null, {}) && fitsRolledSubclass(null, {});
    out.dimGone = typeof loadSynergy === "undefined" && typeof synergyFor === "undefined";
    // isEmptyPlug
    state.plugDefs[501] = { n: "" }; state.plugDefs[502] = { n: "Empty Fragment Socket" }; state.plugDefs[503] = { n: "Spark of Ions" };
    out.empty = [isEmptyPlug(0), isEmptyPlug(501), isEmptyPlug(502), isEmptyPlug(503), isEmptyPlug(999999)];
    // pickByNameWeighted: weight per name, picks a copy of the chosen name
    const mk = (n, id) => ({ id, def: { name: n, tier: 5, typeName: "Hand Cannon", bucket: BUCKET.KINETIC, ammo: 1 }, dmg: 1 });
    const cands = [mk("A", 1), mk("A", 2), mk("B", 3)];
    const c = { A: 0, B: 0 };
    for (let k = 0; k < 4000; k++) c[pickByNameWeighted(cands, null).def.name]++;
    out.split = c.A / 4000;
    // orWeaponReady: one weapon-list build per rule until the inventory, exotic list or settings change
    const rule = { orWeapon: true, weaponTypes: [], weapons: ["Exotic Kinetic"], excludedWeapons: [] };
    let pools = 0; const realPool = weaponPool;
    weaponPool = (...a) => { pools++; return realPool(...a); };
    const r1 = [orWeaponReady(rule), orWeaponReady(rule), orWeaponReady(rule)];
    out.poolsCached = pools;
    store.set("d2r_off_w", ["Exotic Kinetic"]);
    out.afterOff = orWeaponReady(rule);
    store.set("d2r_off_w", []);
    out.afterOn = orWeaponReady(rule);
    await loadProfile();
    orWeaponReady(rule);
    out.poolsTotal = pools; out.r1 = r1;
    weaponPool = realPool;
    return JSON.stringify(out);
  })()`));
  console.log(r);
  assert.equal(r.calls, 1); assert.match(r.fetched, /\/222\//);
  assert.equal(r.newLines, 2); assert.match(r.summary, /3 lookups failed \(first: \d+: down\)/);
  assert.equal(r.logLines, 400); assert(r.newest);
  assert(r.noRule); assert(r.dimGone);
  assert.deepEqual(r.empty, [true, true, true, false, false]);
  assert(Math.abs(r.split - 0.5) < 0.04, "per-name odds");
  assert.deepEqual(r.r1, [true, true, true]); assert.equal(r.poolsCached, 1);
  assert.equal(r.afterOff, false); assert.equal(r.afterOn, true); assert.equal(r.poolsTotal, 4);
  console.log("OK");
})().catch(e => { console.log("FAIL", e.message.slice(0, 600)); process.exit(1); });
