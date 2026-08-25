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
- No other mods are required. Group colors, group icons and the collapse animation are
  all handled here. This mod does not try to detect or coordinate with any other mod
  that also styles tab groups (e.g. Advanced Tab Groups) — running one alongside it
  means the two style groups independently and may visibly disagree.

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
- A group header is sized to match a tab row, by mirroring the two rules Firefox uses
  for one: `.tab-background` (`--tab-min-height`, `--tab-margin-block`,
  `--tab-border-radius`) and `.tab-content` (`--tab-inline-padding`). Firefox otherwise
  pins group labels to `--tab-group-label-height`, which is `--tab-min-height` minus
  14px, so headers render visibly shorter than tabs unless that is undone.
- Zero the header's block padding. Firefox pads it asymmetrically, and only while the
  group is open, to make room for the group line it draws under the label
  (`tab-group:not([collapsed]) > & { padding-block-end: var(--space-small) }`). That
  padding adds to `min-height`, so an open group renders taller than a closed one with
  its contents pushed up, while a closed one sits centred.
- Centre the label text the way Firefox does — by making the line box as tall as the row
  (`line-height`) — rather than by relying on the container's `align-items` or the auto
  block margins Firefox also sets, either of which a theme can disturb. Raising the
  label's `min-height` is not the same thing: its box fills the row while the text stays
  at the top of it.
- A group's painted box lines up with an ordinary tab's on both edges. Zen insets a tab's
  visible box with `.tab-background { margin-inline: var(--tab-margin-block) }`, and
  separately indents a group's direct children by `--space-medium`. Only the first is
  wanted; the indent is dropped so a group starts where a tab starts. The group's own tabs
  then sit that inset inside its background, which is what makes the tint read as holding
  them.
- The injected icon carries Firefox's own `tab-icon-image` class alongside this mod's.
  That class is styled by an unscoped rule giving it 16x16 and
  `margin-inline-end: var(--tab-icon-end-margin)`, so size and the gap before the title
  are inherited rather than restated — a theme like Nebula that restyles favicons
  restyles this too. The `zto-` class only carries colour — and one
  `visibility: visible !important`, because that same inherited class also brings
  `.tab-icon-image:not([fadein]) { visibility: hidden }`, and an icon no tab owns never
  gets a `[fadein]` attribute. Measured: exact parity with a
  tab on row height, icon size, icon x and title x, and that parity holds when a theme
  changes `--tab-min-height` or the favicon size.
- Group icons this mod injects itself are persisted in SessionStore (`zenTidyIcons`,
  keyed by group id) and restored at startup, mirroring how colours are handled —
  without it, the icon existed only in DOM Zen rebuilds from the session on every
  restart, so it stayed gone until the next Sort.
- Group colours all derive from `--tab-group-color`. The five `--zto-*` values at the top
  of the design block in `chrome.css` are the only knobs for tint and text; label text is
  the group colour mixed most of the way to the normal tab text colour, which keeps it
  legible on either theme without a second rule. Measured contrast against the composed
  background: 8.7:1.
- Group appearance is applied unconditionally, with no attempt to detect or coordinate
  with any other mod that also styles tab groups. An earlier version gated the whole
  design behind a preference synced from `globalThis.advancedTabGroups`, deferring to
  Advanced Tab Groups when it was running — but that coordination scheme was what caused
  colours and icons to visibly flash in on restart (see below), so it was removed.
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
