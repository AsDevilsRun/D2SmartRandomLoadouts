// Loads a page in jsdom with a mocked Bungie API. Usage: const h = await load("index.html", opts)
const { JSDOM, ResourceLoader } = require("jsdom");
const fs = require("fs");
class Loader extends ResourceLoader {
  fetch(url, o) {
    const m = url.match(/^https:\/\/example\.test\/(.+)$/);
    if (m) return Promise.resolve(fs.readFileSync(path.join(REPO, m[1].split("?")[0])));
    return super.fetch(url, o);
  }
}
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");

const B = { KIN: 1498876634, ENE: 2465295065, POW: 953998645, HEL: 3448274439, GAU: 3551918588, CHE: 14239492, LEG: 20886954, CLS: 1585787867, VAULT: 138197802, PM: 215593132 };

function defs() {
  const d = {};
  let h = 1000;
  const W = (name, bucket, ammo, dmg, tier = 5, type = "Auto Rifle") => { d[++h] = { displayProperties: { name, icon: "/i.png" }, itemType: 3, inventory: { tierType: tier, bucketTypeHash: bucket }, equippingBlock: { ammoType: ammo }, classType: 3, itemTypeDisplayName: type, defaultDamageType: dmg }; return h; };
  const A = (name, bucket, tier = 5, cls = 0) => { d[++h] = { displayProperties: { name, icon: "/i.png" }, itemType: 2, inventory: { tierType: tier, bucketTypeHash: bucket }, classType: cls, itemTypeDisplayName: "Armor" }; return h; };
  const ids = {
    kinLeg: W("Kinetic Primary", B.KIN, 1, 1),
    kinStrand: W("Strand Kinetic Special", B.KIN, 2, 7, 5, "Shotgun"),
    eneArc: W("Arc Primary", B.ENE, 1, 2, 5, "Pulse Rifle"),
    eneSolarSpec: W("Solar Fusion", B.ENE, 2, 3, 5, "Fusion Rifle"),
    eneLfr: W("Void Linear", B.ENE, 2, 4, 5, "Linear Fusion Rifle"),
    powArc: W("Arc Rocket", B.POW, 3, 2, 5, "Rocket Launcher"),
    powSolar: W("Solar Sword", B.POW, 3, 3, 5, "Sword"),
    exoKin: W("Exotic Kinetic", B.KIN, 1, 1, 6, "Hand Cannon"),
    exoPM: W("Postmaster Exotic", B.ENE, 2, 3, 6, "Shotgun"),
    exoUnowned: W("Unowned Exotic", B.POW, 3, 4, 6, "Machine Gun"),
    helm: A("Helm", B.HEL), gaunt: A("Gaunt", B.GAU), chest: A("Chest", B.CHE), legs: A("Legs", B.LEG), mark: A("Mark", B.CLS),
    exoHelm: A("Exotic Helm", B.HEL, 6),
  };
  return { d, ids };
}

