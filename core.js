/* Shared by index.html (pure random) and build.html (smart build).
   Each page defines PAGE before loading this file, then its own rolling code, then calls init(). */
"use strict";

/* ===================== CONFIG ===================== */
const CONFIG = {
  apiKey:   "9c6618593f804a6a9fff215fa6804154",
  clientId: "56646",
};
/* ================================================== */

const BUNGIE = "https://www.bungie.net";
const API = BUNGIE + "/Platform";
const BUCKET = {
  KINETIC: 1498876634, ENERGY: 2465295065, POWER: 953998645,
  HELMET: 3448274439, GAUNTLETS: 3551918588, CHEST: 14239492, LEGS: 20886954, CLASS: 1585787867,
  SUBCLASS: 3284755031,
};
const WEAPON_BUCKETS = [BUCKET.KINETIC, BUCKET.ENERGY, BUCKET.POWER];
const ARMOR_BUCKETS = [BUCKET.HELMET, BUCKET.GAUNTLETS, BUCKET.CHEST, BUCKET.LEGS, BUCKET.CLASS];
const SLOT_NAME = {
  [BUCKET.KINETIC]: "Kinetic", [BUCKET.ENERGY]: "Energy", [BUCKET.POWER]: "Power",
  [BUCKET.HELMET]: "Helmet", [BUCKET.GAUNTLETS]: "Gauntlets", [BUCKET.CHEST]: "Chest",
  [BUCKET.LEGS]: "Legs", [BUCKET.CLASS]: "Class Item",
};
const AMMO_NAME = { 1: "Primary", 2: "Special", 3: "Heavy" };
const CLASS_NAME = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
const DMG_NAME = { 1: "Kinetic", 2: "Arc", 3: "Solar", 4: "Void", 6: "Stasis", 7: "Strand" };
const SUBCLASS_ELEMENT = {
  arcstrider: 2, striker: 2, stormcaller: 2,
  gunslinger: 3, sunbreaker: 3, dawnblade: 3,
  nightstalker: 4, sentinel: 4, voidwalker: 4,
  revenant: 6, behemoth: 6, shadebinder: 6,
  threadrunner: 7, berserker: 7, broodweaver: 7,
};
const PLUG_KINDS = ["supers", "class_abilities", "movement", "melee", "grenades", "aspects", "fragments"];
const PLUG_LABEL = { ability: "Ability", supers: "Super", class_abilities: "Class ability", movement: "Movement", melee: "Melee", grenades: "Grenade", aspects: "Aspects", fragments: "Fragments" };
const TIER_LEGENDARY = 5, TIER_EXOTIC = 6;
const ITEMTYPE_ARMOR = 2, ITEMTYPE_WEAPON = 3, ITEMTYPE_SUBCLASS = 16;
const VAULT = "vault";
const VAULT_BUCKET = 138197802;
const CHAR_BUCKET_CAPACITY = 9;
const POSTMASTER_BUCKET = 215593132;
const DEFAULT_RULES = PAGE.defaultRules;

/* ---------- utilities ---------- */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s).toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const store = {
  warned: false,
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      if (!this.warned) { this.warned = true; log(`Couldn't save settings in this browser (${e.message}); they'll reset on reload.`); }
      return false;
    }
  },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
// Old definition caches lived in localStorage and could fill it, which also blocked saving the sign-in token.
// They now live in IndexedDB; clear the old ones before anything else is saved.
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && /^d2[rb]_ent/.test(k)) localStorage.removeItem(k); } } catch { /* ignore */ }

/* Newest first; only the latest LOG_MAX lines are kept so a long session doesn't slow every message down. */
const LOG_MAX = 400;
const logLines = [];
function log(msg) {
  logLines.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (logLines.length > LOG_MAX) logLines.length = LOG_MAX;
  $("log").textContent = logLines.join("\n") + "\n";
}

const state = {
  token: null,
  membership: null,
  manifestVersion: "",
  defs: null,
  plugDefs: {},
  characters: {},
  items: [],
  socketData: null,
  subInfo: {},
  postmaster: new Set(),
  rules: Object.assign({}, DEFAULT_RULES, store.get(PAGE.rulesKey) || {}, PAGE.forcedRules || {}),
  roll: { subclass: null, weapons: null, armor: null, armorClass: null, mods: null },
  ...(PAGE.extraState || {}),
};

/* ---------- Bungie API ---------- */
async function bungie(path, { method = "GET", body } = {}) {
  const headers = { "X-API-Key": CONFIG.apiKey };
  if (state.token) headers.Authorization = "Bearer " + state.token.access;
  if (body) headers["Content-Type"] = "application/json";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) throw sessionExpired();
    let json;
    try { json = await res.json(); } catch { throw new Error(`HTTP ${res.status} from ${path}`); }
    if (json.ErrorCode === 1) {
      if (json.ThrottleSeconds > 0) await sleep(json.ThrottleSeconds * 1000);
      return json.Response;
    }
    if (json.ErrorStatus === "WebAuthRequired" || json.ErrorCode === 99) {
      throw sessionExpired();
    }
    if (json.ThrottleSeconds > 0) { await sleep(json.ThrottleSeconds * 1000); continue; }
    throw new Error(`${json.ErrorStatus}: ${json.Message}`);
  }
  throw new Error("Bungie is throttling requests. Wait a moment and retry.");
}

/* Socket changes start at least 500 ms apart (DIM's limit); the request's own round trip counts toward the gap. */
let lastSocketChange = 0;
async function socketGap() {
  const wait = lastSocketChange + 500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSocketChange = Date.now();
}

async function runPool(items, n, fn) {
  let i = 0;
  const failed = [];
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++];
      try { await fn(x); } catch (e) { failed.push([x, e.message]); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  // One line for all failures (an outage would otherwise log one line per lookup).
  if (failed.length) log(`${failed.length} lookup${failed.length === 1 ? "" : "s"} failed (first: ${failed[0][0]}: ${failed[0][1]}).`);
}

/* ---------- auth ---------- */
/* Tokens from a public client last about an hour and can't be refreshed: drop the token and show the sign-in button. */
function sessionExpired() {
  signOut(false);
  const si = $("signin");
  if (si) si.hidden = false;
  return new Error("Session expired. Sign in again (your rolled loadout is kept until you do).");
}

function signIn() {
  if (PAGE.returnTo) store.set("d2r_return", PAGE.returnTo); else store.del("d2r_return");
  const st = Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");
  store.set("d2r_oauth_state", st);
  location.href = `${BUNGIE}/en/OAuth/Authorize?client_id=${encodeURIComponent(CONFIG.clientId)}&response_type=code&state=${encodeURIComponent(st)}`;
}

function signOut(reload = true) {
  store.del("d2r_token");
  state.token = null;
  if (reload) location.reload();
}

async function handleRedirect() {
  const p = new URLSearchParams(location.search);
  const code = p.get("code");
  if (!code) return;
  const st = p.get("state");
  history.replaceState(null, "", location.pathname);
  const expected = store.get("d2r_oauth_state");
  store.del("d2r_oauth_state");
  if (!expected || st !== expected) throw new Error("Sign-in state mismatch. Sign in again.");
  const res = await fetch(API + "/App/OAuth/Token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CONFIG.clientId }),
  });
  let j = {};
  try { j = await res.json(); } catch { /* handled below */ }
  if (!j.access_token) throw new Error("Token exchange failed: " + (j.error_description || j.error || `HTTP ${res.status}`));
  state.token = { access: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  store.set("d2r_token", state.token);
}

/* ---------- definitions ---------- */
async function loadMembership() {
  const r = await bungie("/User/GetMembershipsForCurrentUser/");
  const ms = r.destinyMemberships || [];
  if (!ms.length) throw new Error("No Destiny account on this Bungie profile.");
  const m = ms.find(x => x.membershipId === r.primaryMembershipId)
         || ms.find(x => x.crossSaveOverride === 0 || x.crossSaveOverride === x.membershipType)
         || ms[0];
  state.membership = { type: m.membershipType, id: m.membershipId, name: m.bungieGlobalDisplayName || m.displayName };
  $("account").textContent = state.membership.name;
}

function slimPlug(d) {
  return {
    n: d.displayProperties?.name || "",
    c: d.plug?.plugCategoryIdentifier || "",
    ch: d.plug?.plugCategoryHash || 0,
    t: d.itemTypeDisplayName || "",
    k: (d.investmentStats || []).find(st => st.statTypeHash === 2223994109)?.value || d.plug?.energyCapacity?.capacityValue || 0,
    i: d.displayProperties?.icon || "",
    b: d.breakerTypeHash || 0,
    e: d.plug?.energyCost?.energyCost || 0,
    pk: d.perks ? d.perks.map(x => x.perkHash) : undefined,
  };
}

