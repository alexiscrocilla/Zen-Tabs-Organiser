# Zen Tabs Organiser

Sort your browser tabs into groups using **AI** or **domain-based** grouping in one click. Inspired by [Arc’s Tidy Tabs](https://arc.net/max).

## Features

- **Sort** — Groups all open tabs via AI (OpenAI, Gemini, Ollama, Mistral) or by domain
- **Clear** — Closes ungrouped, unpinned tabs with animation
- **Auto-colors** — 12-color palette with automatic assignment
- **Auto-icons** — Contextual icons (code, shopping, finance, smart home, etc.) when supported
- **Workspace-aware** — Only affects tabs in the active workspace
- **Animation** — Visual feedback when expanding or collapsing groups
- **Settings** — Full configuration in Zen Mods preferences (AI provider, API key, model)

## Requirements

- [Zen Browser](https://zen-browser.app/) (a recent build with mod support)
- **Optional but recommended for group icons:** the [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) mod. Without it, sorting and colors still work; automatic icon assignment is skipped if that API is not available.

## Installation

This is the flow Zen documents for mods listed in the catalog:

1. Open **Zen Browser**
2. Go to the [**Mods Registry**](https://www.zen-browser.app/mods)
3. Open **Zen Tabs Organiser** and click **Install**

You can also manage installed mods from **`about:preferences#zenMarketplace`** (Zen Mods preferences).

### Loading the mod outside the catalog

Zen can **import** an exported mod as JSON from the Marketplace / Zen Mods UI (an **Import**-style control). Use this to test a build or share a file outside the public registry. The files below (`mod.json`, scripts, CSS, preferences) are what the browser bundles—no manual copying into the profile or external userChrome-style tooling.

## AI configuration

By default, grouping is domain-based. To use AI:

1. Open **`about:preferences#zenMarketplace`** → **Zen Tabs Organiser**
2. Pick an **AI provider** (Gemini, Ollama, Mistral, or OpenAI)
3. Enter your **API key** (not needed for local Ollama)
4. Optionally set a custom **model** name (defaults: `gpt-4o-mini`, `gemini-2.0-flash`, etc.)

Option labels match the `preferences.json` schema ([Zen mod preferences documentation](https://docs.zen-browser.app/themes-store/themes-marketplace-preferences)).

## Usage

1. Click **Sort** — tabs are analyzed and grouped
2. With AI: titles and URLs are sent to the provider for semantic categories
3. Without AI: grouping uses keywords / hostnames
4. Groups get colors and icons according to your settings
5. **Clear** closes ungrouped, unpinned tabs

## Repository files

| File | Purpose |
|------|---------|
| `mod.json` | Mod metadata (name, version, `style` / `js` entries) |
| `chrome.js` | Main logic (loaded by Zen’s mod system when `js` is enabled) |
| `style.css` | Styles for groups and controls |
| `preferences.json` | Preference schema shown in the Zen Mods UI |

## Publishing or updating on the Mods Registry

The catalog is curated. For official listing or updates, follow Zen’s [**Submission Guidelines**](https://docs.zen-browser.app/themes-store/themes-marketplace-submission-guidelines) (open-source mod, valid README, JSON preferences, screenshots as specified, etc.).

## License

[MIT](LICENSE)
