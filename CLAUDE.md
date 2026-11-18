# D2 Smart Random Loadouts: notes for Claude

Read this first in any new session on this repo. It records how the site works, the decisions already made, and how the owner likes to work. The data files themselves are documented in `data/README.md`.

## Project

A Destiny 2 loadout randomizer served by GitHub Pages straight from this repo (no build step).

- `index.html`: pure random loadout. Every eligible name is equally likely. Each button rolls only its own section.
- `build.html`: "Smart Build". Weighted by synergy tags and the owner's synergy rules, with balancing so subclasses, exotic weapons and abilities come out even over many rolls.
- `core.js`: everything both pages share (Bungie API, sign-in, caches, inventory, subclass sockets, weapon rolling, equipping, rendering). Each page defines `PAGE` before loading it.
- `data/*.csv`: all tags, tiers and synergy rules, read by `build.html` on every load. See `data/README.md`.
- `tools/`: the roll simulation and the page tests (below). Not used by the site.

Everything runs in the visitor's browser: HTML is layout, CSS is styling, all logic is JavaScript.

## How the owner works

- Discuss before starting anything that takes more than a few minutes. Don't start long work on your own initiative.
- "Can you X?" is a question. Answer it; don't do X.
- The owner commits by hand (GitHub web upload or vscode.dev). Claude has read access only. Deliver changed files as a zip that keeps the repo's folder layout, plus a one-line commit message. Don't push or ask for push access.
- Before saying something is or isn't committed, check `origin` (`git fetch`), don't assume.
- After any change that affects randomness (rolling, balancing, synergy rules, tags, tiers, weights, data CSVs): run the simulation at 300,000 presses, run `tools/sim/parity.py` on its output, report the results inline, and update the roll-rate dashboard with the new CSVs (including `parity.csv`). Parity means: exotic armor even within each class, subclasses even within each class, exotic weapons in a reasonable range around even. If the change isn't modeled by the simulation, say so instead of implying it was tested.
- Otherwise, don't rebuild the roll-rate dashboard unless asked.
- Serious mode: no filler, no offers, no soft closings.

## core.js

- `PAGE` hooks: `rulesKey`, `defaultRules`, `forcedRules`, `extraState`, `busyIds`, `returnTo`, `renderExtra`, `equipExtra`, `updateButtons`, `pickWeapon`, `weaponSearchOrder`.
- Pages load `core.js?v=5`. Bump the number on both pages whenever `core.js` changes, or browsers may pair a new page with an old cached `core.js` for up to 10 minutes.
- Weapon rolling (`rollWeapons`, `rerollWeaponSlot`) is shared. `build.html` plugs in weighted picks (`PAGE.pickWeapon(cands, need)`) and optional weapon needs (`{ test(item), label, prefer(item) }`, or a list of them, each met by some weapon; one weapon can meet several; `prefer` multiplies weights for the weapon picked to meet the need); `index.html` uses the defaults.
- Sign-in: public OAuth client, so tokens last about an hour and can't be refreshed; a 401 shows the sign-in button. The API key in `CONFIG` is public by necessity and is Origin-restricted in the Bungie portal.
- Caches: IndexedDB database `d2srl`, store `kv`: item definitions (`defs_<SLIM_VERSION>_<manifest>`), per-item lookups (`ent_…`), Collections sources (`src_…`), exotic weapon balance factors (`wbal<BALANCE_VERSION>_<class>_…`). localStorage: `d2r_token`, `d2r_rules` (index), `d2b_rules` (build), `d2r_off_w` / `d2r_off_a` (exotic lists).
- Equipping verifies from each action's response (equipStatus 1 = success), not from a profile read, because Bungie's profile lags behind changes.

## build.html