async function load(page, opts = {}) {
  const { d, ids } = defs();
  const calls = [];
  let n = 0;
  const inst = (hash, bucket) => ({ itemHash: hash, itemInstanceId: String(++n), bucketHash: bucket });
  const vault = [], charInv = [], equip = [];
  const owned = ["kinLeg", "kinStrand", "eneArc", "eneSolarSpec", "eneLfr", "powArc", "powSolar", "exoKin"];
  for (const k of owned) vault.push(inst(ids[k], B.VAULT));
  for (const k of ["helm", "gaunt", "chest", "legs", "mark", "exoHelm"]) vault.push(inst(ids[k], B.VAULT));
  const pm = inst(ids.exoPM, B.PM); charInv.push(pm);
  // currently equipped (different items so equipping is needed)
  const cur = [inst(ids.kinLeg, B.KIN), inst(ids.eneArc, B.ENE), inst(ids.powArc, B.POW)];
  equip.push(...cur);
  const profile = () => ({
    characters: { data: { C1: { classType: 0, light: 2000, dateLastPlayed: "2026-01-01" } } },
    profileInventory: { data: { items: vault } },
    characterInventories: { data: { C1: { items: charInv } } },
    characterEquipment: { data: { C1: { items: opts.staleEquip ? equip : equip } } },
    itemComponents: { instances: { data: Object.fromEntries([...vault, ...charInv, ...equip].map(i => [i.itemInstanceId, { damageType: d[i.itemHash].defaultDamageType, primaryStat: { value: 10 } }])) } },
  });
  const ok = r => ({ ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) });
  const api = r => ok({ ErrorCode: 1, Response: r });
  const fetchMock = async (url, init = {}) => {
    url = String(url); calls.push({ url, body: init.body });
    if (/^data\/[\w]+\.csv$/.test(url)) { const fs = require("fs"); const f = path.join(REPO, url); return fs.existsSync(f) ? { ok: true, status: 200, text: async () => fs.readFileSync(f, "utf8") } : { ok: false, status: 404, text: async () => "" }; }
    if (opts.expireOn && url.includes(opts.expireOn)) return { ok: false, status: 401, json: async () => ({}) };
    if (url.includes("GetMembershipsForCurrentUser")) return api({ destinyMemberships: [{ membershipId: "1", membershipType: 3, displayName: "Tester" }], primaryMembershipId: "1" });
    if (url.endsWith("/Destiny2/Manifest/")) return api({ version: "v1", jsonWorldComponentContentPaths: { en: { DestinyInventoryItemLiteDefinition: "/lite.json", DestinySandboxPerkDefinition: "/perks.json", DestinyCollectibleDefinition: "/coll.json" } } });
    if (url.endsWith("/lite.json")) { calls.lite = (calls.lite || 0) + 1; return ok(d); }
    if (url.endsWith("/perks.json")) return ok({});
    if (url.endsWith("/coll.json")) return ok({});
    if (url.includes("/Profile/")) return api(profile());
    if (url.includes("/Destiny2/Manifest/")) return api({ displayProperties: { name: "x" } });
    if (url.includes("TransferItem")) return api(0);
    if (url.includes("EquipItems")) {
      const b = JSON.parse(init.body);
      if (!opts.staleEquip) { // apply for real
        for (const id of b.itemIds) {
          const src = [vault, charInv].find(a => a.some(i => i.itemInstanceId === id)) || [];
          const it = src.find(i => i.itemInstanceId === id);
          if (!it) continue;
          src.splice(src.indexOf(it), 1);
          const bk = d[it.itemHash].inventory.bucketTypeHash;
          const old = equip.findIndex(e => d[e.itemHash].inventory.bucketTypeHash === bk);
          if (old >= 0) charInv.push(...equip.splice(old, 1));
          it.bucketHash = bk; equip.push(it);
        }
      }
      return api({ equipResults: b.itemIds.map(id => ({ itemInstanceId: id, equipStatus: opts.refuse === id ? 1623 : 1 })) });
    }
    if (url.includes("docs.google.com") || url.includes("githubusercontent")) return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    return api({});
  };
  const dom = await JSDOM.fromFile(path.join(REPO, page), {
    runScripts: "dangerously", resources: new Loader(), url: "https://example.test/" + page,
    beforeParse(w) {
      w.fetch = fetchMock;
      const fake = require("fake-indexeddb");
      w.indexedDB = opts.idb || fake.indexedDB;
      w.localStorage.setItem("d2r_token", JSON.stringify({ access: "t", expires: Date.now() + 3600e3 }));
      for (const [k, v] of Object.entries(opts.ls || {})) w.localStorage.setItem(k, v);
      w.navigator.clipboard = { writeText: async () => {} };
    },
  });
  const w = dom.window;
  await new Promise(r => w.addEventListener("load", r));
  await waitIdle(w);
  return { w, calls, ids, ev: s => w.eval(s), log: () => w.document.getElementById("log").textContent, pm };
}

async function waitIdle(w, ms = 4000) {
  const t0 = Date.now();
  await new Promise(r => setTimeout(r, 50));
  while (Date.now() - t0 < ms) {
    if (!w.document.getElementById("btnRollAll")?.disabled) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error("page stayed busy");
}

module.exports = { load, waitIdle };