function slimDefs(raw) {
  const out = {}, plugs = {};
  for (const [hash, d] of Object.entries(raw)) {
    if (d.plug) plugs[hash] = slimPlug(d);
    if (!d.inventory) continue;
    if (d.itemType !== ITEMTYPE_WEAPON && d.itemType !== ITEMTYPE_ARMOR && d.itemType !== ITEMTYPE_SUBCLASS) continue;
    out[hash] = {
      name: d.displayProperties?.name || "?",
      icon: d.displayProperties?.icon || "",
      itemType: d.itemType,
      tier: d.inventory.tierType,
      bucket: d.inventory.bucketTypeHash,
      ammo: d.equippingBlock?.ammoType || 0,
      classType: d.classType,
      typeName: d.itemTypeDisplayName || "",
      dmg: d.defaultDamageType || 0,
      coll: d.collectibleHash || 0,
      breaker: d.breakerTypeHash || 0,
      set: d.equippingBlock?.equipableItemSetHash || 0,
    };
  }
  return { out, plugs };
}

async function loadDefs() {
  const man = await bungie("/Destiny2/Manifest/");
  state.manifestVersion = man.version;
  const paths = man.jsonWorldComponentContentPaths.en;
  state.manifestPaths = paths;
  await entCache.open();
  const defsKey = "defs_" + SLIM_VERSION + "_" + man.version;
  let slim = await idb.get(defsKey);
  if (slim?.out && slim?.plugs) log("Item definitions loaded from cache.");
  else {
    log("Downloading item definitions…");
    slim = slimDefs(await (await fetch(BUNGIE + paths.DestinyInventoryItemLiteDefinition)).json());
    const hasAmmo = Object.values(slim.out).some(d => d.itemType === ITEMTYPE_WEAPON && d.ammo);
    if (!hasAmmo) {
      log("Lite definitions lack ammo data; downloading full definitions (large)…");
      slim = slimDefs(await (await fetch(BUNGIE + paths.DestinyInventoryItemDefinition)).json());
    }
    await idb.prune("defs_", defsKey);
    await idb.set(defsKey, slim);
  }
  state.defs = slim.out;
  state.plugDefs = slim.plugs;
  log(`Definitions loaded (${Object.keys(slim.out).length} items).`);
}

/* ---------- caches ----------
   IndexedDB holds the definition caches: localStorage's ~5 MB limit silently dropped them before,
   which meant re-downloading everything on every visit. Falls back to memory only if IndexedDB is unavailable. */
const SLIM_VERSION = 1; // bump when slimPlug / slimDefs / cached shapes change
const idb = {
  db: null, failed: false, warned: false,
  async open() {
    if (this.db || this.failed) return this.db;
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open("d2srl", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error("database blocked by another tab"));
      });
    } catch (e) { this.failed = true; this.warn(e); }
    return this.db;
  },
  warn(e) {
    if (this.warned) return;
    this.warned = true;
    log(`Can't use the browser cache (${e?.message || e}); definitions will be downloaded again next visit.`);
  },
  async req(mode, fn) {
    const db = await this.open();
    if (!db) return undefined;
    try {
      return await new Promise((res, rej) => {
        const tx = db.transaction("kv", mode);
        const r = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(r?.result);
        tx.onerror = tx.onabort = () => rej(tx.error || new Error("transaction failed"));
      });
    } catch (e) { this.warn(e); return undefined; }
  },
  get(k) { return this.req("readonly", s => s.get(k)); },
  set(k, v) { return this.req("readwrite", s => s.put(v, k)); },
  /* Delete every key starting with prefix except keep. */
  async prune(prefix, keep) {
    const keys = (await this.req("readonly", s => s.getAllKeys())) || [];
    const old = keys.filter(k => typeof k === "string" && k.startsWith(prefix) && k !== keep);
    if (old.length) await this.req("readwrite", s => { for (const k of old) s.delete(k); });
  },
};

/* Per-item definition lookups (subclass sockets, plug details), cached per manifest version. Shared by both pages. */
const entCache = {
  key: "", data: {}, saving: null, dirty: false,
  async open() {
    const key = "ent_" + SLIM_VERSION + "_" + state.manifestVersion;
    if (this.key === key) return;
    this.key = key;
    this.data = (await idb.get(key)) || {};
    await idb.prune("ent_", key);
  },
  /* Writes are serialized; a save requested during a write runs once after it. */
  save() {
    this.dirty = true;
    if (this.saving) return this.saving;
    this.saving = (async () => {
      while (this.dirty) { this.dirty = false; await idb.set(this.key, this.data); }
      this.saving = null;
    })();
    return this.saving;
  },
};

async function fetchEntities(prefix, hashes, slimFn, type = "DestinyInventoryItemDefinition") {
  await entCache.open();
  // Plugs from the bulk definition download are already known; only look up the rest.
  const known = h => (prefix + h) in entCache.data || (prefix === "p" && h in state.plugDefs);
  const missing = [...new Set(hashes)].filter(h => h && !known(h));
  if (!missing.length) return;
  log(`Looking up ${missing.length} definitions…`);
  await runPool(missing, 6, async h => {
    const d = await bungie(`/Destiny2/Manifest/${type}/${h}/`);
    entCache.data[prefix + h] = slimFn(d);
  });
  entCache.save();
}

const plugDef = h => entCache.data["p" + h] || state.plugDefs[h] || null;
const plugName = h => plugDef(h)?.n || String(h);
function plugKind(h) {
  const d = plugDef(h);
  if (!d) return null;
  const s = `${d.c} ${d.t}`.toLowerCase();
  if (/fragment/.test(s)) return "fragments";
  if (/aspect/.test(s)) return "aspects";
  if (/super/.test(s)) return "supers";
  if (/grenade/.test(s)) return "grenades";
  if (/melee/.test(s)) return "melee";
  if (/class[\s_.-]?abilit/.test(s)) return "class_abilities";
  if (/movement|jump/.test(s)) return "movement";
  return null;
}
const ELEMENT_TOKENS = { arc: 2, solar: 3, thermal: 3, void: 4, stasis: 6, strand: 7 };
function plugElement(h) {
  for (const tok of (plugDef(h)?.c || "").toLowerCase().split(/[._\s-]+/)) if (ELEMENT_TOKENS[tok]) return ELEMENT_TOKENS[tok];
  return 0;
}
const isEmptyPlug = h => { const n = plugDef(h)?.n; return !h || n === "" || /^empty/i.test(n || ""); };

/* ---------- inventory ---------- */
async function loadProfile() {
  const m = state.membership;
  const r = await bungie(`/Destiny2/${m.type}/Profile/${m.id}/?components=102,200,201,205,300`);
  state.characters = r.characters?.data || {};
  const instances = r.itemComponents?.instances?.data || {};
  const items = [];
  state.postmaster = new Set();
  const add = (it, owner, equipped) => {
    const d = state.defs[it.itemHash];
    if (!d || !it.itemInstanceId) return;
    if (owner !== VAULT && it.bucketHash === POSTMASTER_BUCKET) { if (d.itemType === ITEMTYPE_WEAPON) state.postmaster.add(d.name); return; }
    const slots = d.itemType === ITEMTYPE_WEAPON ? WEAPON_BUCKETS : d.itemType === ITEMTYPE_ARMOR ? ARMOR_BUCKETS : [BUCKET.SUBCLASS];
    if (!slots.includes(d.bucket)) return;
    if (owner === VAULT ? it.bucketHash !== VAULT_BUCKET : it.bucketHash !== d.bucket) return; // skips postmaster
    const inst = instances[it.itemInstanceId] || {};
    items.push({ id: it.itemInstanceId, hash: it.itemHash, def: d, owner, equipped, power: inst.primaryStat?.value || 0, dmg: inst.damageType || 0, energyCap: inst.energy?.energyCapacity || 0 });
  };
  for (const it of r.profileInventory?.data?.items || []) add(it, VAULT, false);
  for (const [cid, inv] of Object.entries(r.characterInventories?.data || {})) for (const it of inv.items) add(it, cid, false);
  for (const [cid, inv] of Object.entries(r.characterEquipment?.data || {})) for (const it of inv.items) add(it, cid, true);
  state.items = items;
  state.socketData = null;
  state.champs = null;
  state.subInfo = {};
  log(`Inventory loaded: ${items.filter(i => i.def.itemType === ITEMTYPE_WEAPON).length} weapons, ${items.filter(i => i.def.itemType === ITEMTYPE_ARMOR).length} armor.`);
}

