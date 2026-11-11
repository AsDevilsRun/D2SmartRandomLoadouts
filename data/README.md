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
- **Weapon types / Weapons**: weapons the build should include. **Force weapon**: blank or Y = required; N = only 4× more likely. **Or weapon**: Y = the exotic may roll with any subclass; the weapon is required when the rolled subclass doesn't meet the row, and only more likely when it does.
- **Focus**: a role (Melee, Grenade, Super, Class, Weapons, Health) looked up in focus.csv to pick armor archetypes for the legendary pieces.
- **Exotic perk, Notes**: reference only. Notes marked "Hand-corrected" were adjusted where the automatic match picked up abilities the exotic only mentions in passing, or elements from loose keywords. Notes starting "Prismatic N:" say why Prismatic was excluded.
- Sources: Compendium = filled from the Destiny Data Compendium exotic text; DIM = pre-filled from DIM's exotic-synergy data. Exotic perk names: deepsight.gg / Clarity data.
- Exotics not listed fall back to DIM's data, or to no restriction if DIM has none.
- The Compendium writes "Promethium Spurs" and "Loreley Splendor"; these files use the in-game "Promethium Spur" and "Loreley Splendor Helm".

## focus.csv: Focus role → armor archetypes

| Column | Meaning |
|---|---|
| Focus | Role named in exotic_synergy.csv's Focus column |
| Archetypes | Armor archetypes allowed for the legendary pieces |

## Tag weighting

A plug, exotic weapon or set bonus gets points for each tag it shares with the build (the exotic armor's tags plus the rolled aspects' and fragments' tags). Weight = tier weight × (1 + points, capped at 6).

| File | Columns | Used for |
|---|---|---|
| exotic_weapons.csv | Exotic, Tags | Exotic weapon weighting |
| exotic_armor.csv | Exotic, Class, Tags, Mentions | Build tags; Mentions = aspects, fragments and abilities made 3× more likely |
| subclass_plugs.csv | Name, Kind (aspect / fragment / ability), Tier, Tags | Aspect, fragment and ability weighting; aspect and fragment tags join the build tags |
| set_bonuses.csv | Set, Pieces, Bonus, Tier, Tags, Weapon types | Armor set bonus weighting (+3 points when a rolled weapon is one of the listed types) |
| tag_points.csv | Tag, Points | Points a shared tag is worth; every tag used elsewhere must be listed here |
| tiers.csv | Tier, Weight | Tier letter → weight (tiers from Destiny 2: Endgame Analysis) |
