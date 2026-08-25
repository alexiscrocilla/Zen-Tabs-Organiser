# Zen Tabs Organiser

Sort your browser tabs into groups using **AI** or **domain-based** grouping in one click.
Inspired by [Arc’s Tidy Tabs](https://arc.net/max).

> **Sine mod.** This mod is packaged for [Sine](https://github.com/CosmoCreeper/Sine),
> the community mod manager for Zen and other Firefox-based browsers. Zen’s own Mods
> Registry only loads CSS and preferences, so the tab-sorting logic — which is JavaScript —
> cannot run there. Sine loads it.

---

## Features

- **Sort** — Group all open tabs using Firefox's AI, a cloud provider (OpenAI, Gemini,
  Mistral), or by domain
- **On-device grouping** — Uses the two models Firefox ships for Smart Tab Grouping:
  one clusters tabs by meaning, the other names each cluster. No API key, nothing leaves
  the browser
- **Clear** — Closes ungrouped, unpinned tabs with animation
- **Auto-colors** — 12-color palette, each group keeping its color across sorts and restarts
- **Auto-icons** — Contextual icons (code, shopping, finance, smart home, etc.), injected
  by this mod itself and restored after a restart without needing to sort again
- **Workspace-aware** — Only affects tabs in the active workspace
- **Leaves your folders alone** — Zen folders and split views are never sorted,
  ungrouped or removed
- **Animation** — Visual feedback when expanding or collapsing groups
- **Settings** — Full configuration in the Sine mod settings dialog (AI provider, API key,
  model)
- **Hot enable / disable** — The mod cleans up after itself, so toggling or uninstalling
  it takes effect without a browser restart

---

## Requirements

- [Zen Browser](https://zen-browser.app/)
- [Sine](https://github.com/CosmoCreeper/Sine) installed in that browser
- [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) — **optional**.
  Everything works without it: group colors, group icons and the collapse animation are
  all handled here. If you do run it, it takes over how groups look and this mod steps
  aside, so the two never fight.

---

## Installation

Open **`about:preferences#sineMods`** in Zen.

### From the Sine store

Search for **Zen Tabs Organiser** in the marketplace list and click **Install**.

### From this repository

1. Turn on **"Enable installing JS from unofficial sources"** in Sine's settings
   (`sine.allow-unsafe-js`). Sine silently skips the scripts of any mod that is not from
   its official store until this is enabled — the styling would load but no buttons would appear.
2. In **Installation** → *"or, add your own locally from a GitHub repo"*, paste:

   ```
   alexiscrocilla/Zen-Tabs-Organiser
   ```

3. Click **Install**.

---

## AI Configuration

By default, grouping is **domain-based** — no network access at all.

### On device, no API key

Pick **Local — Firefox AI** as the provider and that is the whole setup. It runs
`Mozilla/smart-tab-embedding` to cluster tabs by meaning and
`Mozilla/smart-tab-topic` to name each cluster, both through Firefox's own ML engine.
Tab titles never leave the browser.

Two things worth knowing:

- The models are downloaded the first time you sort, so that run is slower than the rest.
- The engine will not start unless `browser.ml.enable` is on, which the mod turns on
  for you the first time you choose this provider — never before.

If a cluster ends up close to a group you already have, it joins that group
rather than creating a near-duplicate beside it.

### Through a cloud provider

To use a hosted model instead:

1. Open **`about:preferences#sineMods`** → **Zen Tabs Organiser** → the settings (gear) button
2. Pick an **AI provider** (Gemini, Ollama, Mistral, or OpenAI)
3. Enter your **API key** (not needed for local Ollama)
4. Optionally set a custom **model** name (defaults: `gpt-4o-mini`, `gemini-2.0-flash`, etc.)

Tab titles and URLs are sent to the provider you select. With **None** or **Local —
Firefox AI**, nothing leaves the browser.

Settings apply immediately — the mod reads its preferences at the moment you press Sort,
never caching them at load time.

---

## Usage

1. Click **Sort** — tabs are analyzed and grouped
2. With AI: titles and URLs are sent to the provider for semantic categories
3. Without AI: grouping uses keywords / hostnames
4. Groups get colors and icons according to your settings
5. **Clear** closes ungrouped, unpinned tabs

---

## Repository Files

| File | Purpose |
|------|---------|
| `theme.json` | Sine manifest (metadata, `style`, `scripts`, `preferences`) |
| `zen-tabs-organiser.uc.js` | Main logic, injected by Sine into `chrome://browser/content/browser.xhtml` |
| `chrome.css` | Styles for groups, buttons and animations |
| `preferences.json` | Preference schema shown in the Sine mod settings dialog |

---

## Notes for Contributors

- Sine only injects files whose name ends in `.uc.js`, `.uc.mjs` or `.sys.mjs`, and only
  those declared under `scripts` in `theme.json`.
- The script registers `window.addUnloadListener(destroy)`, which is what makes
  `"supportsUnload": true` meaningful: Sine calls it before re-injecting or removing the mod.
  Anything the script adds — buttons, commands, `gZenWorkspaces` hooks, observers,
  timers — must be undone there.
- The script may be injected into a window that already has it. It bails out early when
  `window.ZenTabsOrganiser.loaded` is set.
- Styles belong in `chrome.css`, not in an injected `<style>` element: Sine loads and
  unloads that file with the mod.
- The group header is a Zen `<vbox>`, which stacks vertically. It needs an explicit
  `flex-direction: row` or an injected icon lands above the title instead of beside it.
- The icon is sized and placed off `--tab-inline-padding`, the same variable Zen uses for
  tab padding, so it lands exactly where a tab's favicon does and follows tab density.
  Measured: 0px between the group icon and a tab favicon, and 0px between the group
  title and a tab title.
- Group icons this mod injects itself are persisted in SessionStore (`zenTidyIcons`,
  keyed by group id) and restored at startup, mirroring how colours are handled —
  without it, the icon existed only in DOM Zen rebuilds from the session on every
  restart, so it stayed gone until the next Sort. Advanced Tab Groups persists and
  restores its own icons independently, so the restore here backs off entirely when
  ATG is detected; racing it would leave two icons on the same group, so it runs late
  (8.5s in), after ATG's own detection has had time to settle.
- Group colours all derive from `--tab-group-color`. The five `--zto-*` values at the top
  of the design block in `chrome.css` are the only knobs for tint and text; label text is
  the group colour mixed most of the way to the normal tab text colour, which keeps it
  legible on either theme without a second rule. Measured contrast against the composed
  background: 8.7:1.
- Group appearance is shared with Advanced Tab Groups when it happens to be installed,
  and both load as Sine user sheets, so whichever loads last wins every tie. The whole
  group design in `chrome.css` therefore sits behind
  `@media not (-moz-bool-pref: "zen-tabs-organiser.atg_active")`; the script keeps that
  pref in sync with `globalThis.advancedTabGroups`. ATG on, ATG owns the look; ATG off,
  this mod styles groups with nothing ATG builds. Styling groups unconditionally made ATG
  look worse; dropping the styling left plain groups when ATG is off.
- Group color is keyed by group id and persisted, never derived from a position in a list.
  The map is rebuilt from DOM order on every sort, so an index-based color changes under
  the same group.
- The group design is paint only — background and gradient — never geometry. No border,
  margin or padding override on a group's boxes: a `border-inline-start: 3px` shifts the
  content 3px and the whole group visibly misaligns against loose tabs.
- Firefox resolves a group's colour through `var(--tab-group-<code>)`, written by its
  `set color(code)` setter. Publishing a palette entry under a guessed name is fragile —
  one release used `--tab-group-color-<code>`, which Firefox 154 never reads, and every
  group came out grey. Set `--tab-group-color` and friends directly on the element instead.
- Animate `transform` and `opacity`; they skip layout and paint. Keep UI motion under 300ms,
  and scope every transition to the element that needs it — a transition on
  `.tabbrowser-tab` applies to every tab in the browser, forever.
- Two things must never be styled or scripted, the same two Advanced Tab Groups skips:
  `<zen-folder>`, which Zen lays out and animates itself, and `tab-group[split-view-group]`,
  whose tabs must stay put. Every selector is anchored on
  `tab-group:not([split-view-group])` with child combinators, because Zen nests groups,
  folders and split views inside one another and a descendant selector leaks into all of them.
- Never hide `.zen-tab-group-start`. It looks like a decorative divider but it is the
  layout anchor Zen animates (`marginTop`) to collapse a folder; `display: none` removes
  its margin box and silently breaks collapsing for every folder in the browser.
- A user sheet's `!important` outranks both inline styles and the Web Animations API, so
  an over-broad `!important` here disables Zen's own animations rather than merely restyling them.
- Collapsing a plain tab group is this mod's job. Firefox hides collapsed tabs with
  `tab-group[collapsed] > .tabbrowser-tab`, a child combinator, and Zen's tabgroup patch
  moves the tabs into `.tab-group-container`, so the native rule never matches. Zen only
  animates its own folders.

---

## Migrating from the Zen mod format

Earlier versions of this repository shipped `mod.json`, `chrome.js` and `style.css` for
Zen's Mods Registry. Those became `theme.json`, `zen-tabs-organiser.uc.js` and `chrome.css`.
Preference names are unchanged, so existing settings carry over. If you had the old version
installed through Zen, remove it there before installing this one so the two do not both
add buttons.

---

## Publishing to the Sine store

The Sine marketplace is curated. Submit through the issue template in the [Sine repository](https://github.com/CosmoCreeper/Sine),
which maps a mod ID to its GitHub repository in the [store](https://github.com/sineorg/store).

---

## License

[MIT](LICENSE)