/* ---------- subclass data ---------- */
async function ensureSocketData() {
  if (state.socketData) return;
  log("Loading subclass sockets…");
  const m = state.membership;
  // Inventory components included so Bungie returns sockets for vault and character items too (as DIM requests them).
  const r = await bungie(`/Destiny2/${m.type}/Profile/${m.id}/?components=102,201,205,305,310`);
  state.socketData = {
    sockets: r.itemComponents?.sockets?.data || {},
    reusable: r.itemComponents?.reusablePlugs?.data || {},
    profilePlugs: r.profilePlugSets?.data?.plugs || {},
    charPlugs: r.characterPlugSets?.data || {},
  };
}

function subclassElementByName(name, hud) {
  const n = norm(name);
  if (n.includes("prismatic")) return "prism";
  for (const [k, v] of Object.entries(SUBCLASS_ELEMENT)) if (n.includes(k)) return v;
  return hud || 0;
}

const SOCKET_CAT = {
  super: [457473665],
  abilities: [309722977, 3218807805],
  aspects: [2047681910, 2140934067, 764703411, 3400923910],
  fragments: [271461480, 1313488945, 193371309, 2819965312],
};

async function getSubclassInfo(cid) {
  if (state.subInfo[cid]) return state.subInfo[cid];
  await ensureSocketData();
  const subs = state.items.filter(i => i.def.itemType === ITEMTYPE_SUBCLASS && i.owner === cid);
  if (!subs.length) throw new Error("No subclasses found on this character.");
  await fetchEntities("s", subs.map(s => s.hash), d => ({
    e: (d.sockets?.socketEntries || []).map(s => ({
      i: s.singleInitialItemHash || 0,
      t: s.socketTypeHash || 0,
      r: s.reusablePlugSetHash || 0,
      ri: (s.reusablePlugItems || []).map(p => p.plugItemHash),
    })),
    cats: (d.sockets?.socketCategories || []).map(c => ({ h: c.socketCategoryHash, idx: c.socketIndexes || [] })),
    h: d.talentGrid?.hudDamageType || 0,
  }));
  const defsList = subs.map(s => entCache.data["s" + s.hash]).filter(Boolean);
  await fetchEntities("ps", defsList.flatMap(d => d.e.map(e => e.r)), d => (d.reusablePlugItems || []).map(p => p.plugItemHash), "DestinyPlugSetDefinition");
  await fetchEntities("st", defsList.flatMap(d => d.e.map(e => e.t)), d => (d.plugWhitelist || []).map(w => w.categoryHash), "DestinySocketTypeDefinition");

  const sd = state.socketData;
  // Like DIM: use each socket's full definition list. Bungie's per-character unlock flags are unreliable
  // (Bungie-net/api#1572), so locked picks are possible and get reported after equipping.
  const pre = subs.map(s => {
    const def = entCache.data["s" + s.hash];
    if (!def) return null;
    const reus = sd.reusable[s.id]?.plugs || {};
    const defined = def.e.map((e, idx) => [...new Set([...(entCache.data["ps" + e.r] || []), ...e.ri, ...(reus[idx] || []).map(p => p.plugItemHash)])]);
    return { s, def, defined };
  }).filter(Boolean);
  await fetchEntities("p", pre.flatMap(x => [...x.defined.flat(), ...x.def.e.map(e => e.i)]), slimPlug);

  const raw = pre.map(({ s, def, defined }) => {
    const cur = (sd.sockets[s.id]?.sockets || []).map(x => x.plugHash || 0);
    const subEl = subclassElementByName(s.def.name, def.h);
    const avail = {};
    def.e.forEach((e, idx) => {
      const real = h => h && !/^empty/i.test(plugDef(h)?.n || "");
      let list = defined[idx];
      // Keep only plugs the socket type accepts (the game's whitelist).
      const wl = entCache.data["st" + e.t] || [];
      if (wl.length) {
        const ok = list.filter(h => { const ch = plugDef(h)?.ch; return !ch || wl.includes(ch); });
        if (ok.some(real)) list = ok;
      }
      // Backup: on elemental subclasses, drop plugs labelled with a different element.
      if (typeof subEl === "number" && subEl) {
        const ok = list.filter(h => { const pe = plugElement(h); return !pe || pe === subEl; });
        if (ok.some(real)) list = ok;
      }
      list = list.slice();
      if (cur[idx] && !list.includes(cur[idx])) list.push(cur[idx]);
      avail[idx] = list;
    });
    return { s, def, cur, avail };
  });

  const allPlugs = raw.flatMap(x => Object.values(x.avail).flat());
  await fetchEntities("p", allPlugs, slimPlug);

  const infos = raw.map(x => {
    const groups = { supers: [], abilities: [], aspects: [], fragments: [] };
    for (const c of x.def.cats) {
      if (SOCKET_CAT.super.includes(c.h)) groups.supers.push(...c.idx);
      else if (SOCKET_CAT.abilities.includes(c.h)) groups.abilities.push(...c.idx);
      else if (SOCKET_CAT.aspects.includes(c.h)) groups.aspects.push(...c.idx);
      else if (SOCKET_CAT.fragments.includes(c.h)) groups.fragments.push(...c.idx);
    }
    const empty = idx => x.def.e[idx]?.i || 0;
    const choices = idx => x.avail[idx].filter(h => h && !((groups.aspects.includes(idx) || groups.fragments.includes(idx)) && h === empty(idx)) && !/^empty/i.test(plugDef(h)?.n || ""));
    return { ...x, groups, choices, element: subclassElementByName(x.s.def.name, x.def.h) };
  });

  if (!state.subLogged?.[cid]) {
    state.subLogged = state.subLogged || {};
    state.subLogged[cid] = true;
    log(`Subclasses on ${CLASS_NAME[state.characters[cid]?.classType] || "character"}: ` + infos.map(i =>
      `${i.s.def.name} [` + ["supers", "abilities", "aspects", "fragments"].map(g => {
        const opts = new Set(i.groups[g].flatMap(idx => i.choices(idx))).size;
        return `${g}: ${i.groups[g].length} slot${i.groups[g].length === 1 ? "" : "s"}/${opts} options`;
      }).join(", ") + "]"
    ).join(" | "));
  }
  state.subInfo[cid] = infos;
  return infos;
}

const SUPER_ELEMENT = [
  ["golden gun", 3], ["blade barrage", 3], ["hammer of sol", 3], ["burning maul", 3], ["daybreak", 3], ["well of radiance", 3], ["song of flame", 3],
  ["gathering storm", 2], ["arc staff", 2], ["storm's edge", 2], ["fists of havoc", 2], ["thundercrash", 2], ["stormtrance", 2], ["chaos reach", 2],
  ["shadowshot", 4], ["spectral blades", 4], ["sentinel shield", 4], ["ward of dawn", 4], ["twilight arsenal", 4], ["nova bomb", 4], ["nova warp", 4],
  ["silence and squall", 6], ["glacial quake", 6], ["winter's wrath", 6],
  ["silkstrike", 7], ["bladefury", 7], ["needlestorm", 7],
];
function superElementByName(superHash) {
  const n = norm(plugName(superHash)).replace(/&/g, "and");
  return SUPER_ELEMENT.find(([k]) => n.includes(k))?.[1] || 0;
}

function superElement(infos, superHash) {
  const target = norm(plugName(superHash));
  for (const info of infos) {
    if (info.element === "prism" || !info.element) continue;
    for (const idx of info.groups.supers || []) {
      if (info.avail[idx].some(h => norm(plugName(h)) === target)) return info.element;
    }
  }
  return 0;
}

function resolveElement(infos, info, superHash) {
  if (info.element !== "prism") return info.element || 0;
  const el = superElementByName(superHash) || superElement(infos, superHash) || plugElement(superHash);
  if (!el) log(`Couldn't determine the element of "${plugName(superHash)}" (category ${plugDef(superHash)?.c || "?"}); Monochromatic not applied.`);
  return el;
}

async function equippedElement(cid) {
  const infos = await getSubclassInfo(cid);
  const info = infos.find(x => x.s.equipped);
  if (!info) return 0;
  const sIdx = info.groups.supers?.[0];
  return resolveElement(infos, info, sIdx != null ? info.cur[sIdx] : 0);
}

