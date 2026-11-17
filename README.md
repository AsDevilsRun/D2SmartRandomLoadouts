# Smart Build data

build.html reads every file in this folder each time it loads. Edit a file (any spreadsheet app or text editor), save it as CSV with the same name, and commit. The change applies on the next page load.

Lists inside a cell are comma-separated. Names follow the game's names (capitalization and curly quotes don't matter). The page log lists names and tags it couldn't match.

## exotic_synergy.csv: synergy rules, one row per exotic armor

- Names must match the game exactly. Blank cell = no restriction for that column.
- Several values in one cell: separate with commas, using in-game names (e.g. "Golden Gun: Marksman, Golden Gun: Deadshot").
- **Elements**: Arc, Solar, Void, Stasis, Strand.
- **Supers, Grenades, Melees, Class abilities, Aspects**: the build must use one of the listed options.
- **Movement**: the movement ability the exotic needs (e.g. Blink). Blank = any.
- **Class abilities**: filled when the exotic's text ties it to one class ability type (e.g. barricades but not Thruster, Rifts but not Phoenix Dive, or a specific dodge). Blank = any class ability.
- **Prismatic OK**: Y lets Prismatic count when it can meet the row; N keeps it to elemental subclasses. Rows with no element and no required abilities work with any element, so they are Y. Prismatic OK was set to Y only when Prismatic offers at least one listed option in each filled column.
- **Force element ability**: for rows with Elements and Prismatic OK = Y, a Prismatic roll forces at least one grenade or melee of a listed element. N turns that off for the row (e.g. Fallen Sunstar works off Ionic Traces). Blank = Y.
- **Prismatic needs**: when the exotic rolls on Prismatic, these items replace the Supers/Grenades/Melees/Aspects requirements (e.g. Gwisin Vest: Spectral Blades on Nightstalker, Stylish Executioner on Prismatic). Ignored on elemental subclasses.
- **Weapon types / Weapons**: weapons the build should include. **Force weapon**: blank or Y = required; N = only 4× more likely. **Or weapon**: Y = the exotic may roll with any subclass; the weapon is required when the rolled subclass doesn't meet the row, and only more likely when it does. **Or weapon share**: how often an Or weapon exotic takes a subclass that doesn't meet the row (and so gets the weapon instead). Blank = 20%. Celestial Nighthawk: 20%, so about 4 in 5 of its rolls are Golden Gun on Solar or Prismatic. **Weapon chance**: for rows whose weapons are only more likely (Force weapon N, or an Or weapon row whose subclass is met), the share of rolls that include one of them for sure; the rest roll as if the row listed no weapons (no 4× boost). Blank = 0%, which keeps the 4× boost. Necrotic Grip: 50%.
- **Excluded weapons**: weapons that never count for Weapon types, even though the game gives them that type. Crossbows (Opaque Hourglass, A Good Shout, Submersion, Heirloom) are typed "Combat Bow" in the game's data, so Oathkeeper lists them here.
- **Weapon element**: Grenade, Melee, Super and/or Subclass. The build's weapons must include one whose element matches any listed rolled ability (Foetracer: "Grenade, Melee, Super"; Verity's Brow: Grenade; Mantle of Battle Harmony: Super). On Prismatic, Super means the super's element. Follows Force weapon like Weapon types do.
- **Preferred ammo**: Primary, Special or Heavy. When a row's weapon rule picks its weapon, weapons of this ammo type are 4× as likely (Foetracer: Heavy). Blank = no preference.
- **Focus**: a role (Melee, Grenade, Super, Class, Weapons, Health) looked up in focus.csv to pick armor archetypes for the legendary pieces.
- **Exotic perk, Notes**: reference only. Notes marked "Hand-corrected" were adjusted where the automatic match picked up abilities the exotic only mentions in passing, or elements from loose keywords. Notes starting "Prismatic N:" say why Prismatic was excluded.
- Sources: Compendium = filled from the Destiny Data Compendium exotic text; DIM = pre-filled from DIM's exotic-synergy data. Exotic perk names: deepsight.gg / Clarity data.
- Exotics not listed have no subclass or weapon restriction (their tags in exotic_armor.csv still weight the roll).
- The Compendium writes "Promethium Spurs" and "Loreley Splendor"; these files use the in-game "Promethium Spur" and "Loreley Splendor Helm".

## focus.csv: Focus role → armor archetypes

| Column | Meaning |
|---|---|
| Focus | Role named in exotic_synergy.csv's Focus column |
| Archetypes | Armor archetypes allowed for the legendary pieces |

## Tag weighting

Exotic weapons are balanced: within each class, every exotic weapon comes up about equally often over many rolls (counting every exotic in the game as owned). Tags, weapon rules and Weapon chance decide which builds an exotic lands on, not how often it appears overall. Weapons a row names directly (Celestial Nighthawk's Still Hunt, Necrotic Grip's Thorn and Osteo Striga) can end up above even odds when their row's own rate is higher than that. The page works the balance out itself the first time you roll on a class, and again whenever these files, the rules or your inventory change.

Abilities are balanced the same way: on each subclass, every super, grenade, melee, class ability and jump comes up about equally often in its slot. Tags still decide which exotic armor an ability tends to come with, so an ability with no tags in subclass_plugs.csv mostly fills builds where nothing else matches. Give an ability tags here if it should pair with particular exotics. Abilities a synergy row requires can end up above an even share.

A plug, exotic weapon or set bonus gets points for each tag it shares with the build (the exotic armor's tags plus the rolled aspects' and fragments' tags). Weight = tier weight × (1 + points, capped at 6).

| File | Columns | Used for |
|---|---|---|
| exotic_weapons.csv | Exotic, Tags | Exotic weapon weighting |
| exotic_armor.csv | Exotic, Class, Tags, Mentions | Build tags; Mentions = aspects, fragments and abilities made 3× more likely |
| subclass_plugs.csv | Name, Kind (aspect / fragment / ability), Tier, Tags, Weapon need | Aspect, fragment and ability weighting; aspect and fragment tags join the build tags. Weapon need: see below |
| set_bonuses.csv | Set, Pieces, Bonus, Tier, Tags, Weapon types | Armor set bonus weighting (+3 points when a rolled weapon is one of the listed types) |
| tag_points.csv | Tag, Points | Points a shared tag is worth; every tag used elsewhere must be listed here |
| tiers.csv | Tier, Weight | Tier letter → weight (tiers from Destiny 2: Endgame Analysis) |

## subclass_plugs.csv: Weapon need

An aspect or fragment with a Weapon need rolls only with a weapon that meets it. List one or more items, comma-separated; a weapon meeting any one item is enough. Each item can name an element (Kinetic, Arc, Solar, Void, Stasis, Strand), an ammo type (Primary, Special, Heavy) and a weapon type, in any combination: "Arc Special, Arc Heavy" (Spark of Beacons), "Strand Sword", "Heavy". The plug is left out of the subclass roll when no eligible weapon meets its need (owned, allowed by the weapon rules and Monochromatic). The need is met alongside the exotic armor's weapon rule, by the same weapon or another one; if both can't be met together, the plug's need is dropped and the log says so.