- Tag weight = tier weight × (1 + points, capped at 6); ×3 for plugs the exotic armor mentions; capped at 10. Tiers: S 2.0, A 1.6, B 1.3, C 1.0, D 0.8, E 0.65, F 0.5, PvP 0.3 (`data/tiers.csv`).
- Synergy rules come only from `data/exotic_synergy.csv`. DIM's exotic-synergy data was removed: an exotic without a row has no subclass or weapon restriction.
- Only "Roll build" works until a full build exists for the selected character; the other roll buttons and per-weapon rerolls are disabled until then.
- Three kinds of balancing:
  - **Subclasses**: `balanceSubclassWeights`, calculated exactly on every roll from the owned exotic armor and the synergy rows. No simulation, nothing saved.
  - **Exotic weapons**: `ensureWeaponBalance` simulates `BALANCE_BUILDS_PER_ARMOR` (20) builds per exotic armor piece, fits one factor per exotic weapon so every exotic is equally likely within a class (counting every exotic in the game as owned), and saves the factors in IndexedDB until the data files, rules, exotic armor list or inventory change. 20 builds per piece leaves some noise (per-class range about 0.55–0.9% against 0.7% even), and the same skew repeats for that browser until the factors are recalculated.
  - **Abilities** (super, grenade, melee, class ability, jump): `ensureAbilityBalance`, worked out directly per subclass socket; only a synergy row's forced picks are sampled (`ABILITY_RULE_SAMPLES`, 40). Kept in memory. Balanced within each subclass, so a subclass with one super (Strand Hunter: Silkstrike) shows that super whenever the subclass rolls.