/* ---------- rolling ---------- */
function pickByName(cands) {
  const names = [...new Set(cands.map(i => i.def.name))];
  if (!names.length) return null;
  const name = pick(names);
  return pick(cands.filter(i => i.def.name === name));
}

const exoticOff = list => new Set(store.get("d2r_off_" + list) || []);
const isExo = i => i.def.tier === TIER_EXOTIC;

function elementOK(bucket, dmg, E) {
  if (!E) return true;
  const energyEl = E === 2 || E === 3 || E === 4;
  if (bucket === BUCKET.POWER) return dmg === E;
  if (bucket === BUCKET.ENERGY) return energyEl ? dmg === E : true;
  if (bucket === BUCKET.KINETIC) return energyEl ? true : dmg === E;
  return true;
}

/* Exotic weapons not in the inventory, as placeholder items to be pulled from Collections (or the Postmaster, if one is waiting there). */
function unownedExoticWeapons(off) {
  const owned = new Set(state.items.filter(i => i.def.itemType === ITEMTYPE_WEAPON && isExo(i)).map(i => i.def.name));
  const byName = {};
  for (const [h, d] of Object.entries(state.defs)) {
    if (d.itemType !== ITEMTYPE_WEAPON || d.tier !== TIER_EXOTIC || !d.ammo || !WEAPON_BUCKETS.includes(d.bucket)) continue;
    if (!d.name || d.name === "?" || /classified/i.test(d.name) || owned.has(d.name) || off.has(d.name)) continue;
    const prev = byName[d.name];
    if (!prev || (!prev.def.coll && d.coll)) {
      const pm = state.postmaster.has(d.name);
      byName[d.name] = { id: null, hash: Number(h), def: d, owner: pm ? "postmaster" : "collections", equipped: false, power: 0, dmg: d.dmg, virtual: true, postmaster: pm };
    }
  }
  return Object.values(byName);
}

/* ---------- champions ----------
   A weapon stuns a champion type if (as DIM decides it) its definition has a breaker type, a plugged perk or mod has one,
   a plugged plug carries a breaker perk ("[Shield-Piercing]" / "[Disruption]" / "[Stagger]" in Bungie's perk names, plus DIM's
   hand-kept list), or it is in DIM's extended-breaker list. Subclass verbs and artifact perks don't count. */
const BREAKER = { barrier: 485622768, overload: 2611060930, unstoppable: 3178805705 };
const CHAMP_RULES = { champBarrier: "barrier", champOverload: "overload", champUnstoppable: "unstoppable" };
const CHAMP_LABEL = { barrier: "Barrier", overload: "Overload", unstoppable: "Unstoppable" };
const BREAKER_PERK_LABELS = [[/\[shield-piercing\]/i, "barrier"], [/\[disruption\]/i, "overload"], [/\[stagger\]/i, "unstoppable"]];
const DIM_BREAKER_PERKS = {2917776374:"unstoppable",164592134:"unstoppable",1134361550:"unstoppable",2084279142:"unstoppable",2612240126:"unstoppable",472686235:"overload",15807694:"overload",656925452:"overload",1478638730:"overload",2026681315:"overload",3033353825:"overload",4114351468:"overload",3469621377:"barrier",4000621756:"barrier",549294277:"barrier",1235808583:"barrier",1435986861:"barrier",1839099519:"barrier",3437929382:"barrier",3656570035:"barrier"};
const DIM_EXTENDED_BREAKER = {17096506:3178805705,89619507:3178805705,449318888:485622768,503025963:485622768,511888814:2611060930,593808239:485622768,1003391927:485622768,1047932517:2611060930,1203306857:3178805705,1307844890:485622768,1351987111:3178805705,1443166262:485622768,1685137410:3178805705,1734844650:3178805705,1955548646:485622768,2110100341:3178805705,2415768376:3178805705,2474293653:485622768,2687811401:2611060930,2694576561:2611060930,3118061004:3178805705,3487253372:485622768,3598649636:485622768,3661051060:485622768,4029987901:2611060930,4095189811:485622768,4268030601:485622768};
const champOfBreaker = h => Object.keys(BREAKER).find(k => BREAKER[k] === h) || null;
const requiredChamps = rules => Object.entries(CHAMP_RULES).filter(([r]) => rules[r]).map(([, c]) => c);
const champList = cs => cs.map(c => CHAMP_LABEL[c]).join(" + ");

function defChamps(hash, def) {
  const out = new Set();
  const a = champOfBreaker(def?.breaker), b = champOfBreaker(DIM_EXTENDED_BREAKER[hash]);
  if (a) out.add(a);
  if (b) out.add(b);
  return out;
}
const champsOf = i => (i.id && state.champs?.[i.id]) || defChamps(i.hash, i.def);

/* Breaker perks by hash, from Bungie's perk names (one download per game update, then cached). */
async function breakerPerkMap() {
  await entCache.open();
  if (entCache.data.breakerPerks) return entCache.data.breakerPerks;
  const out = { ...DIM_BREAKER_PERKS };
  try {
    log("Reading champion perk names…");
    const all = await (await fetch(BUNGIE + state.manifestPaths.DestinySandboxPerkDefinition)).json();
    for (const [h, d] of Object.entries(all)) {
      const hit = BREAKER_PERK_LABELS.find(([re]) => re.test(d.displayProperties?.name || ""));
      if (hit) out[h] = hit[1];
    }
  } catch (e) { log("Couldn't read perk names (" + e.message + "); using DIM's list only."); }
  entCache.data.breakerPerks = out;
  entCache.save();
  return out;
}

async function ensureChampData() {
  if (state.champs) return;
  try {
    const weapons = state.items.filter(i => i.def.itemType === ITEMTYPE_WEAPON);
    await ensureSocketData();
    const sd = state.socketData;
    const perks = await breakerPerkMap();
    const plugged = i => (sd.sockets[i.id]?.sockets || []).map(x => x.plugHash).filter(Boolean);
    const plugInfo = h => (state.plugDefs[h]?.pk ? state.plugDefs[h] : entCache.data["pp" + h]) || null;
    const missing = [...new Set(weapons.flatMap(plugged))].filter(h => !plugInfo(h));
    if (missing.length) await fetchEntities("pp", missing, d => ({ b: d.breakerTypeHash || 0, pk: (d.perks || []).map(p => p.perkHash) }));
    const champs = {};
    for (const i of weapons) {
      const set = defChamps(i.hash, i.def);
      for (const h of plugged(i)) {
        const p = plugInfo(h);
        if (!p) continue;
        const c = champOfBreaker(p.b);
        if (c) set.add(c);
        for (const ph of p.pk || []) if (perks[ph]) set.add(perks[ph]);
      }
      champs[i.id] = set;
    }
    state.champs = champs;
    await fetchEntities("bt", Object.values(BREAKER), d => d.displayProperties?.icon || "", "DestinyBreakerTypeDefinition");
  } catch (e) {
    log("Couldn't read champion data: " + e.message);
    state.champs = {};
  }
}

/* Pre-check before rolling: each required champion type needs at least one eligible weapon. */
/* Take a weapon for each required champion type not yet covered. False if a type can't be covered with the open slots. */
function takeChamps(champs, pool, picks, take, ammoOK, exoTaken, choose) {
  for (const c of shuffle(champs)) {
    if (Object.values(picks).some(i => champsOf(i).has(c))) continue;
    const m = pool.filter(i => !picks[i.def.bucket] && champsOf(i).has(c) && ammoOK(i) && (!exoTaken() || !isExo(i)));
    if (!m.length) return false;
    take(choose(m));
  }
  return true;
}

function checkChampPool(rules, pool) {
  const champs = requiredChamps(rules);
  const none = champs.filter(c => !pool.some(i => champsOf(i).has(c)));
  if (none.length) throw new Error(`No eligible weapon stuns ${champList(none)} champions.`);
  return champs;
}

/* Complete search for a weapon loadout, used when the random attempts in rollWeapons all fail.
   Finds a valid loadout whenever one exists (within a generous step limit). Copies that behave the same
   (name, champion stuns, element) are tried once. orderNames(names) gives the order names are tried in (random or weighted), so the
   result stays random. need (build.html only) is an optional { test(item) } that one weapon must pass. */
