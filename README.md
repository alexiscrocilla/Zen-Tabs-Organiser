# Zen Tabs Organiser

Turn a crowded vertical tab sidebar into clear, color-coded tab groups with one click. Zen Tabs Organiser can sort locally by domain, use Firefox's on-device AI, or connect to your preferred AI provider.

Runs on **Zen Browser** and on **Firefox** with vertical tabs.

<p align="center">
  <img src="Screenshot.png" alt="Zen sidebar before sorting, then after sorting with opened and collapsed tab groups" width="960">
</p>

## Why use it?
- **One-click sorting** into meaningful tab groups
- **Private by default** with domain-based grouping and no network requests
- **On-device AI** through Firefox's own Smart Tab Grouping models
- **Automatic colors and icons** that persist across browser restarts
- **Workspace-aware behavior** that only touches the active workspace (on Zen)
- **Safe around browser features**: pinned tabs, Zen folders, and split views are left alone
- **Quick cleanup** of loose tabs with the **Clear** button

## Requirements
- [Zen Browser](https://zen-browser.app/) 1.21+, or [Firefox](https://www.mozilla.org/firefox/) with tab groups and vertical tabs — written against the sources of **Firefox 155.0.1 and 156** and **Zen 1.22**. Older Firefox releases are expected to work, but some group icons resolve to chrome paths that only exist in recent builds and fall back to a generic folder icon.
- [Sine](https://github.com/CosmoCreeper/Sine), the community mod manager for Zen and Firefox-based browsers

> [!NOTE]
> This is a Sine mod because its sorting logic requires JavaScript. Zen's native Mods Registry only loads CSS and preferences.

### On Firefox
Turn on vertical tabs first — right-click the tab strip and choose *Turn on Vertical Tabs*, or set **Browser layout → Vertical tabs** in Settings (under **Tabs and browsing** on Firefox 156+, under **General** on older builds). The **Sort** and **Clear** buttons appear in a row under the pinned tabs, the same place they occupy on Zen.

The **expanded vertical sidebar** is the layout this mod is designed for, and the only one where it restyles groups. In a horizontal strip or a collapsed sidebar it leaves the browser's own tab-group appearance alone rather than half-replacing it.

The **Sort** and **Clear** buttons belong to the expanded sidebar and are not shown in a collapsed rail — that column is Firefox's own and this mod adds nothing to it. A collapsed group still reads as one there: Firefox draws its label as a solid chip in the group's colour, which this mod flattens only in the expanded view, where the header band already says the same thing.

What differs between the two browsers:

| | Zen | Firefox |
|---|---|---|
| Scope of Sort and Clear | The active workspace only | The window's tab strip |
| Group right-click | Zen's folder menu: rename, pick an icon | Firefox's own group editor: rename, recolor |
| Group color picked by hand | Not offered | Honored — the mod stops re-coloring that group |
| Group icons | Zen's `zen-icons` set | The closest match in Firefox's own chrome, falling back to a folder icon |

### Where the buttons go
This mod does not build a row if one is already there. Between the pinned tabs and the tab list it looks for a row that already exists and joins it, and only builds its own as a last resort:

1. **Zen** — `.pinned-tabs-container-separator`, one per workspace
2. **[Natsumi Browser](https://github.com/greeeen-dev/natsumi-browser)** — its `#natsumi-tabs-clearer`
3. otherwise a row of its own, with its own rule

Those rows are all the same shape: a thin rule and a button sharing one line. Plain Firefox has nothing there — its `#vertical-pinned-tabs-splitter` ships hidden, and even shown its rule is transparent once the sidebar is expanded — which is why the third case draws its own.

Joining a row means inheriting its **Clear** button, so while this mod's Clear is on, the host's own is hidden: Zen's close-unpinned button, or Natsumi's. Turn **Show the Clear button** off in the settings and the host's comes back.

The same goes for the group icon. Natsumi draws a generic folder on every group label; this mod picks one from the group's name and domains — a magnifying glass on *Search*, a code icon on *Development* — so on a group it has given an icon to, the other stands down and its own is painted in the group's full colour. A group the mod has never touched, or any group at all with **Auto-assign icons** off, keeps whatever its own mod draws.

## Installation
Open `about:preferences#sineMods`, then choose one of the following methods:

### Sine store
Search for **Zen Tabs Organiser** in the Sine marketplace and select **Install**.

### GitHub repository
1. In Sine's settings, enable **Install JS from unofficial sources** (`sine.allow-unsafe-js`).
2. Under **Installation**, find **Add your own locally from a GitHub repo**.
3. Paste the repository identifier:

   ```
   alexiscrocilla/Zen-Tabs-Organiser
   ```

4. Select **Install**.

If the unsafe-JS option is disabled, Sine may load the styles but silently skip the script, so the **Sort** and **Clear** buttons will not appear.

## Quick Start
1. Open several tabs — in the same workspace, if you are on Zen.
2. Select **Sort** in the sidebar.
3. Expand or collapse the generated groups as needed.
4. Select **Clear** to close the loose, unpinned tabs.

When multiple tabs are selected, **Sort** processes only that selection. Otherwise it sorts the loose eligible tabs in view and leaves existing groups unchanged.

## Grouping Modes
Configure the mod from `about:preferences#sineMods` → **Zen Tabs Organiser** → **Settings**.

| Provider | Data handling | API key | Default model |
|----------|---------------|---------|---------------|
| None | Groups locally by keywords and domains | No | Not applicable |
| Local - Firefox AI | Runs Firefox's Smart Tab Grouping models on device | No | Mozilla-provided models |
| Gemini | Sends tab titles and URLs to Google | Yes | `gemini-2.0-flash` |
| Ollama | Sends tab titles and URLs to your configured Ollama endpoint | No | `llama3.2` |
| Mistral | Sends tab titles and URLs to Mistral | Yes | `mistral-small-latest` |
| OpenAI | Sends tab titles and URLs to OpenAI or a compatible endpoint | Yes | `gpt-4o-mini` |

### Private local AI
Choose **Local - Firefox AI, no API key** to group tabs by meaning without sending tab data to a cloud provider. Firefox downloads the required models on the first run, so the initial sort can take longer.

The mod enables `browser.ml.enable` when this provider is selected. If local AI is unavailable or cannot form groups, sorting falls back to local domain-based grouping.

### Cloud or self-hosted AI
Choose a provider, enter its API key when required, and optionally override the model or endpoint. Settings are read each time you select **Sort**, so changes apply without restarting Zen.

## Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Show Sort button | On | Displays the sidebar sorting action |
| Show Clear button | On | Displays the loose-tab cleanup action, and hides the one the host row already provides |
| Auto-assign colors | On | Gives each group a persistent color |
| Auto-assign icons | On | Adds a contextual icon to each group |
| Minimum tabs per group | `2` | Prevents undersized groups from being created |
| AI provider | None | Selects local, on-device, cloud, or self-hosted grouping |
| API key | Empty | Used by Gemini, Mistral, and OpenAI |
| Model | Provider default | Overrides the provider's default model |
| Endpoint | Provider default | Overrides the Ollama or OpenAI-compatible endpoint |

The last three appear only for the providers that use them.

## Behavior and Privacy
- Full-workspace **Sort** ignores pinned tabs, existing groups, Zen folders, split views, empty tabs, and browser-internal pages.
- Existing groups are never changed by **Sort**; loose tabs that receive an existing group's label are placed in a new numbered group.
- Right-click a group header to rename it: Zen's folder menu, which also picks an icon, or Firefox's own group editor, which also recolors.
- **Clear** keeps the selected tab, pinned tabs, grouped tabs, folder tabs, and split-view tabs.
- On Zen only tabs in the active workspace are sorted or cleared. Sort and Clear both stand down entirely while Zen has not settled on a workspace yet, rather than falling back to the whole window.
- With **None** or **Local - Firefox AI**, tab titles and URLs do not leave the browser.
- With a cloud or self-hosted provider, tab titles and URLs are sent to the endpoint you configure.

## Troubleshooting
### The buttons do not appear
Confirm that Sine is installed and that `sine.allow-unsafe-js` is enabled for repository installations. Then disable and re-enable the mod in Sine.

### The first local-AI sort is slow
Firefox downloads its Smart Tab Grouping models on first use. Later sorts reuse the downloaded models.

### The buttons do not appear on Firefox
They need vertical tabs, expanded: right-click the tab strip and choose *Turn on Vertical Tabs*. The browser console logs a reminder when the mod loads with a horizontal strip.

### Natsumi's Clear button disappeared
Expected: this mod joins Natsumi's row rather than adding a second one, and hides the row's own Clear while its own is on. Turn **Show the Clear button** off in the mod's settings to get Natsumi's back.

### Which version is running
The startup line in the Browser Toolbox console names it — `[ZenTabsOrganiser] v… loading…` — and `ZenTabsOrganiser.version` reports it at any time. Worth checking before reporting that a fix did not work, since Sine does not always pick up an update in a live window.

### Group styles conflict with another mod
Zen Tabs Organiser styles groups independently. Another mod that changes tab-group colors, icons, or geometry can produce conflicting results; disable one of the overlapping group-style mods.

## Development
Clone the repository and install the local checkout through Sine while developing:

```bash
git clone https://github.com/alexiscrocilla/Zen-Tabs-Organiser.git
```

| File | Purpose |
|------|---------|
| `theme.json` | Sine manifest and mod metadata |
| `zen-tabs-organiser.uc.js` | Sorting, grouping, persistence, and cleanup logic |
| `chrome.css` | Sidebar controls, group styling, and animations |
| `preferences.json` | Settings schema displayed by Sine |

Sine injects the `.uc.js` script into `chrome://browser/content/browser.xhtml`. Keep runtime behavior in the script, visual rules in `chrome.css`, and ensure every added listener, observer, timer, or DOM node is removed by the unload handler.

The browser differences are collected in one place each: `isZen()`, `activeWorkspaceId()`, `inActiveScope()`, `workspacesNotReady()` and `scopedGroupSelector()` in the script, and the `FIREFOX` section of `chrome.css`. Detection is by DOM (`commandset#zenCommandSet`), never by user agent. Every rule in that section is guarded with `:not(:has(> .tab-group-container))`, a child only Zen's patched tab groups have, so a Zen window can never match them.

Two rules of thumb learned the hard way, both worth keeping:
- **Do not measure a value the stylesheet itself writes.** An earlier version read a tab's inline inset off `getComputedStyle` and republished it; the Firefox rules zero that same margin inside a group, so after the first sort the measurement fed on its own output. Each browser already names the value in a variable — read that.
- **`activeWorkspaceId()` returning null does not mean "no workspaces".** On Zen it also means "workspaces exist but none is chosen yet", which is the state of every window at startup. Guard with `workspacesNotReady()` before acting window-wide, or Clear will close tabs across every space.
- **Before adding anything to the sidebar, look at what is already there — including other mods.** A reported duplicate row was chased through three releases of Firefox's own source before it turned out to be Natsumi's `#natsumi-tabs-clearer`, which inserts at the same position. When an element does not match anything in the browser's source, the question is which other mod is active.
- **Do not build an element on a rule written for someone else's.** `.zen-tidy-host toolbarseparator` describes the separators Zen and Natsumi already size in their own rows; a bare `<toolbarseparator>` built from nothing kept native behaviour it does not override. This mod's own rule is a plain `<hbox>` with every dimension stated outright.

## Contributing
Bug reports and focused pull requests are welcome. Before opening a pull request:
1. Test sorting with no AI provider and with any provider affected by your change.
2. Verify both full-workspace and multi-selected-tab sorting.
3. Confirm that pinned tabs, folders, split views, and inactive workspaces remain untouched.
4. Toggle the mod off and on without restarting the browser to verify cleanup and reinjection.
5. Check the change on **both** Zen and Firefox with vertical tabs. The group markup differs between them — Firefox keeps the tabs as direct children of `<tab-group>` and wraps the label in `.tab-group-label-hover-highlight`, Zen puts the tabs in a `.tab-group-container` and hoists the label — and `chrome.css` carries a separate, guarded section for each.
6. If the change touches the sidebar row, check it with **Natsumi Browser** installed as well as without. The mod joins Natsumi's row instead of adding its own, so both paths are live.

## Migrating from the Zen Mod Format
Older releases used `mod.json`, `chrome.js`, and `style.css`. Remove the old version from Zen's Mods Registry before installing the Sine version to prevent duplicate controls. Existing preference names are unchanged.

## License
Licensed under the [MIT License](LICENSE).