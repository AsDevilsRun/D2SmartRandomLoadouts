const { load, waitIdle } = require("./harness");
const assert = require("assert");
let failed = 0;
async function t(name, fn) {
  try { await fn(); console.log("PASS", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); }
}

(async () => {
  for (const page of ["index.html", "build.html"]) {
    await t(`${page}: boots and loads inventory`, async () => {
      const h = await load(page);
      assert.match(h.log(), /Inventory loaded: 11 weapons, 6 armor/);
      assert.ok(!h.w.document.getElementById("app").hidden);
      assert.doesNotMatch(h.log(), /Error:/);
    });

    await t(`${page}: definitions come from IndexedDB on the second visit`, async () => {
      const fake = require("fake-indexeddb");
      const idb = new fake.IDBFactory();
      const a = await load(page, { idb });
      assert.equal(a.calls.lite, 1);
      const b = await load(page, { idb });
      assert.equal(b.calls.lite, undefined);
      assert.match(b.log(), /loaded from cache/);
    });

    await t(`${page}: old localStorage definition caches are removed`, async () => {
      const h = await load(page, { ls: { d2r_ent4_old: "{}", d2b_ent1_old: "{}" } });
      assert.equal(h.w.localStorage.getItem("d2r_ent4_old"), null);
      assert.equal(h.w.localStorage.getItem("d2b_ent1_old"), null);
    });

    await t(`${page}: weapons roll obeys rules`, async () => {
      const h = await load(page);
      for (let k = 0; k < 30; k++) {
        h.ev(`state.roll.weapons = rollWeapons(state.rules, 0)`);
        const ws = h.ev(`state.roll.weapons.map(i => ({ b: i.def.bucket, a: i.def.ammo, t: i.def.tier }))`);
        assert.equal(ws.length, 3);
        assert.equal(ws.filter(x => x.t === 6).length, 1, "one exotic");
        assert.ok(ws.filter(x => x.a === 1).length <= 1 && ws.filter(x => x.a === 2).length <= 1);
      }
    });

    await t(`${page}: complete search finds the only valid loadout`, async () => {
      const h = await load(page);
      // Only valid: exotic kinetic (primary) + special energy + heavy. With no-double-special the strand shotgun is out.
      const r = h.ev(`(() => {
        const pool = weaponPool(state.rules, 0).filter(i => i.def.name !== "Arc Primary" && i.def.name !== "Solar Fusion");
        return searchWeapons(state.rules, pool, [], null, shuffle).map(i => i.def.name);
      })()`);
      assert.deepEqual([...r].slice(0, 2), ["Exotic Kinetic", "Void Linear"]);
      const none = h.ev(`searchWeapons(state.rules, weaponPool(state.rules, 0).filter(i => i.def.bucket !== BUCKET.POWER), [], null, shuffle)`);
      assert.equal(none, null);
    });

    await t(`${page}: Postmaster exotic is offered as a Postmaster pull`, async () => {
      const h = await load(page);
      const v = h.ev(`unownedExoticWeapons(new Set()).map(i => [i.def.name, i.postmaster, locationLabel(i)])`);
      const pmx = v.find(x => x[0] === "Postmaster Exotic");
      assert.deepEqual([...pmx], ["Postmaster Exotic", true, "Postmaster — pull it"]);
      assert.equal(v.find(x => x[0] === "Unowned Exotic")[2], "Collections — pull it");
    });

    await t(`${page}: equip verifies from responses even when the profile is stale`, async () => {
      const h = await load(page, { staleEquip: true });
      h.ev(`state.roll.weapons = rollWeapons(state.rules, 0); state.roll.armor = null; state.roll.subclass = null; renderRoll()`);
      h.w.document.getElementById("btnEquip").click();
      await waitIdle(h.w, 10000);
      const toast = h.w.document.querySelector(".toast");
      assert.ok(toast.classList.contains("ok"), "toast ok: " + toast.textContent);
      const eq = h.ev(`state.roll.weapons.every(i => { const f = state.items.find(x => x.id === i.id); return f.owner === selectedChar() && f.equipped; })`);
      assert.ok(eq, "local inventory patched");
      const one = h.ev(`WEAPON_BUCKETS.every(b => state.items.filter(i => i.owner === selectedChar() && i.equipped && i.def.bucket === b).length === 1)`);
      assert.ok(one, "one equipped per slot");
    });

    await t(`${page}: equip reports items Bungie refused`, async () => {
      const h = await load(page, {});
      h.ev(`state.roll.weapons = rollWeapons(state.rules, 0); state.roll.armor = null; state.roll.subclass = null; renderRoll()`);
      const id = h.ev(`state.roll.weapons.find(i => i.owner !== selectedChar() || !i.equipped).id`);
      // re-load with refusal for that id isn't possible after load; patch fetch instead
      const orig = h.w.fetch;
      h.w.fetch = async (u, init) => {
        if (String(u).includes("EquipItems")) {
          const b = JSON.parse(init.body);
          return { ok: true, status: 200, json: async () => ({ ErrorCode: 1, Response: { equipResults: b.itemIds.map(x => ({ itemInstanceId: x, equipStatus: x === id ? 1623 : 1 })) } }) };
        }
        return orig(u, init);
      };
      h.w.document.getElementById("btnEquip").click();
      await waitIdle(h.w, 10000);
      const toast = h.w.document.querySelector(".toast");
      assert.ok(toast.classList.contains("bad"));
      assert.match(toast.textContent, /equip refused \(Bungie code 1623\)/);
    });

    await t(`${page}: expired session shows the sign-in button`, async () => {
      const h = await load(page);
      assert.ok(h.w.document.getElementById("signin").hidden);
      const orig = h.w.fetch;
      h.w.fetch = async (u, i) => String(u).includes("/Profile/") ? { ok: false, status: 401, json: async () => ({}) } : orig(u, i);
      h.w.document.getElementById("btnRefresh").click();
      await waitIdle(h.w);
      assert.ok(!h.w.document.getElementById("signin").hidden);
      assert.match(h.log(), /Session expired/);
      assert.equal(h.w.localStorage.getItem("d2r_token"), null);
    });

    await t(`${page}: rules save to the page's own key`, async () => {
      const h = await load(page);
      const cb = h.w.document.querySelector('[data-rule="mono"]');
      cb.checked = true; cb.dispatchEvent(new h.w.Event("change"));
      const key = page === "index.html" ? "d2r_rules" : "d2b_rules";
      const other = page === "index.html" ? "d2b_rules" : "d2r_rules";
      assert.equal(JSON.parse(h.w.localStorage.getItem(key)).mono, true);
      assert.equal(h.w.localStorage.getItem(other), null);
    });
  }

  await t("index.html: each button rolls only its own section", async () => {
    const h = await load("index.html");
    h.ev(`state.rules.mono = true; state.roll.weapons = ["Exotic Kinetic", "Arc Primary", "Arc Rocket"].map(n => state.items.find(i => i.def.name === n))`);
    h.ev(`window.armorBefore = state.roll.armor`);
    // Fake a subclass roll that sets Solar; stub rollSubclass to avoid needing subclass data.
    h.ev(`rollSubclass = async cid => ({ charId: cid, info: { element: 3, s: { def: { name: "Dawnblade", icon: "" } } }, abilities: [], aspects: [], fragments: [], element: 3 })`);
    await h.ev(`doRoll({ subclass: true })`);
    assert.deepEqual([...h.ev(`state.roll.weapons.map(i => i.def.name)`)], ["Exotic Kinetic", "Arc Primary", "Arc Rocket"]);
    assert.equal(h.ev(`state.roll.subclass.element`), 3);
    assert.doesNotMatch(h.log(), /rerolling weapons/);
  });

  await t("build.html: partial rolls need a full build first", async () => {
    const h = await load("build.html");
    const ids = ["btnRollSubclass", "btnRollWeapons", "btnRollArmor", "btnRollArmorSub"];
    assert.deepEqual(ids.map(id => h.ev(`$("${id}").disabled`)), [true, true, true, true]);
    await h.ev(`busy(() => doRoll({ weapons: true }))`);
    assert.match(h.log(), /Roll a full build first/);
    assert.equal(h.ev(`!!state.roll.weapons`), false);
    // A full build for this character enables them; another character's build doesn't.
    h.ev(`state.roll.subclass = { charId: selectedChar(), info: { element: 3, s: { def: { name: "Dawnblade", icon: "" } } }, abilities: [], aspects: [], fragments: [], element: 3 };
          state.roll.weapons = rollWeapons(state.rules, 0); state.roll.armor = state.items.filter(i => i.def.itemType === ITEMTYPE_ARMOR).slice(0, 1);
          state.roll.armorClass = selectedClass(); renderRoll()`);
    assert.deepEqual(ids.map(id => h.ev(`$("${id}").disabled`)), [false, false, false, false]);
    assert.equal(h.ev(`[...document.querySelectorAll("[data-reroll]")].every(b => !b.disabled)`), true);
    h.ev(`state.roll.subclass.charId = "other"; renderRoll()`);
    assert.deepEqual(ids.map(id => h.ev(`$("${id}").disabled`)), [true, true, true, true]);
  });

  await t("build.html: weapon type matching is exact", async () => {
    const h = await load("build.html");
    const r = h.ev(`(() => {
      const it = (typeName) => ({ def: { typeName, name: "x" }, dmg: 0 });
      const need = t => ({ types: [norm(t)], names: [], el: 0 });
      return [
        meetsNeed(it("Linear Fusion Rifle"), need("Fusion Rifle")),
        meetsNeed(it("Fusion Rifle"), need("Linear Fusion Rifle")),
        meetsNeed(it("Fusion Rifle"), need("Fusion Rifles")),
        meetsNeed(it("Combat Bow"), need("Bows")),
        meetsNeed(it("Linear Fusion Rifle"), need("LFR")),
        meetsNeed(it("Submachine Gun"), need("Submachine Guns")),
      ];
    })()`);
    assert.deepEqual([...r], [false, false, true, true, true, true]);
  });

  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