- Picks a synergy row requires (Golden Gun for Celestial Nighthawk, Still Hunt, Thorn/Osteo Striga) happen before weighting, so they can sit above an even share.
- **Artifact** (rule "Roll and apply the artifact", on by default): rolled last on every roll (Roll build, partial rolls, weapon slot rerolls, "Reroll artifact") and never changes the rest of the build. `loadArtifacts` reads the character's artifacts (bucket 1506418338) and their sockets fresh from Bungie; a slot's perks are its plug set filtered to plug category 3878350949 (DIM's ArtifactPerks), so the 2 / 3 / 2 tier layout isn't hard-coded. Perks: weighted one at a time, tier weight ^ `ARTIFACT_TIER_POWER` (3) × (1 + shared tag points, capped at 6), each pick's tags join the build tags for the next, every set kept placeable (`matchPerks`). Weapon types / Weapon element (an element, or Super / Grenade / Melee for the rolled ability's element) / Weapon perks (a plugged perk or frame by name, read from the weapon's sockets; Energy Acceleration: Micro-Missile Frame) / Weapon champion (Barrier / Overload / Unstoppable, as `champsOf` reads it) / Subclass / Abilities in `artifact_perks.csv` are hard requirements; the weapon columns must all be met by one weapon. Boost multiplies a perk's weight once it's allowed. Artifact: weight = (average weight of its best perks × (1 + `ARTIFACT_FOCUS_BONUS` 0.25 per matching focus element or weapon type in `artifacts.csv`)) ^ `ARTIFACT_FIT_POWER` (3). Equip: perks already in place stay; a wanted perk in another slot is emptied out first (as DIM does). Perks not in the CSV count as tier C with no tags. Conductive Cosmic Crystal and Conductive Cosmic Needle need an Arc or Void grenade, melee or super. Elemental Supercharger needs an Overload weapon of the super's element. Particle Reconstruction, Argent Ordnance and Argent Quiver have Boost 10 (the owner: extremely strong when their weapon is there).
- `orWeaponReady` remembers its answer per rule until the inventory, exotic weapon list or the unowned-exotics / guaranteed-double-special settings change.

## Decisions already made

- Kinetic slot never rolls Arc, Solar or Void weapons.
- Celestial Nighthawk: Or weapon share 20%, Weapon chance 25% (Still Hunt). The owner is fine with Hunter getting Still Hunt somewhat more than even.
- Necrotic Grip: Weapon chance 50% for Thorn and Osteo Striga. The old 4× soft boost doesn't apply to rows with a Weapon chance.
- Oathkeeper excludes crossbows (Opaque Hourglass, A Good Shout, Submersion, Heirloom), which the game types as Combat Bow.
- Wolfsbane counts as a sword for Stronghold.
- Foetracer: one weapon must match the element of the rolled grenade, melee or super (synergy sheet column Weapon element = "Grenade, Melee, Super"), and heavy weapons are 4× as likely for that pick (Preferred ammo = Heavy, `PREFERRED_AMMO_BOOST`). Verity's Brow (Grenade) and Mantle of Battle Harmony (Super) use the same column; they used to be hard-coded.
- Sturm (build.html only): always rolls with a weapon whose plugged perks include Together Forever (Drang, Unfall), or any owned weapon named Drang, overriding No double primary; other weapon rules still apply to the partner. Together Forever is matched by plug name or by perk hash (plug names can be missing from the lite definitions). Only a player who owns no Drang or Together Forever weapon gets a Drang placeholder to pull; if they own one and the rules rule it out, that roll goes without Sturm. Rerolling Sturm's slot rerolls the partner's slot too. index.html doesn't pair. Exotic weapon balancing ignores the pairing.
- Exotic weapon balancing: equal within each class, all exotics counted as owned, forced picks balanced too, factors stratified by exotic armor piece.
- Subclass plug tags (`data/subclass_plugs.csv`), cleaned up in commit ea58140:
  - Jumps have no tags.
  - Supers carry no "super", "resist" or "airborne" tag; no grenade, melee or class ability carries its own slot's tag. "super", "grenade", "melee" and "class" stay on aspects, fragments and exotic armor, where they mean something.
  - Rejected: volatile/freeze/shatter/tangle on Feed the Void; crystal/shatter on Consecration; invis on Weavewalk.
- Spark of Beacons: rolls only with an Arc special or heavy weapon (`subclass_plugs.csv` column Weapon need = "Arc Special, Arc Heavy"). Any aspect or fragment can use the column. A plug with a Weapon need is left out of the subclass roll unless an eligible weapon meets it (Monochromatic: that subclass's element). Its need sits alongside the exotic's need; if both can't be met together, the plug's need is dropped with a log note. Exotic weapon balancing ignores plug weapon needs.
- Declined: a slot-and-ammo correction in weapon balancing; an exotic-share column to make Triton Vice pick exotic glaives less often.
- `index.html`: the "Randomize subclass in Roll all" setting was removed; Roll all always rolls the subclass. Rolling the subclass no longer rerolls weapons that clash with Monochromatic.

## Open items

- **90-day sign-in** (planned, not started): switch the Bungie app to a confidential client (gets a client secret and refresh tokens; Bungie's docs give `refresh_expires_in` 7776000 s = 90 days), hold the secret in a small Cloudflare Worker that does the code exchange and refreshes, and change `handleRedirect`, token storage and the 401 path in `core.js`. Set up the Worker first, then switch the app type and commit the site change together. Unverified: whether Bungie issues a new refresh token on each refresh (if not, sign-in lasts 90 days from first sign-in), and whether the current public flow stops working the moment the app becomes confidential.
- Saved exotic weapon factors don't recalculate when the player unlocks a new aspect or fragment; ability factors recalculate on any weapon inventory change (cheap).
- Visitor counts: GitHub Pages has none; would need something like GoatCounter or Cloudflare Web Analytics.

## tools/

### Roll simulation

```
python3 tools/sim/simulate.py [presses] [output folder]
```

Defaults: 60,000 presses (split evenly across classes) and `tools/sim/out/` (ignored by git). Takes about 20 s per 50,000 presses. It reads `data/*.csv` and writes `subclasses.csv`, `exotic_armor.csv`, `exotic_weapons.csv`, `aspects.csv`, `fragments.csv` and `abilities.csv` (percent of that class's or class-and-subclass's rolls), plus `artifacts.csv` (by class and subclass), `artifacts_all.csv` (by class), `artifact_perks.csv` (share of an artifact's rolls that include each perk; 7 per roll, so an artifact's perks add up to 700%) and `artifact_perk_fit.csv` (for each perk with a requirement: share of rolls whose build meets it, and of those the share that pick its artifact, take the perk on that artifact, and take it at all). Stand-in weapons have no perks or frames, and the simulation has no champion data, so Weapon perks and Weapon champion needs (Energy Acceleration, Elemental Supercharger) are never met in the simulation.

It mirrors build.html's "Roll build" with every exotic and subclass item owned: subclass balancing, synergy rules (incl. Or weapon share and Weapon chance), ability balancing, aspect/fragment tag weighting and stratified exotic weapon balancing. Legendary weapons are stand-ins (5 per weapon type) with no element, so Weapon element needs (Foetracer, Verity's Brow, Mantle of Battle Harmony), aspect/fragment Weapon needs (Spark of Beacons) and Preferred ammo aren't modeled; nor is the Sturm pairing. The artifact is modeled for pick rates only, from its own random stream (`AR`) so the other outputs don't change: all 7 artifacts owned, slots 2 / 3 / 2 by tier, the build's other two weapons are stand-in legendaries with a random element from their slot (No double primary / special), and legendary weapon weighting isn't modeled. Artifact rates aren't parity-checked: fit-weighting is the point. If you change the rolling or balancing code in `build.html`, change the simulation to match.

### Parity check

```
python3 tools/sim/parity.py [simulation output folder]
```

Reads the simulation's output and, per class, checks every rate against an even share: exotic armor within ±15%, subclasses within ±10%, exotic weapons within ±35%. Writes `parity.csv` next to the inputs and exits 1 if any group fails. Bands assume 300,000 presses; at the 60,000 default, sampling noise alone can push exotic armor past ±15%. Last run (commit b92ddee + artifact Boost / Elemental Supercharger changes): all 9 checks pass; armor 2.01–2.25% (even 2.13%), subclasses 16.46–16.84%, exotic weapons 0.63–0.86% (even 0.71%).

`tools/sim/inputs/` holds game data the CSVs don't: aspects per subclass and abilities per subclass slot (Destiny Data Compendium; jumps and Prismatic supers from the owner), ability elements, fragment slots per aspect (Destiny 2: Endgame Analysis), exotic weapon type/ammo/slot, and exotic weapon tier letters. Update these when the game adds abilities, aspects or exotic weapons.

### Page tests

```
cd tools/tests && npm install && npm test
```

jsdom loads the real pages with a mocked Bungie API and fake IndexedDB. The suites cover booting and definition caching, weapon rules and the complete weapon search, Postmaster pulls, equip verification and refused equips, sign-in expiry, rule storage, section-only rolls on index.html, partial-roll gating, weapon type matching, tag/CSV loading (`tag-data.test.js` also compares with the original baked-in data at commit ae8056e), Or weapon share, Weapon chance, Foetracer's weapon element and heavy preference, aspect/fragment weapon needs (Spark of Beacons), artifact rolling and equipping, Sturm pairing, weapon and ability balancing, partial-roll gating, and the caches. The weapon-balance and ability-balance suites check rates, so they're statistical; rerun once before treating a single failure as real. Run them after any change to the pages or `core.js`.

## Artifacts outside the repo

- Roll-rate dashboard ("Smart Build roll rates"): https://claude.ai/artifact/1NuW7kXsBh6xxamSYuEmYm (artifact slug 030ef984-b5b4-4fab-99e2-8d1bc8dce84a). Its datasets are the simulation's six output CSVs plus `parity.csv`, uploaded as assets; a Parity checks section shows `parity.csv`. Last updated from commit b92ddee plus the artifact Boost / Elemental Supercharger changes, 300,000 presses; has Artifacts, Artifacts by subclass, Artifact perks and Perks when the build can use them sections (datasets `artifacts_all`, `artifacts`, `artifact_perks`, `artifact_perk_fit`).
- "Ability pick rates: data sources" sheet: https://claude.ai/artifact/X7RwPpnv9YkY8aMtBQXGwR. Its Class abilities row ("partly inferred") is out of date; class abilities now come from the Compendium.
- Reference spreadsheets the owner shared: Destiny Data Compendium and Destiny 2: Endgame Analysis (source of most tags and tiers).