function searchWeapons(rules, pool, champs, need, orderNames) {
  const groups = {};
  for (const b of WEAPON_BUCKETS) {
    const byKey = new Map();
    for (const i of pool.filter(i => i.def.bucket === b)) {
      const k = `${i.def.name}|${[...champsOf(i)].sort().join(",")}|${i.dmg}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(i);
    }
    const byName = new Map();
    for (const g of byKey.values()) {
      if (!byName.has(g[0].def.name)) byName.set(g[0].def.name, []);
      byName.get(g[0].def.name).push(g);
    }
    groups[b] = orderNames([...byName.keys()]).flatMap(n => shuffle(byName.get(n)));
  }
  const buckets = shuffle(WEAPON_BUCKETS);
  // What the remaining slots could still supply, for pruning.
  const later = k => buckets.slice(k).flatMap(b => groups[b]);
  const canStill = [0, 1, 2, 3].map(k => {
    const gs = later(k);
    return {
      exo: gs.some(g => isExo(g[0])),
      champs: new Set(gs.flatMap(g => [...champsOf(g[0])])),
      need: need ? gs.some(g => g.some(need.test)) : false,
    };
  });
  let budget = 300000;
  const picks = [];
  const ammo = { 1: 0, 2: 0, 3: 0 };
  const rec = (k, exo) => {
    if (--budget < 0) return false;
    const covered = new Set(picks.flatMap(i => [...champsOf(i)]));
    const missing = champs.filter(c => !covered.has(c));
    const needMet = !need || picks.some(need.test);
    if (k === buckets.length) return !missing.length && needMet && (!rules.guaranteedExoticWeapon || exo);
    const can = canStill[k];
    if (rules.guaranteedExoticWeapon && !exo && !can.exo) return false;
    if (missing.some(c => !can.champs.has(c))) return false;
    if (!needMet && !can.need) return false;
    for (const g of groups[buckets[k]]) {
      const i = g[0];
      if (exo && isExo(i)) continue;
      if (rules.noDoublePrimary && i.def.ammo === 1 && ammo[1]) continue;
      if (rules.noDoubleSpecial && i.def.ammo === 2 && ammo[2]) continue;
      picks.push(pick(g)); ammo[i.def.ammo]++;
      if (rec(k + 1, exo || isExo(i))) return true;
      picks.pop(); ammo[i.def.ammo]--;
    }
    return false;
  };
  if (!rec(0, false)) return null;
  const out = {};
  for (const i of picks) out[i.def.bucket] = i;
  return WEAPON_BUCKETS.map(b => out[b]);
}

function champBadges(i) {
  const cs = [...champsOf(i)];
  return cs.map((c, k) => {
    const img = document.createElement("img");
    const icon = entCache.data["bt" + BREAKER[c]];
    img.className = "champ";
    img.style.right = (-3 + k * 14) + "px";
    img.alt = CHAMP_LABEL[c];
    img.title = "Stuns " + CHAMP_LABEL[c];
    if (icon) img.src = BUNGIE + icon;
    return img;
  });
}

function weaponPool(rules, E) {
  const off = exoticOff("w");
  const pool = state.items.filter(i => i.def.itemType === ITEMTYPE_WEAPON && i.def.ammo
    && (i.def.tier === TIER_LEGENDARY || (isExo(i) && !off.has(i.def.name)))
    && elementOK(i.def.bucket, i.dmg, E));
  if (rules.unownedExotics) pool.push(...unownedExoticWeapons(off).filter(v => elementOK(v.def.bucket, v.dmg, E)));
  // Guaranteed double special: kinetic and energy slots both take special-ammo weapons.
  return rules.guaranteedDoubleSpecial ? pool.filter(i => i.def.bucket === BUCKET.POWER || i.def.ammo === 2) : pool;
}

/* ---------- weapon rolling (both pages) ----------
   A page can set PAGE.pickWeapon(cands) to choose among candidates (build.html: weighted by synergy; default: every name
   equally likely) and PAGE.weaponSearchOrder(pool) to order names for the complete search (default: random).
   need (build.html only) is an optional { test(item), label } that one weapon must pass. */
const pickWeapon = cands => (PAGE.pickWeapon || pickByName)(cands);

/* Reroll one weapon slot, keeping the other two and all weapon rules. forceNeed: the new weapon must meet need. */
function rerollWeaponSlot(rules, E, bucket, need = null, forceNeed = false) {
  const cur = state.roll.weapons || [];
  const old = cur.find(i => i.def.bucket === bucket);
  const fixed = cur.filter(i => i.def.bucket !== bucket);
  const ammo = { 1: 0, 2: 0, 3: 0 };
  for (const i of fixed) ammo[i.def.ammo]++;
  const exoFixed = fixed.some(isExo);
  let cands = weaponPool(rules, E).filter(i => i.def.bucket === bucket
    && (!exoFixed || !isExo(i))
    && !(rules.noDoublePrimary && i.def.ammo === 1 && ammo[1])
    && !(rules.noDoubleSpecial && i.def.ammo === 2 && ammo[2]));
  if (rules.guaranteedExoticWeapon && !exoFixed) cands = cands.filter(isExo);
  const champMissing = requiredChamps(rules).filter(c => !fixed.some(i => champsOf(i).has(c)));
  if (champMissing.length) {
    cands = cands.filter(i => champMissing.every(c => champsOf(i).has(c)));
    if (!cands.length) throw new Error(`No ${SLOT_NAME[bucket]} weapon stuns ${champList(champMissing)} alongside the other two weapons.`);
  }
  if (need && (forceNeed || !fixed.some(need.test))) {
    const m = cands.filter(need.test);
    if (m.length || forceNeed) cands = m;
  }
  if (!cands.length) throw new Error(`No other ${SLOT_NAME[bucket]} weapon fits the rules with the other two weapons.`);
  const fresh = cands.filter(i => !old || i.def.name !== old.def.name);
  const p = pickWeapon(fresh.length ? fresh : cands);
  return cur.map(i => i.def.bucket === bucket ? p : i);
}

function rollWeapons(rules, E, need = null) {
  const pool = weaponPool(rules, E);
  if (rules.guaranteedExoticWeapon && !pool.some(isExo)) {
    throw new Error("No eligible exotic weapon" + (E ? ` for ${DMG_NAME[E]} Monochromatic` : "") + " (check the exotic list).");
  }
  const champs = checkChampPool(rules, pool);
  for (let attempt = 0; attempt < 300; attempt++) {
    const picks = {}, ammo = { 1: 0, 2: 0, 3: 0 };
    let exo = false, ok = true;
    const take = i => { picks[i.def.bucket] = i; ammo[i.def.ammo]++; if (isExo(i)) exo = true; };
    const ammoOK = i => !(rules.noDoublePrimary && i.def.ammo === 1 && ammo[1]) && !(rules.noDoubleSpecial && i.def.ammo === 2 && ammo[2]);
    if (need) take(pickWeapon(pool.filter(need.test)));
    if (rules.guaranteedExoticWeapon && !exo) {
      const ex = pool.filter(i => isExo(i) && !picks[i.def.bucket] && ammoOK(i));
      if (!ex.length) continue;
      take(pickWeapon(ex));
    }
    if (!takeChamps(champs, pool, picks, take, ammoOK, () => exo, pickWeapon)) continue;
    for (const b of shuffle(WEAPON_BUCKETS)) {
      if (picks[b]) continue;
      const p = pickWeapon(pool.filter(i => i.def.bucket === b && (!exo || !isExo(i)) && ammoOK(i)));
      if (!p) { ok = false; break; }
      take(p);
    }
    if (ok) return WEAPON_BUCKETS.map(b => picks[b]);
  }
  // Random attempts can miss a narrow valid combination; search all of them before giving up.
  const found = searchWeapons(rules, pool, champs, need, PAGE.weaponSearchOrder ? PAGE.weaponSearchOrder(pool) : shuffle);
  if (found) return found;
  throw new Error("Couldn't build a weapon loadout that meets the rules" + (need ? ` with ${need.label}` : "") + (champs.length ? ` stunning ${champList(champs)}` : "") + (E ? ` (${DMG_NAME[E]} Monochromatic)` : "") + ".");
}

/* ---------- rendering ---------- */
const pullText = i => i.postmaster
  ? `Pull ${i.def.name} from the Postmaster, then equip it — the API can't pull from the Postmaster.`
  : `Pull ${i.def.name} from Collections, then equip it — the API can't pull from Collections.`;

function locationLabel(i) {
  if (i.virtual) return i.postmaster ? "Postmaster — pull it" : "Collections — pull it";
  if (i.owner === VAULT) return "Vault";
  const c = state.characters[i.owner];
  const who = c ? CLASS_NAME[c.classType] : "Character";
  return i.equipped ? `${who} (equipped)` : who;
}

function itemRow(i, sub, action) {
  const tr = document.createElement("tr");
  const tdIcon = document.createElement("td");
  if (i.def.icon) {
    const img = document.createElement("img"); img.src = BUNGIE + i.def.icon; img.alt = "";
    if (i.def.itemType === ITEMTYPE_WEAPON) {
      const wrap = document.createElement("div"); wrap.className = "icon-wrap";
      wrap.append(img, ...champBadges(i));
      tdIcon.append(wrap);
    } else tdIcon.append(img);
  }
  const tdName = document.createElement("td");
  tdName.textContent = i.def.name;
  if (isExo(i)) tdName.className = "exotic";
  const s = document.createElement("div");
  s.className = "muted";
  s.textContent = sub;
  tdName.append(s);
  const tdLoc = document.createElement("td");
  if (action) {
    tdLoc.className = "act";
    const b = document.createElement("button");
    b.className = "small"; b.textContent = "Reroll"; b.title = "Reroll this weapon";
    b.onclick = action;
    b.dataset.reroll = "1";
    tdLoc.append(b);
  } else {
    tdLoc.className = "muted";
    tdLoc.textContent = locationLabel(i);
  }
  tr.append(tdIcon, tdName, tdLoc);
  return tr;
}

/* Bungie's strand class-ability and movement icons are the wrong color; DIM applies the same filter. */
const STRAND_WRONG_COLOR = [2480042224, 2552562702, 2200902275, 2139679542, 1979332108, 3728449707];
function iconRow(label, icon, value, plugHash) {
  const tr = document.createElement("tr");
  const a = document.createElement("td"); a.className = "label"; a.textContent = label;
  const b = document.createElement("td"); b.className = "icons";
  if (icon) {
    const img = document.createElement("img"); img.src = BUNGIE + icon; img.alt = "";
    const pd = plugHash ? plugDef(plugHash) : null;
    if (pd && (STRAND_WRONG_COLOR.includes(pd.ch) || /\.strand\.(class_abilities|movement)$/.test(pd.c || ""))) img.className = "strandfix";
    b.append(img);
  }
  b.append(document.createTextNode(value));
  tr.append(a, b);
  return tr;
}

function labelRow(label, value) {
  const tr = document.createElement("tr");
  const a = document.createElement("td"); a.className = "label"; a.textContent = label;
  const b = document.createElement("td"); b.textContent = value;
  tr.append(a, b);
  return tr;
}

function renderRoll() {
  const wt = $("weaponTable"); wt.replaceChildren();
  for (const i of state.roll.weapons || []) wt.append(itemRow(i, `${SLOT_NAME[i.def.bucket]} · ${AMMO_NAME[i.def.ammo]} · ${DMG_NAME[i.dmg] || ""} ${i.def.typeName}`, () => busy(() => rerollOne(i.def.bucket))));
  const at = $("armorTable"); at.replaceChildren();
  for (const i of state.roll.armor || []) at.append(itemRow(i, `${SLOT_NAME[i.def.bucket]} · ${i.power}`));
  if (PAGE.renderExtra) PAGE.renderExtra(); // build.html: mod table
  const st = $("subclassTable"); st.replaceChildren();
  const r = state.roll.subclass;
  if (r) {
    const el = r.info.element === "prism" ? `Prismatic (${DMG_NAME[r.element] || "?"} super)` : DMG_NAME[r.element] || "";
    st.append(iconRow("Subclass", r.info.s.def.icon, `${r.info.s.def.name} — ${el}`));
    for (const a of r.abilities) st.append(iconRow(PLUG_LABEL[a.kind] || "Ability", plugDef(a.hash)?.i, plugName(a.hash), a.hash));
    if (!r.aspects.length) st.append(iconRow("Aspects", "", "—"));
    for (const h of r.aspects) st.append(iconRow("Aspect", plugDef(h)?.i, plugName(h)));
    if (!r.fragments.length) st.append(iconRow("Fragments", "", "—"));
    for (const h of r.fragments) st.append(iconRow("Fragment", plugDef(h)?.i, plugName(h)));
  }
  const pulls = (state.roll.weapons || []).filter(i => i.virtual);
  const note = $("weaponNote");
  note.hidden = !pulls.length;
  note.textContent = pulls.map(pullText).join(" ");
  const all = [...(state.roll.weapons || []), ...(state.roll.armor || [])];
  $("dimString").value = all.map(i => i.virtual ? `exactname:"${i.def.name}"` : "id:" + i.id).join(" or ");
  $("btnEquip").disabled = !(all.length || r);
  if (PAGE.updateButtons) PAGE.updateButtons(isBusy);
}

const exoticNames = { defs: null, byKey: {} };
function renderExoticList(list) {
  const isW = list === "w";
  const cls = selectedClass();
  const ok = d => isW
    ? d.itemType === ITEMTYPE_WEAPON && WEAPON_BUCKETS.includes(d.bucket) && d.ammo
    : d.itemType === ITEMTYPE_ARMOR && ARMOR_BUCKETS.includes(d.bucket) && d.classType === cls;
  // The game's exotic names only change with the definitions, so scan them once per list and class.
  const nk = list + "|" + cls;
  if (exoticNames.defs !== state.defs) { exoticNames.defs = state.defs; exoticNames.byKey = {}; }
  const names = exoticNames.byKey[nk] ||= [...new Set(Object.values(state.defs)
    .filter(d => d.tier === TIER_EXOTIC && ok(d) && d.name && d.name !== "?" && !/classified/i.test(d.name))
    .map(d => d.name))].sort((a, b) => a.localeCompare(b));
  const owned = new Set(state.items.filter(i => isExo(i) && ok(i.def)).map(i => i.def.name));
  const off = exoticOff(list);
  const box = $(isW ? "exwList" : "exaList");
  box.replaceChildren();
  let eligible = 0, ownedCount = 0;
  for (const name of names) {
    const lab = document.createElement("label");
    const h = owned.has(name);
    lab.className = h ? "owned" : "unowned";
    lab.title = h ? "Owned" : "Not owned";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !off.has(name);
    cb.onchange = () => {
      const s = exoticOff(list);
      if (cb.checked) s.delete(name); else s.add(name);
      store.set("d2r_off_" + list, [...s]);
      renderExoticList(list);
    };
    lab.append(cb, " " + name);
    box.append(lab);
    if (h) ownedCount++;
    if ((h || (isW && state.rules.unownedExotics)) && !off.has(name)) eligible++;
  }
  box.dataset.names = JSON.stringify(names);
  box.dataset.owned = JSON.stringify([...owned]);
  $(isW ? "exwCount" : "exaCount").textContent = `${eligible} eligible · ${ownedCount} owned · ${names.length} total`;
  if (!isW) $("exaClass").textContent = CLASS_NAME[cls] || "";
}

function setExoticList(list, mode) {
  const box = $(list === "w" ? "exwList" : "exaList");
  const names = JSON.parse(box.dataset.names || "[]");
  const owned = new Set(JSON.parse(box.dataset.owned || "[]"));
  const off = exoticOff(list);
  for (const n of names) {
    const on = mode === "all" || (mode === "owned" && owned.has(n));
    if (on) off.delete(n); else off.add(n);
  }
  store.set("d2r_off_" + list, [...off]);
  renderExoticList(list);
}

function populateChars() {
  const sel = $("charSelect");
  const prev = sel.value;
  sel.replaceChildren();
  const chars = Object.entries(state.characters).sort((a, b) => new Date(b[1].dateLastPlayed) - new Date(a[1].dateLastPlayed));
  for (const [cid, c] of chars) {
    const o = document.createElement("option");
    o.value = cid;
    o.textContent = `${CLASS_NAME[c.classType]} (${c.light})`;
    sel.append(o);
  }
  if (prev && state.characters[prev]) sel.value = prev;
}

const selectedChar = () => $("charSelect").value;
const selectedClass = () => state.characters[selectedChar()]?.classType;

/* ---------- equipping ---------- */
async function transfer(item, toVault, charId) {
  await bungie("/Destiny2/Actions/Items/TransferItem/", {
    method: "POST",
    body: { itemReferenceHash: item.hash, stackSize: 1, transferToVault: toVault, itemId: item.id, characterId: charId, membershipType: state.membership.type },
  });
  item.owner = toVault ? VAULT : charId;
  item.equipped = false;
  await sleep(120);
}

async function makeRoom(cid, bucket, protectedIds) {
  const inBucket = state.items.filter(i => i.owner === cid && !i.equipped && i.def.bucket === bucket);
  if (inBucket.length < CHAR_BUCKET_CAPACITY) return;
  const victim = inBucket.find(i => !protectedIds.has(i.id));
  if (!victim) throw new Error(`No free ${SLOT_NAME[bucket]} space on character.`);
  log(`Moving ${victim.def.name} to vault to make room.`);
  await transfer(victim, true, cid);
}

async function dequip(item, protectedIds) {
  const owner = item.owner;
  const cls = state.characters[owner].classType;
  const fits = i => i.def.bucket === item.def.bucket && !protectedIds.has(i.id) && !isExo(i)
                 && (i.def.itemType === ITEMTYPE_WEAPON || i.def.classType === cls);
  let rep = state.items.find(i => i.owner === owner && !i.equipped && fits(i));
  if (!rep) {
    rep = state.items.find(i => i.owner === VAULT && fits(i));
    if (!rep) throw new Error(`Can't free ${item.def.name}: no replacement for that slot.`);
    await makeRoom(owner, item.def.bucket, protectedIds);
    await transfer(rep, false, owner);
  }
  log(`Swapping ${item.def.name} off ${CLASS_NAME[cls]} (equipping ${rep.def.name}).`);
  await bungie("/Destiny2/Actions/Items/EquipItem/", {
    method: "POST",
    body: { itemId: rep.id, characterId: owner, membershipType: state.membership.type },
  });
  rep.equipped = true;
  item.equipped = false;
  await sleep(120);
}

/* Equip several items; tracks the result per item from Bungie's response (equipStatus 1 = success).
   Returns problem strings for items Bungie refused. */
async function equipSet(cid, items) {
  if (!items.length) return [];
  const r = await bungie("/Destiny2/Actions/Items/EquipItems/", {
    method: "POST",
    body: { itemIds: items.map(i => i.id), characterId: cid, membershipType: state.membership.type },
  });
  const status = new Map((r?.equipResults || []).map(x => [String(x.itemInstanceId), x.equipStatus]));
  const problems = [];
  for (const i of items) {
    const st = status.get(String(i.id));
    if (st === 1) markEquipped(i, cid);
    else if (r?.equipResults) problems.push(`${i.def.name}: equip refused (Bungie code ${st ?? "missing"})`);
  }
  return problems;
}

/* Local inventory bookkeeping for an equip: the item is on cid and equipped; whatever held that slot is not. */
function markEquipped(item, cid) {
  for (const o of state.items) if (o !== item && o.owner === cid && o.equipped && o.def.bucket === item.def.bucket) o.equipped = false;
  item.owner = cid;
  item.equipped = true;
}

async function freshSubclassInfo(cid, itemId) {
  state.socketData = null;
  delete state.subInfo[cid];
  const infos = await getSubclassInfo(cid);
  return infos.find(x => x.s.id === itemId) || null;
}

async function applySubclass(r) {
  const { charId } = r;
  const m = state.membership;
  const info = (await freshSubclassInfo(charId, r.info.s.id)) || r.info;
  const item = info.s;
  r.errors = {};
  const current = state.items.find(i => i.id === item.id);
  r.subclassEquipped = !!(current ? current.equipped : item.equipped);
  if (!r.subclassEquipped) {
    log(`Equipping ${item.def.name}.`);
    try {
      await bungie("/Destiny2/Actions/Items/EquipItem/", { method: "POST", body: { itemId: item.id, characterId: charId, membershipType: m.type } });
      r.subclassEquipped = true;
    } catch (e) { r.errors.subclass = e.message; }
    await sleep(200);
  }
  // Profile reads can be cached and stale right after changes, so track socket state from each
  // insert's own response (as DIM does) instead of re-reading the profile.
  const cur = info.cur.slice();
  const insert = async (idx, hash) => {
    if (!hash || cur[idx] === hash) return;
    try {
      await socketGap();
      const res = await bungie("/Destiny2/Actions/Items/InsertSocketPlugFree/", {
        method: "POST",
        body: { plug: { socketIndex: idx, socketArrayType: 0, plugItemHash: hash }, itemId: item.id, characterId: charId, membershipType: m.type },
      });
      const sockets = res?.item?.sockets?.data?.sockets;
      if (sockets) sockets.forEach((sk, i) => { cur[i] = sk.plugHash || 0; });
      else cur[idx] = hash;
      delete r.errors[hash];
    } catch (e) {
      if (/SocketAlreadyHasPlug/i.test(e.message)) cur[idx] = hash; // already there: success
      else r.errors[hash] = e.message;
    }
  };
  r.finalCur = cur;
  const placeGroup = async (idxs, targets) => {
    const want = new Set(targets), kept = new Set(), free = [];
    for (const idx of idxs) {
      if (want.has(cur[idx]) && !kept.has(cur[idx])) kept.add(cur[idx]); else free.push(idx);
    }
    const rest = targets.filter(h => !kept.has(h));
    for (let k = 0; k < rest.length && k < free.length; k++) await insert(free[k], rest[k]);
  };

  for (const a of r.abilities) await insert(a.idx, a.hash);

  // Clear fragment sockets beyond the new fragment count first, so nothing is duplicated or stranded.
  const fIdx = info.groups.fragments || [];
  for (const idx of fIdx.slice(r.fragments.length)) {
    const init = info.def.e[idx]?.i;
    if (init && cur[idx] !== init && !isEmptyPlug(cur[idx])) await insert(idx, init);
  }
  await placeGroup(info.groups.aspects || [], r.aspects);
  await placeGroup(fIdx.slice(0, r.fragments.length), r.fragments);
}

function verifySubclass(r) {
  const cur = r.finalCur || [];
  const problems = [];
  if (!r.subclassEquipped) problems.push(`${r.info.s.def.name} not equipped${r.errors?.subclass ? ` (${r.errors.subclass})` : ""}`);
  const curSet = new Set(cur);
  const why = h => (r.errors?.[h] ? ` (${r.errors[h]})` : "");
  for (const a of r.abilities) if (cur[a.idx] !== a.hash) problems.push(`${plugName(a.hash)}${why(a.hash)}`);
  for (const h of [...r.aspects, ...r.fragments]) if (!curSet.has(h)) problems.push(`${plugName(h)}${why(h)}`);
  if (problems.length) log("Subclass — not applied: " + problems.join("; "));
  else log(`Subclass applied: ${r.info.s.def.name}.`);
  return problems;
}

/* ---------- apply notification (modelled on DIM's loadout notification) ---------- */
function makeToast(title) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.append(wrap); }
  const el = document.createElement("div"); el.className = "toast";
  const head = document.createElement("div"); head.className = "toast-head";
  const t = document.createElement("b"); t.textContent = title;
  const x = document.createElement("button"); x.className = "toast-x"; x.textContent = "×"; x.title = "Dismiss"; x.onclick = () => el.remove();
  head.append(t, x);
  const phase = document.createElement("div"); phase.className = "toast-phase muted";
  const rows = document.createElement("div");
  const msgs = document.createElement("div");
  el.append(head, phase, rows, msgs);
  wrap.append(el);
  const imgs = {};
  return {
    phase(text) { phase.textContent = text; },
    icons(list) {
      const row = document.createElement("div"); row.className = "toast-icons";
      for (const it of list) {
        const img = document.createElement("img");
        img.src = it.icon ? BUNGIE + it.icon : ""; img.alt = ""; img.title = it.name; img.className = "pending";
        imgs[it.key] = img; row.append(img);
      }
      if (list.length) rows.append(row);
    },
    mark(key, ok) { const img = imgs[key]; if (img) img.className = ok ? "" : "fail"; },
    note(text, kind) { const d = document.createElement("div"); d.className = "toast-msg " + (kind || ""); d.textContent = text; msgs.append(d); },
    done(problems) {
      if (problems.length) {
        el.classList.add("bad"); t.textContent = title.replace(/…$/, "") + " — finished with problems";
        phase.textContent = "Failed";
        const locked = problems.some(p => /AtThisLocation|CannotPerformAction/i.test(p));
        if (locked) this.note("The game won't change gear here. Go to orbit or a social space and equip again.", "warn");
        this.note(`${problems.length} problem${problems.length === 1 ? "" : "s"}: ` + problems.join("; "), "err");
      } else {
        el.classList.add("ok"); t.textContent = title.replace(/…$/, "") + " — applied";
        phase.textContent = "Succeeded";
        // Stays until dismissed, or until this tab has been visible for 30 s in total since finishing.
        let shown = 0, last = performance.now();
        const tick = setInterval(() => {
          const now = performance.now();
          if (!document.hidden) shown += now - last;
          last = now;
          if (!el.isConnected) clearInterval(tick);
          else if (shown >= 30000) { clearInterval(tick); el.style.opacity = "0"; setTimeout(() => el.remove(), 450); }
        }, 250);
      }
    },
  };
}

async function equipRoll() {
  const cid = selectedChar();
  const cls = selectedClass();
  const toast = makeToast(`Applying to ${CLASS_NAME[cls]}…`);
  const problems = [];
  const sub = state.roll.subclass && state.roll.subclass.charId === cid ? state.roll.subclass : null;
  if (state.roll.subclass && !sub) log("Subclass roll is for a different character; skipping subclass.");
  const weapons = state.roll.weapons || [];
  let armor = state.roll.armor || [];
  if (armor.length && state.roll.armorClass !== cls) {
    log("Armor roll is for a different class; skipping armor.");
    armor = [];
  }
  const virtual = weapons.filter(i => i.virtual);
  const roll = [...weapons, ...armor].filter(i => !i.virtual);
  toast.icons([
    ...(sub ? [{ key: "subclass", icon: sub.info.s.def.icon, name: sub.info.s.def.name }] : []),
    ...roll.map(i => ({ key: i.id, icon: i.def.icon, name: i.def.name })),
  ]);
  const extra = PAGE.equipExtra ? PAGE.equipExtra(cid, cls, toast) : null; // page-specific step after gear (build.html: mods)
  for (const v of virtual) {
    log(pullText(v));
    toast.note(pullText(v), "warn");
  }
  let subErr = null;
  try {
    if (sub) {
      toast.phase("Applying subclass");
      try { await applySubclass(sub); } catch (e) { subErr = e.message; log("Subclass error: " + e.message); }
    }
    if (roll.length) {
      toast.phase("Moving items");
      const protectedIds = new Set(roll.map(i => i.id));
      for (const it of roll) {
        if (it.owner === cid) continue;
        try {
          if (it.equipped) await dequip(it, protectedIds);
          if (it.owner !== VAULT) { log(`${it.def.name} → vault`); await transfer(it, true, it.owner); }
          await makeRoom(cid, it.def.bucket, protectedIds);
          log(`${it.def.name} → ${CLASS_NAME[cls]}`);
          await transfer(it, false, cid);
        } catch (e) { problems.push(`${it.def.name}: ${e.message}`); toast.mark(it.id, false); }
      }
      toast.phase("Equipping items");
      // Legendaries first so a currently equipped exotic is replaced before the new exotic goes on.
      for (const group of [roll.filter(i => !isExo(i)), roll.filter(isExo)]) {
        try { problems.push(...await equipSet(cid, group)); } catch (e) { problems.push("Equip: " + e.message); }
      }
    }
    // Verify from the action responses (tracked on each item), not from a profile read: Bungie's profile
    // can lag behind for a few seconds after changes and report items as not equipped yet.
    const okLocal = new Set(roll.filter(i => i.owner === cid && i.equipped).map(i => i.id));
    toast.phase("Checking");
    await sleep(1000);
    await loadProfile();
    const byId = new Map(state.items.map(i => [i.id, i]));
    for (const i of roll) {
      const f = byId.get(i.id);
      const fresh = !!(f && f.owner === cid && f.equipped);
      // The actions succeeded but the profile read is stale: keep the inventory consistent with what happened.
      if (!fresh && f && okLocal.has(i.id)) markEquipped(f, cid);
      const ok = fresh || okLocal.has(i.id);
      toast.mark(i.id, ok);
      if (!ok && !problems.some(p => p.startsWith(i.def.name + ":"))) problems.push(`${i.def.name} not equipped`);
    }
    if (roll.length && problems.length === 0) log("Weapons/armor verified.");
    else if (problems.length) log("Not equipped: " + problems.join("; "));
    if (sub) {
      const sp = subErr ? [subErr] : verifySubclass(sub) || [];
      toast.mark("subclass", !sp.length);
      problems.push(...sp.map(p => "Subclass: " + p));
    }
    if (extra) await extra(problems);
    state.roll.weapons = state.roll.weapons?.map(i => byId.get(i.id) || i) || null;
    state.roll.armor = state.roll.armor?.map(i => byId.get(i.id) || i) || null;
  } catch (e) {
    problems.push(e.message);
  }
  toast.done(problems);
  renderRoll();
}

/* ---------- UI wiring ---------- */
const BUSY_IDS = [...(PAGE.busyIds || []), "btnRollAll", "btnRollSubclass", "btnRollWeapons", "btnRollArmor", "btnRefresh", "btnEquip", "charSelect"];
let isBusy = false;
function setBusy(b) {
  isBusy = b;
  for (const id of BUSY_IDS) if ($(id)) $(id).disabled = b;
  for (const el of document.querySelectorAll("[data-reroll]")) el.disabled = b;
  if (!b) $("btnEquip").disabled = !((state.roll.weapons || []).length || (state.roll.armor || []).length || state.roll.subclass);
  if (PAGE.updateButtons) PAGE.updateButtons(b); // build.html: partial rolls need a full build first
}

async function busy(fn) {
  setBusy(true);
  try { await fn(); }
  catch (e) { log("Error: " + e.message); }
  finally { setBusy(false); }
}

async function weaponElement(cid) {
  if (!state.rules.mono) return 0;
  if (state.roll.subclass && state.roll.subclass.charId === cid) return state.roll.subclass.element || 0;
  return await equippedElement(cid);
}

/* Buttons and settings both pages share. Each page wires its own roll buttons, then calls this. */
function wireCommon() {
  $("btnSignIn").onclick = signIn;
  $("btnSignOut").onclick = () => signOut(true);
  $("btnRefresh").onclick = () => busy(async () => { await loadProfile(); populateChars(); renderExoticList("w"); renderExoticList("a"); renderRoll(); });
  $("btnEquip").onclick = () => busy(equipRoll);
  $("charSelect").onchange = () => {
    const cid = selectedChar();
    if (state.roll.subclass && state.roll.subclass.charId !== cid) state.roll.subclass = null;
    if (state.roll.armor && state.roll.armorClass !== selectedClass()) { state.roll.armor = null; state.roll.mods = null; }
    renderExoticList("a");
    renderRoll();
  };
  $("btnCopy").onclick = async () => {
    const v = $("dimString").value;
    try { await navigator.clipboard.writeText(v); log("DIM search copied."); }
    catch { $("dimString").select(); log("Clipboard blocked; text selected for manual copy."); }
  };
  if (state.rules.noDoubleSpecial && state.rules.guaranteedDoubleSpecial) state.rules.guaranteedDoubleSpecial = false;
  for (const cb of document.querySelectorAll("[data-rule]")) {
    cb.checked = !!state.rules[cb.dataset.rule];
    cb.onchange = () => {
      state.rules[cb.dataset.rule] = cb.checked;
      const other = cb.dataset.excl && document.querySelector(`[data-rule="${cb.dataset.excl}"]`);
      if (other && cb.checked) { other.checked = false; state.rules[cb.dataset.excl] = false; }
      store.set(PAGE.rulesKey, state.rules);
      if (state.defs) renderExoticList("w");
    };
  }
  for (const b of document.querySelectorAll("[data-list]")) b.onclick = () => setExoticList(b.dataset.list, b.dataset.set);
}

/* Sign-in, then load account, definitions and inventory. afterProfile runs page-specific loading (build.html: sheet, synergy). */
async function init(afterProfile) {
  if (!CONFIG.apiKey || CONFIG.apiKey.startsWith("PASTE") || !CONFIG.clientId || CONFIG.clientId.startsWith("PASTE")) {
    $("setup").hidden = false;
    return;
  }
  try {
    await handleRedirect();
    const ret = store.get("d2r_return");
    if (ret && state.token) { store.del("d2r_return"); location.replace(ret); return; }
  } catch (e) { log("Error: " + e.message); }
  const t = store.get("d2r_token");
  if (!state.token && t && t.expires > Date.now()) state.token = t;
  if (!state.token) { $("signin").hidden = false; return; }
  $("app").hidden = false;
  await busy(async () => {
    await loadMembership();
    await loadDefs();
    await loadProfile();
    if (afterProfile) await afterProfile();
    populateChars();
    renderExoticList("w");
    renderExoticList("a");
    renderRoll();
  });
}
