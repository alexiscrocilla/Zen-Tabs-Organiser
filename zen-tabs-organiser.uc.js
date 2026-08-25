// ==UserScript==
// @name           Zen Tabs Organiser
// @description    Sort tabs into groups using AI or domain (Sine mod)
// @version        2.8.0
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==
//
// Loaded by Sine (https://github.com/CosmoCreeper/Sine) as a `.uc.js` script.
// Sine can re-inject this file into a live window (mod toggled, updated,
// preferences rebuilt), so the script guards against double injection and
// registers an unload listener that fully undoes what it did.
(() => {
    // --- Re-injection guard (Sine may load this file into a live window) ---
    if (window.ZenTabsOrganiser?.loaded) return;

    // --- Teardown registry, drained by the unload listener at the bottom ---
    const disposers = [];
    const onCleanup = (fn) => disposers.push(fn);

    // Single source of truth for the version string. Read once here so
    // the startup log, the public handle and any future use of it can
    // never drift out of sync with each other again.
    const MOD_VERSION = '3.5.3';

    // --- Configuration / Preference Keys ---
    const ENABLE_SORT_PREF = "zen-tabs-organiser.enable_sort";
    const ENABLE_CLEAR_PREF = "zen-tabs-organiser.enable_clear";
    const AI_MODEL_PREF    = "zen-tabs-organiser.ai_model";    // 0=none, 1=gemini, 2=ollama, 3=mistral, 4=openai
    const AI_API_KEY_PREF  = "zen-tabs-organiser.ai_api_key";  // unified API key
    const AI_MODEL_NAME_PREF = "zen-tabs-organiser.ai_model_name"; // unified model name
    const AI_ENDPOINT_PREF = "zen-tabs-organiser.ai_endpoint"; // unified endpoint
    const MIN_GROUP_SIZE_PREF  = "zen-tabs-organiser.min_group_size";
    const AUTO_ICONS_PREF      = "zen-tabs-organiser.auto_icons";
    const AUTO_COLORS_PREF     = "zen-tabs-organiser.auto_colors";

    // --- Helper: read preferences ---
    const getPref = (prefName, defaultValue = "") => {
        try {
            const ps = Services.prefs;
            if (ps.prefHasUserValue(prefName)) {
                switch (ps.getPrefType(prefName)) {
                    case ps.PREF_STRING: return ps.getStringPref(prefName);
                    case ps.PREF_INT:    return ps.getIntPref(prefName);
                    case ps.PREF_BOOL:   return ps.getBoolPref(prefName);
                }
            }
        } catch {}
        return defaultValue;
    };

    // --- Ensure boolean prefs exist so @media (-moz-bool-pref:...) works ---
    // Without this, the CSS media queries evaluate to false and buttons stay hidden.
    const ensureBoolPref = (pref, val) => {
        try {
            if (!Services.prefs.prefHasUserValue(pref)) {
                Services.prefs.setBoolPref(pref, val);
            }
        } catch {}
    };
    ensureBoolPref(ENABLE_SORT_PREF, true);
    ensureBoolPref(ENABLE_CLEAR_PREF, true);
    ensureBoolPref(AUTO_ICONS_PREF, true);
    ensureBoolPref(AUTO_COLORS_PREF, true);

    // --- Ensure int prefs exist ---
    const ensureIntPref = (pref, val) => {
        try {
            if (!Services.prefs.prefHasUserValue(pref)) {
                Services.prefs.setIntPref(pref, val);
            }
        } catch {}
    };
    ensureIntPref(MIN_GROUP_SIZE_PREF, 2);

    // --- Preferences are read live, never cached ---
    // Sine applies preference changes without reloading the script, so caching
    // values at load time would leave the mod stuck on stale settings until
    // the browser restarts. Sort/Clear button visibility is handled in
    // chrome.css through @media (-moz-bool-pref: ...), which is live already.
    const minGroupSize = () => parseInt(getPref(MIN_GROUP_SIZE_PREF, "2"), 10) || 2;
    const autoIcons    = () => !!getPref(AUTO_ICONS_PREF, true);
    const autoColors   = () => !!getPref(AUTO_COLORS_PREF, true);

    // --- What this mod is allowed to touch ---
    // Advanced Tab Groups skips the same two things, and for good reason:
    //   <zen-folder>          Zen's own folders. A separate element (nsZenFolder
    //                         extends MozTabbrowserTabGroup) that Zen lays out and
    //                         animates itself in ZenFolders.animateCollapse().
    //   [split-view-group]    Split views are modelled as tab groups. Ungrouping
    //                         their tabs or removing the group destroys the split;
    //                         Zen's own `set collapsed` bails out on them too.
    // Only plain, non-split tab groups are ours to sort, colour and clean up.
    const GROUP_SELECTOR = 'tab-group:not([split-view-group])';

    /** True for a container this mod must leave alone. */
    const isForeignContainer = (el) => {
        if (!el) return false;
        return el.isZenFolder === true
            || el.localName === 'zen-folder'
            || el.hasAttribute?.('split-view-group');
    };

    /** The group that owns a tab, or null when it is loose or inside a foreign container. */
    const ownGroupOf = (tab) => {
        const group = tab?.closest?.(GROUP_SELECTOR);
        if (!group) return null;
        // A tab nested in a folder inside one of our groups still belongs to the folder.
        const nearest = tab.closest('tab-group, zen-folder');
        if (nearest !== group && isForeignContainer(nearest)) return null;
        return group;
    };

    // --- AI prompt template (Arc Tidy Tabs style) ---
    const PROMPT_TEMPLATE = `You organize browser tabs into groups. Read each tab's title and URL carefully, then assign it to the BEST matching category.

STRICT RULES:
1. Create 4-8 BROAD categories maximum. Group by WHAT THE USER IS DOING, not by website.
2. DISTINGUISH clearly between:
   - "Development" = coding, GitHub repos, programming docs, APIs, developer tools
   - "Smart Home" = IoT devices (Aqara, Shelly, SONOFF, Nuki), home automation, Home Assistant dashboards
   - "Shopping" = buying products (any store: Amazon, eBay, Apple Store, etc.) that are NOT IoT/smart home
   - "Finance" = trading, stocks, banking, crypto
   - "Entertainment" = streaming, gaming, videos, music
3. IoT/smart home PRODUCTS on Amazon/stores → "Smart Home" (not "Shopping" or "Retail")
4. General shopping (clothes, accessories, 3D printing supplies) → "Shopping"
5. Google/Bing searches → group by the SUBJECT being searched, not "Search"
6. Reddit/forum posts → group by the TOPIC discussed, not "Social"
7. Server dashboards, self-hosted apps, network management → "Self-Hosted"
8. FORBIDDEN names: "Other", "Misc", "General", "Retail", "Search", "Browsing", "Web", "Social", "Various", "New Category"
9. Each name: 1-2 words, Title Case, English only.
10. When unsure, pick the CLOSEST existing category rather than inventing a new one.

{EXISTING_HINT}
---
Tabs:
{TAB_DATA_LIST}

---
Output EXACTLY {TAB_COUNT} lines. One category per line. No numbering, no explanation.

Output:`;

    // --- Config object ---
    const CONFIG = {
        groupColorNames: ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'orange', 'cyan'],
        titleKeywordStopWords: new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of',
            'is', 'am', 'are', 'was', 'were', 'be', 'being', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
            'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom', 'whose',
            'new', 'tab', 'untitled', 'page', 'home', 'com', 'org', 'net', 'io', 'dev', 'app',
            'get', 'set', 'list', 'view', 'edit', 'create', 'update', 'delete',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'you', 'him', 'her', 'it', 'us', 'them',
            'about', 'search', 'results', 'posts', 'index', 'dashboard', 'profile', 'settings',
            'official', 'documentation', 'docs', 'wiki', 'help', 'support', 'faq', 'guide',
            'error', 'login', 'signin', 'sign', 'up', 'out', 'welcome', 'loading', 'vs', 'using', 'code',
            // Prevent generic/meta group names
            'tidy', 'sort', 'tabs', 'onglet', 'onglets', 'category', 'group', 'other', 'misc',
            'general', 'default', 'uncategorized', 'various', 'divers', 'autre', 'autres',
            'browser', 'zen', 'firefox', 'chrome', 'web', 'site', 'sites', 'website',
            'release', 'version', 'feature', 'mod', 'mods', 'plugin', 'extension',
            // French common words
            'les', 'des', 'une', 'que', 'qui', 'dans', 'pour', 'avec', 'sur', 'pas', 'plus',
            'bien', 'bon', 'fait', 'tout', 'tous', 'cette', 'ces', 'son', 'ses', 'nos', 'vos',
            'est', 'sont', 'ont', 'nous', 'vous', 'ils', 'elles', 'leur', 'leurs',
            'aussi', 'comme', 'mais', 'donc', 'car', 'entre', 'sans', 'sous', 'chez',
            'super', 'tres', 'très', 'petit', 'grand', 'nouveau', 'nouvelle', 'beau', 'belle',
            'page', 'tableau', 'bord', 'accueil', 'prix', 'gratuit', 'ligne', 'france',
            'into', 'from', 'just', 'only', 'some', 'more', 'best', 'free', 'top', 'pro',
        ]),
        minKeywordLength: 3,
        consolidationDistanceThreshold: 2
    };

    // --- Globals & State ---
    let isSorting = false;
    let commandListenerAdded = false;
    let destroyed = false;

    // --- Tracked timers ---
    // Every pending timer is remembered so teardown can cancel it; a stray
    // callback firing after the mod is unloaded would touch a DOM we no
    // longer own.
    const pendingTimeouts = new Set();
    const pendingIntervals = new Set();

    const later = (fn, delay) => {
        if (destroyed) return null;
        const id = setTimeout(() => {
            pendingTimeouts.delete(id);
            if (!destroyed) fn();
        }, delay);
        pendingTimeouts.add(id);
        return id;
    };

    const every = (fn, delay) => {
        if (destroyed) return null;
        const id = setInterval(() => {
            if (destroyed) {
                clearInterval(id);
                pendingIntervals.delete(id);
                return;
            }
            fn();
        }, delay);
        pendingIntervals.add(id);
        return id;
    };

    const clearTracked = (id, kind) => {
        if (id === null || id === undefined) return;
        if (kind === 'interval') {
            clearInterval(id);
            pendingIntervals.delete(id);
        } else {
            clearTimeout(id);
            pendingTimeouts.delete(id);
        }
    };

    const clearAllTimers = () => {
        pendingTimeouts.forEach(clearTimeout);
        pendingTimeouts.clear();
        pendingIntervals.forEach(clearInterval);
        pendingIntervals.clear();
    };

    // Styles now live in chrome.css, which Sine loads and unloads with the mod.
    // Drop the <style> element older versions injected into this window.
    const removeLegacyStyleElement = () => {
        document.getElementById('zen-tabs-organiser-styles')?.remove();
    };

    // --- Tab data extraction ---
    const getTabData = (tab) => {
        if (!tab || !tab.isConnected) {
            return { title: 'Invalid Tab', url: '', hostname: '' };
        }
        let title = 'Untitled Page';
        let fullUrl = '';
        let hostname = '';

        try {
            const originalTitle = tab.getAttribute('label') || tab.querySelector('.tab-label, .tab-text')?.textContent || '';
            const browser = tab.linkedBrowser || tab._linkedBrowser || gBrowser?.getBrowserForTab?.(tab);

            if (browser?.currentURI?.spec && !browser.currentURI.spec.startsWith('about:')) {
                try {
                    const u = new URL(browser.currentURI.spec);
                    fullUrl = u.href;
                    hostname = u.hostname.replace(/^www\./, '');
                } catch {
                    hostname = 'Invalid URL';
                    fullUrl = browser?.currentURI?.spec || '';
                }
            } else if (browser?.currentURI?.spec) {
                fullUrl = browser.currentURI.spec;
                hostname = 'Internal Page';
            }

            if (!originalTitle || originalTitle === 'New Tab' || originalTitle === 'about:blank' || originalTitle === 'Loading...' || originalTitle.startsWith('http')) {
                if (hostname && hostname !== 'Invalid URL' && hostname !== 'localhost' && hostname !== 'Internal Page') {
                    title = hostname;
                } else {
                    try { const seg = new URL(fullUrl).pathname.split('/')[1]; if (seg) title = seg; } catch {}
                }
            } else {
                title = originalTitle.trim();
            }
            title = title || 'Untitled Page';
        } catch (e) {
            console.error('[ZenTabsOrganiser] Error getting tab data:', e);
        }
        return { title, url: fullUrl, hostname: hostname || 'N/A' };
    };

    // --- Text helpers ---
    const toTitleCase = (str) => {
        if (!str) return "";
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const NORMALIZATION_MAP = {
        'github.com': 'GitHub', 'github': 'GitHub',
        'stackoverflow.com': 'Stack Overflow', 'stack overflow': 'Stack Overflow', 'stackoverflow': 'Stack Overflow',
        'google docs': 'Google Docs', 'docs.google.com': 'Google Docs',
        'google drive': 'Google Drive', 'drive.google.com': 'Google Drive',
        'youtube.com': 'YouTube', 'youtube': 'YouTube',
        'reddit.com': 'Reddit', 'reddit': 'Reddit',
        'chatgpt': 'ChatGPT', 'openai.com': 'OpenAI',
        'gmail': 'Gmail', 'mail.google.com': 'Gmail',
        'aws': 'AWS', 'amazon web services': 'AWS',
        'pinterest.com': 'Pinterest', 'pinterest': 'Pinterest',
        'developer.mozilla.org': 'MDN Web Docs', 'mdn': 'MDN Web Docs',
        'claude.ai': 'Claude', 'claude': 'Claude',
        'linkedin.com': 'LinkedIn', 'linkedin': 'LinkedIn',
        'twitter.com': 'Twitter', 'x.com': 'Twitter',
        'discord.com': 'Discord', 'discord': 'Discord',
    };

    const BANNED_TOPICS = new Set([
        'uncategorized', 'other', 'misc', 'general', 'new category', 'tabs', 'onglets',
        'various', 'divers', 'browsing', 'web', 'default', 'autre', 'autres',
    ]);

    const processTopic = (text) => {
        if (!text) return "Uncategorized";
        const lower = text.trim().toLowerCase();
        if (NORMALIZATION_MAP[lower]) return NORMALIZATION_MAP[lower];

        let processed = text.replace(/^(Category is|The category is|Topic:)\s*"?/i, '');
        processed = processed.replace(/^\s*[\d.\-*]+\s*/, '');
        let words = processed.trim().split(/\s+/);
        let category = words.slice(0, 2).join(' ');
        category = category.replace(/["'*().:;,]/g, '');
        const result = toTitleCase(category).substring(0, 40) || "Uncategorized";

        // Reject banned generic names
        if (BANNED_TOPICS.has(result.toLowerCase())) return "Uncategorized";
        return result;
    };

    const extractTitleKeywords = (title) => {
        if (!title || typeof title !== 'string') return new Set();
        const cleaned = title.toLowerCase().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        const keywords = new Set();
        for (const word of cleaned.split(' ')) {
            if (word.length >= CONFIG.minKeywordLength && !CONFIG.titleKeywordStopWords.has(word) && !/^\d+$/.test(word)) {
                keywords.add(word);
            }
        }
        return keywords;
    };

    const findGroupElement = (topicName, workspaceId) => {
        const safe = topicName.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        try {
            return document.querySelector(`${GROUP_SELECTOR}[label="${safe}"]:has(tab[zen-workspace-id="${workspaceId}"])`);
        } catch { return null; }
    };

    const levenshteinDistance = (a, b) => {
        if (!a || !b) return Math.max(a?.length ?? 0, b?.length ?? 0);
        a = a.toLowerCase(); b = b.toLowerCase();
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        return matrix[b.length][a.length];
    };

    // ==========================================
    //  AI Interaction
    // ==========================================

    // ==========================================
    //  Local grouping — Firefox's built-in ML engine
    // ==========================================
    // Firefox ships the two models its own Smart Tab Grouping uses: an
    // embedding model to cluster tabs by meaning, and a topic model to name a
    // cluster. Both run on device, need no API key, and send nothing anywhere.
    // They are fetched through Firefox's model hub the first time they run.

    const LOCAL_AI = {
        // Cosine similarity above which two tabs belong together.
        tabSimilarity: 0.45,
        // Similarity to an existing group's name needed to reuse it rather
        // than inventing a near-duplicate, plus the nudge that favours reuse.
        existingGroupSimilarity: 0.55,
        existingGroupBoost: 0.1,
        // First run downloads the models, so the budget is generous.
        timeoutMs: 120000,
    };

    const withTimeout = (promise, ms, label) => Promise.race([
        promise,
        new Promise((_, reject) =>
            later(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);

    const cosineSimilarity = (a, b) => {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (!na || !nb) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    };

    const centroidOf = (vectors) => {
        if (!vectors.length) return null;
        const out = new Array(vectors[0].length).fill(0);
        for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
        return out.map(v => v / vectors.length);
    };

    /** The engine returns the pooled vector under several shapes; accept them all. */
    const readEmbedding = (result) => {
        if (Array.isArray(result?.[0]?.embedding)) return result[0].embedding;
        if (Array.isArray(result?.[0]) && typeof result[0][0] === 'number') return result[0];
        if (Array.isArray(result) && typeof result[0] === 'number') return result;
        if (result?.data) return Array.from(result.data);
        return null;
    };

    let localEngines = null;

    const getLocalEngines = async () => {
        if (localEngines) return localEngines;

        // The engine refuses to start while this is off, and it ships off in
        // some builds. Flipped here rather than at load time, so the browser
        // pref only changes once the local provider is actually chosen.
        try {
            if (!Services.prefs.getBoolPref('browser.ml.enable', false)) {
                Services.prefs.setBoolPref('browser.ml.enable', true);
                console.log('[ZenTabsOrganiser] Enabled browser.ml.enable for local grouping');
            }
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Could not enable browser.ml.enable:', e);
        }

        const { createEngine } = ChromeUtils.importESModule(
            'chrome://global/content/ml/EngineProcess.sys.mjs');
        localEngines = {
            embedding: await createEngine({
                taskName: 'feature-extraction',
                modelId: 'Mozilla/smart-tab-embedding',
                modelHub: 'huggingface',
                engineId: 'zen-tabs-organiser-embedding',
            }),
            topic: await createEngine({
                taskName: 'text2text-generation',
                modelId: 'Mozilla/smart-tab-topic',
                modelHub: 'huggingface',
                engineId: 'zen-tabs-organiser-topic',
            }),
        };
        return localEngines;
    };

    const embedText = async (engine, text) => {
        // "pooling: mean" is what turns the per-token tensor into one sentence
        // vector; without it the result cannot be compared.
        const result = await engine.run({
            args: [[text]],
            options: { pooling: 'mean', normalize: true },
        });
        const vector = readEmbedding(result);
        return Array.isArray(vector) && typeof vector[0] === 'number' ? vector : null;
    };

    const nameCluster = async (engine, titles) => {
        const keywords = [...new Set(titles.flatMap(extractTitleKeywords))].slice(0, 5);
        const input = `Topic from keywords: ${keywords.join(', ')}. titles:\n${titles.join('\n')}`;
        const result = await engine.run({
            args: [input],
            options: { max_new_tokens: 8, temperature: 0.7 },
        });
        const raw = (result?.[0]?.generated_text || result?.generated_text || '')
            .split('\n').map(l => l.trim()).find(Boolean) || '';
        // processTopic already rejects generic names and normalises casing.
        const name = processTopic(raw.replace(/^['"`]+|['"`]+$/g, ''));
        return name === 'Uncategorized' ? null : name;
    };

    /**
     * Cluster tabs locally and name each cluster.
     * Returns the same [{tab, topic}] shape as the remote providers, or []
     * to hand over to domain grouping.
     */
    const localGroupTabs = async (validTabs, existingCategoryNames = []) => {
        const { embedding, topic } = await getLocalEngines();

        const titles = validTabs.map(tab => getTabData(tab).title);
        const vectors = [];
        for (const title of titles) {
            vectors.push(await embedText(embedding, title));
        }

        const usable = validTabs
            .map((tab, i) => ({ tab, title: titles[i], vector: vectors[i] }))
            .filter(entry => entry.vector);

        if (usable.length < 2) {
            console.warn('[ZenTabsOrganiser] Local AI produced no usable embeddings');
            return [];
        }

        // Greedy clustering: each tab joins the closest cluster it is near
        // enough to, otherwise it starts one.
        const clusters = [];
        for (const entry of usable) {
            let best = null, bestScore = LOCAL_AI.tabSimilarity;
            for (const cluster of clusters) {
                const score = cosineSimilarity(entry.vector, cluster.centroid);
                if (score >= bestScore) { best = cluster; bestScore = score; }
            }
            if (best) {
                best.entries.push(entry);
                best.centroid = centroidOf(best.entries.map(e => e.vector));
            } else {
                clusters.push({ entries: [entry], centroid: entry.vector });
            }
        }

        // Reuse an existing group when a cluster is close to its name, so
        // sorting twice does not produce near-duplicate groups.
        const existingVectors = new Map();
        for (const name of existingCategoryNames) {
            const vector = await embedText(embedding, name);
            if (vector) existingVectors.set(name, vector);
        }

        const results = [];
        for (const cluster of clusters) {
            let name = null;
            for (const [existing, vector] of existingVectors) {
                const score = cosineSimilarity(cluster.centroid, vector) + LOCAL_AI.existingGroupBoost;
                if (score >= LOCAL_AI.existingGroupSimilarity) { name = existing; break; }
            }
            if (!name) {
                name = await nameCluster(topic, cluster.entries.map(e => e.title));
            }
            if (!name) continue;   // unnamed cluster falls through to domain grouping
            for (const entry of cluster.entries) results.push({ tab: entry.tab, topic: name });
        }

        console.log(`[ZenTabsOrganiser] Local AI: ${clusters.length} clusters over ${usable.length} tabs`);
        return results;
    };

    const askAIForMultipleTopics = async (tabs, existingCategoryNames = []) => {
        const validTabs = tabs.filter(tab => tab?.isConnected);
        if (validTabs.length === 0) return [];

        // Read AI prefs LIVE so settings changes take effect without restart
        const aiModel  = String(getPref(AI_MODEL_PREF, "0"));
        const apiKey   = getPref(AI_API_KEY_PREF, "");
        const modelName= getPref(AI_MODEL_NAME_PREF, "");
        const endpoint = getPref(AI_ENDPOINT_PREF, "");

        if (aiModel === "0" || aiModel === "") {
            console.log('[ZenTabsOrganiser] AI provider: none — using domain fallback');
            return [];
        }

        validTabs.forEach(tab => tab.classList.add('tab-is-sorting'));

        try {
            if (aiModel === "5") {
                // Local engine: no prompt, no network, no key.
                try {
                    const local = await withTimeout(
                        localGroupTabs(validTabs, existingCategoryNames),
                        LOCAL_AI.timeoutMs, 'Local AI');
                    if (local.length) return local;
                    console.warn('[ZenTabsOrganiser] Local AI grouped nothing — using domain fallback');
                } catch (e) {
                    console.error('[ZenTabsOrganiser] Local AI unavailable:', e);
                }
                return [];
            }

            const tabDataArray = validTabs.map(getTabData);
            const formattedTabDataList = tabDataArray.map((d, i) =>
                `${i + 1}. ${d.title} | ${d.url}`
            ).join('\n');

            const existingHint = existingCategoryNames.length > 0
                ? `Previously used categories (reuse if appropriate): ${existingCategoryNames.join(', ')}`
                : '';

            const prompt = PROMPT_TEMPLATE
                .replace("{EXISTING_HINT}", existingHint)
                .replace("{TAB_DATA_LIST}", formattedTabDataList)
                .replace("{TAB_COUNT}", String(validTabs.length));

            let aiText = '';
            const estimatedTokens = Math.max(256, validTabs.length * 16);

            // Defaults per provider (used when user leaves model/endpoint empty)
            const DEFAULTS = {
                "1": { model: "gemini-2.0-flash" },
                "2": { model: "llama3.2", endpoint: "http://localhost:11434/api/generate" },
                "3": { model: "mistral-small-latest" },
                "4": { model: "gpt-4o-mini", endpoint: "https://api.openai.com/v1/chat/completions" },
            };
            const defs = DEFAULTS[aiModel] || {};
            const model = modelName || defs.model || "";
            const url   = endpoint || defs.endpoint || "";

            if (aiModel === "1") {
                // Gemini
                if (!apiKey) throw new Error("API key not set. Configure it in Zen Mods settings → Zen Tabs Organiser.");
                console.log(`[ZenTabsOrganiser] AI (Gemini/${model}): ${validTabs.length} tabs…`);
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: estimatedTokens, candidateCount: 1 }
                        })
                    }
                );
                if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
                const data = await res.json();
                aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

            } else if (aiModel === "2") {
                // Ollama (no API key needed)
                console.log(`[ZenTabsOrganiser] AI (Ollama/${model}): ${validTabs.length} tabs…`);
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.1, num_predict: validTabs.length * 15 } })
                });
                if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
                aiText = (await res.json()).response?.trim() || '';

            } else if (aiModel === "3") {
                // Mistral
                if (!apiKey) throw new Error("API key not set. Configure it in Zen Mods settings → Zen Tabs Organiser.");
                console.log(`[ZenTabsOrganiser] AI (Mistral/${model}): ${validTabs.length} tabs…`);
                const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: estimatedTokens, temperature: 0.1 })
                });
                if (!res.ok) throw new Error(`Mistral ${res.status}: ${await res.text()}`);
                aiText = (await res.json()).choices?.[0]?.message?.content?.trim() || '';

            } else if (aiModel === "4") {
                // OpenAI / compatible
                if (!apiKey) throw new Error("API key not set. Configure it in Zen Mods settings → Zen Tabs Organiser.");
                console.log(`[ZenTabsOrganiser] AI (OpenAI/${model}): ${validTabs.length} tabs…`);
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: estimatedTokens, temperature: 0.1 })
                });
                if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
                aiText = (await res.json()).choices?.[0]?.message?.content?.trim() || '';

            } else {
                console.warn(`[ZenTabsOrganiser] Unknown AI provider: ${aiModel}`);
                return [];
            }

            if (!aiText) throw new Error("AI returned empty response");
            console.log("[ZenTabsOrganiser] AI raw response:\n", aiText);

            const lines = aiText.split('\n').map(l => l.trim()).filter(Boolean);
            let result;

            if (lines.length === validTabs.length) {
                const topics = lines.map(processTopic);
                result = validTabs.map((tab, i) => ({ tab, topic: topics[i] }));
            } else if (lines.length > validTabs.length) {
                console.warn(`[ZenTabsOrganiser] AI: ${lines.length} lines for ${validTabs.length} tabs — truncating`);
                const topics = lines.slice(0, validTabs.length).map(processTopic);
                result = validTabs.map((tab, i) => ({ tab, topic: topics[i] }));
            } else if (lines.length >= validTabs.length - 3) {
                console.warn(`[ZenTabsOrganiser] AI: ${lines.length} lines for ${validTabs.length} tabs — padding`);
                const topics = lines.map(processTopic);
                result = validTabs.map((tab, i) => ({ tab, topic: i < topics.length ? topics[i] : "Uncategorized" }));
            } else {
                console.error(`[ZenTabsOrganiser] AI: ${lines.length} lines for ${validTabs.length} tabs — too far off, falling back`);
                return []; // Will trigger domain fallback
            }

            return result;
        } catch (error) {
            console.error(`[ZenTabsOrganiser] AI error:`, error);
            return []; // Domain fallback
        } finally {
            later(() => {
                validTabs.forEach(tab => { if (tab?.isConnected) tab.classList.remove('tab-is-sorting'); });
            }, 200);
        }
    };

    // ==========================================
    //  Domain-based fallback grouping
    // ==========================================

    const INTERNAL_SCHEMES = ['about:', 'moz-extension:', 'chrome:', 'resource:', 'jar:', 'data:', 'javascript:', 'blob:'];

    const MULTI_PART_TLDS = [
        'co.uk', 'co.nz', 'co.za', 'co.jp', 'co.in', 'co.il', 'co.kr',
        'com.au', 'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.my', 'com.hk',
        'org.uk', 'net.au', 'net.nz', 'gov.uk', 'gov.au', 'edu.au',
        'ac.uk', 'ac.nz', 'ac.jp', 'ne.jp', 'or.jp',
    ];

    const PAGE_CATEGORIES = [
        { label: 'Job Search', color: 'green', domains: new Set(['indeed.com','linkedin.com','glassdoor.com','monster.com','jobup.ch','jobs.ch','welcometothejungle.com','apec.fr','cadremploi.fr','talent.com','ziprecruiter.com']), urlPatterns: [/\/jobs?\b/i, /\/emplois?\b/i, /\/careers?\b/i] },
        { label: 'Development', color: 'purple', domains: new Set(['github.com','gitlab.com','bitbucket.org','stackoverflow.com','developer.mozilla.org','npmjs.com','crates.io','pypi.org','codepen.io','codesandbox.io','replit.com','vercel.com','netlify.com']) },
        { label: 'AI Tools', color: 'cyan', domains: new Set(['claude.ai','claude.com','chat.openai.com','openai.com','gemini.google.com','perplexity.ai','copilot.microsoft.com','huggingface.co','mistral.ai','poe.com']) },
        { label: 'Social', color: 'blue', domains: new Set(['twitter.com','x.com','facebook.com','instagram.com','reddit.com','mastodon.social','bsky.app','threads.net','discord.com','slack.com']) },
        { label: 'Video', color: 'red', domains: new Set(['youtube.com','vimeo.com','twitch.tv','dailymotion.com','netflix.com','primevideo.com','disneyplus.com']) },
        { label: 'Email', color: 'orange', domains: new Set(['proton.me','protonmail.com','mail.google.com','outlook.live.com','outlook.com','mail.yahoo.com','fastmail.com','tutanota.com']) },
        { label: 'Finance', color: 'yellow', domains: new Set(['interactivebrokers.ie','interactivebrokers.com','binance.com','coinbase.com','kraken.com','trading212.com','revolut.com','wise.com','paypal.com','boursorama.com']) },
        { label: 'Search', color: 'yellow', domains: new Set(['google.com','bing.com','duckduckgo.com','startpage.com','ecosia.org','kagi.com']) },
        { label: 'Shopping', color: 'pink', domains: new Set(['amazon.com','amazon.fr','amazon.co.uk','ebay.com','etsy.com','aliexpress.com','leboncoin.fr','fnac.com']) },
        { label: 'News', color: 'orange', domains: new Set(['bbc.com','bbc.co.uk','theguardian.com','nytimes.com','lemonde.fr','lefigaro.fr','reuters.com','techcrunch.com','theverge.com','arstechnica.com','news.ycombinator.com']) },
    ];

    function getBaseDomain(url) {
        if (!url) return null;
        for (const s of INTERNAL_SCHEMES) { if (url.startsWith(s)) return null; }
        let hostname;
        try { hostname = new URL(url).hostname.toLowerCase(); } catch { return null; }
        if (!hostname) return null;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;
        if (hostname.startsWith('[')) return hostname;
        if (!hostname.includes('.')) return hostname;
        const parts = hostname.split('.');
        const lastTwo = parts.slice(-2).join('.');
        if (MULTI_PART_TLDS.includes(lastTwo)) {
            const bp = parts.slice(-3);
            if (bp[0] === 'www') bp.shift();
            return bp.join('.');
        }
        return parts.slice(-2).join('.');
    }

    function getPageCategory(url, domain) {
        for (const cat of PAGE_CATEGORIES) {
            if (cat.domains.has(domain)) return cat;
            if (cat.urlPatterns) { for (const p of cat.urlPatterns) { if (p.test(url)) return cat; } }
        }
        return null;
    }

    // Sites whose own capitalisation is not what a naive uppercase-first gives.
    const BRAND_CASING = {
        github: 'GitHub', gitlab: 'GitLab', youtube: 'YouTube', mediafire: 'MediaFire',
        openrouter: 'OpenRouter', openai: 'OpenAI', linkedin: 'LinkedIn', paypal: 'PayPal',
        stackoverflow: 'Stack Overflow', deepl: 'DeepL', huggingface: 'Hugging Face',
        wetransfer: 'WeTransfer', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp',
        aliexpress: 'AliExpress', ebay: 'eBay', icloud: 'iCloud', bbc: 'BBC',
        npmjs: 'npm', arxiv: 'arXiv', notion: 'Notion', figma: 'Figma',
    };

    /**
     * Human-readable name for a domain: the site's own name, without the
     * public suffix. "mediafire.com" -> "MediaFire", not "Mediafire.Com".
     */
    function getDomainLabel(domain) {
        const stripped = domain.replace(/^www\./, '');

        // An IP address has no registrable name to extract — self-hosted
        // dashboards are usually reached this way. Keep it verbatim.
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(stripped) || stripped.includes(':')) {
            return stripped;
        }

        const parts = stripped.split('.');

        // Drop the public suffix so the label is the site, not the registry.
        let nameParts = parts;
        if (parts.length > 2 && MULTI_PART_TLDS.includes(parts.slice(-2).join('.'))) {
            nameParts = parts.slice(0, -2);
        } else if (parts.length > 1) {
            nameParts = parts.slice(0, -1);
        }

        // "docs.google.com" -> "Google": the registrable name, not the subdomain.
        const name = nameParts[nameParts.length - 1] || stripped;
        return BRAND_CASING[name] ?? (name.charAt(0).toUpperCase() + name.slice(1));
    }

    /**
     * Domain-based fallback: assigns tabs to categories or domain groups.
     * Returns {topic, tab}[] (same shape as AI result).
     */
    function domainGroupTabs(tabs) {
        const results = [];
        for (const tab of tabs) {
            if (!tab?.isConnected) continue;
            const url = tab.linkedBrowser?.currentURI?.spec ?? '';
            const domain = getBaseDomain(url);
            if (!domain) { results.push({ tab, topic: "Uncategorized" }); continue; }
            const cat = getPageCategory(url, domain);
            results.push({ tab, topic: cat ? cat.label : getDomainLabel(domain) });
        }
        return results;
    }

    // ==========================================
    //  Auto-assign icons to groups
    // ==========================================

    const ICON_BASE = 'chrome://browser/skin/zen-icons/selectable/';

    /** Map of keywords (in label or domain) → icon name.
     *  ORDER MATTERS: more specific entries must come BEFORE generic ones.
     *  e.g. 'extension-puzzle' before 'code', 'stats-chart' before 'code'. */
    const ICON_MAP = [
        // Extensions & browser mods (BEFORE dev/code — "tidy", "zen", "addon" are specific)
        { keywords: ['extension', 'addon', 'plugin', 'mod', 'tidy', 'zen'], icon: 'extension-puzzle' },
        // Finance & trading (BEFORE dev/code — tradingview domain contains no 'github' but label might match 'code' later)
        { keywords: ['finance', 'bank', 'trading', 'invest', 'crypto', 'binance', 'coinbase', 'tradingview', 'finary', 'stock', 'portfolio'], icon: 'stats-chart' },
        { keywords: ['wallet', 'payment', 'paypal', 'stripe', 'revolut', 'wise'], icon: 'wallet' },
        // AI & tech (specific AI services before generic 'dev')
        { keywords: ['ai', 'claude', 'openai', 'gemini', 'chatgpt', 'copilot', 'perplexity', 'mistral', 'huggingface'], icon: 'flask' },
        // Social & chat
        { keywords: ['social', 'twitter', 'facebook', 'instagram', 'reddit', 'mastodon', 'bsky', 'threads'], icon: 'people' },
        { keywords: ['discord', 'slack', 'chat', 'messenger', 'telegram', 'whatsapp'], icon: 'chat' },
        // Video & media (canal, entertainment before generic 'code')
        { keywords: ['youtube', 'video', 'twitch', 'netflix', 'streaming', 'vimeo', 'dailymotion', 'disney', 'canal', 'entertainment', 'ent'], icon: 'video' },
        { keywords: ['music', 'spotify', 'soundcloud', 'deezer', 'audio'], icon: 'music' },
        { keywords: ['image', 'photo', 'gallery', 'flickr', 'unsplash', 'imgur'], icon: 'image' },
        // Shopping
        { keywords: ['shopping', 'amazon', 'ebay', 'etsy', 'aliexpress', 'shop', 'store', 'retail', 'buy'], icon: 'basket' },
        // Work & productivity
        { keywords: ['mail', 'email', 'gmail', 'outlook', 'proton', 'inbox'], icon: 'mail' },
        { keywords: ['calendar', 'schedule', 'event', 'agenda'], icon: 'time' },
        { keywords: ['job', 'career', 'hiring', 'linkedin', 'recruit', 'emploi'], icon: 'briefcase' },
        { keywords: ['document', 'docs', 'google docs', 'notion', 'wiki', 'confluence'], icon: 'page' },
        { keywords: ['cloud', 'drive', 'dropbox', 'onedrive', 'storage'], icon: 'cloud' },
        // News & reading
        { keywords: ['news', 'article', 'press', 'journal', 'bbc', 'reuters', 'guardian', 'nytimes', 'hacker news'], icon: 'megaphone' },
        { keywords: ['book', 'read', 'library', 'kindle', 'medium', 'blog', 'onglet', 'onglets'], icon: 'book' },
        // Home & IoT
        { keywords: ['home', 'iot', 'smart', 'aqara', 'shelly', 'home assistant', 'domotique', 'real estate', 'immobilier', 'nuki'], icon: 'key' },
        // Networking (specific before dev)
        { keywords: ['unifi', 'ubiquiti', 'network', 'wifi', 'router'], icon: 'globe-1' },
        // Gaming
        { keywords: ['game', 'gaming', 'steam', 'playstation', 'xbox', 'nintendo'], icon: 'game-controller' },
        // Travel & maps
        { keywords: ['travel', 'map', 'flight', 'hotel', 'booking', 'airbnb'], icon: 'airplane' },
        { keywords: ['location', 'maps', 'directions', 'gps'], icon: 'location' },
        // Design
        { keywords: ['design', 'figma', 'sketch', 'canva', 'adobe', 'photoshop'], icon: 'palette' },
        // Education
        { keywords: ['school', 'education', 'university', 'course', 'learn', 'tutorial', 'udemy'], icon: 'school' },
        // Food
        { keywords: ['food', 'recipe', 'restaurant', 'cooking', 'cuisine'], icon: 'cutlery' },
        // Settings & config
        { keywords: ['settings', 'config', 'preferences', 'admin', 'zen mods', 'about:'], icon: 'construct' },
        // Security
        { keywords: ['security', 'password', 'auth', 'lock', 'vpn'], icon: 'lock-closed' },
        // Search (before generic dev/code)
        { keywords: ['search', 'google', 'bing', 'duckduckgo', 'recherche'], icon: 'globe' },
        // Dev & code — GENERIC, kept last so specific entries above win first
        { keywords: ['github', 'gitlab', 'bitbucket', 'code', 'development', 'dev', 'stack overflow', 'stackoverflow', 'npm', 'programming'], icon: 'code' },
        { keywords: ['terminal', 'console', 'shell', 'cli', 'command'], icon: 'terminal' },
        { keywords: ['bug', 'debug', 'issue', 'error'], icon: 'bug' },
        { keywords: ['build', 'deploy', 'ci', 'pipeline'], icon: 'build' },
    ];

    function pickIconForGroup(label, tabs) {
        const labelLower = (label || '').toLowerCase();

        // 1. Check LABEL first
        for (const entry of ICON_MAP) {
            for (const kw of entry.keywords) {
                if (labelLower.includes(kw)) return `${ICON_BASE}${entry.icon}.svg`;
            }
        }

        // 2. Then check domains
        const domains = [];
        for (const tab of tabs) {
            try {
                const url = tab.linkedBrowser?.currentURI?.spec || '';
                if (url.startsWith('http')) domains.push(new URL(url).hostname.replace(/^www\./, '').toLowerCase());
            } catch {}
        }
        const domainText = domains.join(' ');
        for (const entry of ICON_MAP) {
            for (const kw of entry.keywords) {
                if (domainText.includes(kw)) return `${ICON_BASE}${entry.icon}.svg`;
            }
        }

        return `${ICON_BASE}folder.svg`;
    }

    /**
     * Curated palette — beautiful, high-contrast colors designed for dark UI.
     * Inspired by Arc, Linear, Notion. Each color works well at 10-40% opacity.
     */
    const CURATED_PALETTE = [
        '#7C6EF6', // Indigo
        '#E5574F', // Coral red
        '#3B9B6D', // Emerald
        '#D97B2B', // Amber
        '#4A9AE6', // Sky blue
        '#C74882', // Rose
        '#2ABBA7', // Teal
        '#9B6BC6', // Lavender
        '#D4A52C', // Gold
        '#5B8DEF', // Periwinkle
        '#E07A5F', // Terracotta
        '#45B7A0', // Mint
    ];

    // --- Corner radius, inherited from a real tab ---
    // A group's boxes are meant to look like tab rows, corners included. A
    // theme cannot be counted on to route its radius through
    // `--tab-border-radius`: Nebula, for one, paints `.tab-background`
    // directly with its own variable and `!important`, so any variable this
    // mod picks in the stylesheet is simply the wrong one under some theme.
    // The value that is never wrong is the one a tab actually ends up with,
    // so read that and republish it for the stylesheet to use.
    const RADIUS_VAR = '--zto-tab-radius';

    function syncTabRadius() {
        try {
            // An essential is a different shape by design in some themes, so
            // measure an ordinary tab. The unscoped query is the fallback for
            // a window whose only tabs sit outside the strip's own container.
            const bg =
                document.querySelector('#tabbrowser-tabs .tabbrowser-tab:not([zen-essential]) .tab-background') ||
                document.querySelector('.tabbrowser-tab:not([zen-essential]) .tab-background');
            if (!bg) return;
            // Deliberately a single corner: `borderRadius` resolves to a
            // multi-value shorthand whenever the corners differ, which would
            // be nonsense inside the `<r> <r> 0 0` shorthands this feeds.
            const radius = window.getComputedStyle(bg).borderTopLeftRadius;
            // 0px is a real answer — a theme is allowed square tabs — so only
            // an empty one means nothing was resolved.
            if (!radius) return;
            document.documentElement.style.setProperty(RADIUS_VAR, radius);
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Could not read the tab corner radius:', e);
        }
    }

    // --- Colour storage, keyed by group id ---
    // Colour is a property of a group's identity, not of its position in a
    // list. Deriving it from an index meant the same group changed colour on
    // every Sort, because the map is rebuilt from DOM order each time.
    const readSavedColors = () => {
        try {
            const raw = SessionStore.getCustomWindowValue(window, 'zenTidyColors');
            const parsed = raw ? JSON.parse(raw) : null;
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch {
            return {};
        }
    };

    const writeSavedColors = (colorMap) => {
        try {
            SessionStore.setCustomWindowValue(window, 'zenTidyColors', JSON.stringify(colorMap));
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Failed to persist colors:', e);
        }
    };

    /**
     * Paint one group. Idempotent, so re-running it causes no visible change.
     *
     * Firefox resolves a group's colour indirectly: `set color(code)` writes
     *     --tab-group-color: var(--tab-group-<code>)
     * and the palette entry is expected to exist under that name. Earlier
     * versions of this mod published `--tab-group-color-<code>` instead — a
     * name Firefox 154 never reads — so every group fell back to grey.
     *
     * Rather than guess the convention of the build we happen to run on, set
     * the resolved properties directly on the element. Inline properties win
     * over whatever the setter wrote, and no name has to match.
     */
    const applyGroupColor = (groupEl, color) => {
        if (groupEl.style.getPropertyValue('--tab-group-color') === color) return false;

        // Still go through the setter so Firefox keeps its own bookkeeping and
        // the choice survives in the session store.
        try { groupEl.color = `${groupEl.id}-favicon`; } catch {}

        groupEl.setAttribute('zen-tidy-color', 'true');
        groupEl.style.setProperty('--tab-group-color', color);
        groupEl.style.setProperty('--tab-group-color-invert', color);
        groupEl.style.setProperty('--tab-group-color-pale',
            `color-mix(in srgb, ${color} 35%, white)`);
        return true;
    };

    /**
     * Assign a colour to every group, keeping whatever a group already has.
     * Only genuinely new groups draw from the palette, and they take a colour
     * no visible sibling is using.
     */
    function autoAssignColors(groupElementsMap) {
        if (!autoColors()) return;

        const saved = readSavedColors();
        const live = [...groupElementsMap.values()].filter(el => el?.isConnected && el.id);

        // Colours already spoken for by groups that are still on screen.
        const taken = new Set(live.map(el => saved[el.id]).filter(Boolean));
        const nextColorMap = {};

        for (const groupEl of live) {
            let color = saved[groupEl.id];
            if (!color) {
                color = CURATED_PALETTE.find(c => !taken.has(c))
                    ?? CURATED_PALETTE[taken.size % CURATED_PALETTE.length];
                taken.add(color);
            }
            nextColorMap[groupEl.id] = color;
            try {
                applyGroupColor(groupEl, color);
            } catch (e) {
                console.warn(`[ZenTabsOrganiser] Failed to set color for "${groupEl.id}":`, e);
            }
        }

        // Rewriting from live groups only also prunes ids that no longer exist.
        writeSavedColors(nextColorMap);
    }

    /** Re-apply saved colours at startup, before any sort has run. */
    function restoreColors() {
        if (!autoColors()) return;
        let restored = 0;
        for (const [groupId, color] of Object.entries(readSavedColors())) {
            const group = document.getElementById(groupId);
            if (group?.isConnected) {
                try {
                    applyGroupColor(group, color);
                    restored++;
                } catch (e) {
                    console.warn(`[ZenTabsOrganiser] Failed to restore color for "${groupId}":`, e);
                }
            }
        }
        if (restored > 0) console.log(`[ZenTabsOrganiser] Restored ${restored} group colors from session`);
    }

    // --- Icon storage, keyed by group id ---
    // The icon this mod injects lives only in DOM Zen rebuilds from the
    // session on every restart, so without persisting it separately it
    // vanished until the next Sort.
    const readSavedIcons = () => {
        try {
            const raw = SessionStore.getCustomWindowValue(window, 'zenTidyIcons');
            const parsed = raw ? JSON.parse(raw) : null;
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch {
            return {};
        }
    };

    const writeSavedIcons = (iconMap) => {
        try {
            SessionStore.setCustomWindowValue(window, 'zenTidyIcons', JSON.stringify(iconMap));
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Failed to persist icons:', e);
        }
    };

    /**
     * Auto-assign icons to groups that don't have one yet.
     * Respects the zen-tabs-organiser.auto_icons preference.
     */
    // Class names for the icon this mod injects itself. Deliberately distinct
    // from the ".tab-group-icon-container" name other mods commonly use, so
    // that if one happens to also be installed, the two icons cannot collide.
    const ICON_HOST_CLASS = 'zto-group-icon-container';
    // Carries Firefox's own tab-icon-image class alongside this mod's, so the
    // group icon inherits a favicon's size and end margin from the browser's
    // unscoped rule instead of restating them — a theme that restyles
    // favicons restyles this too. The zto- class only carries the colour.
    const ICON_CLASS = 'tab-icon-image zto-group-icon';

    /**
     * Put an icon in a group's header. This mod owns group icons entirely —
     * it does not try to detect or defer to any other mod that also styles
     * groups.
     */
    const applyOwnGroupIcon = (groupEl, iconUrl) => {
        const labelContainer = groupEl.querySelector(':scope > .tab-group-label-container');
        if (!labelContainer) return false;

        let host = labelContainer.querySelector(`:scope > .${ICON_HOST_CLASS}`);
        if (host?.getAttribute('data-zto-icon') === iconUrl) return false;

        if (!host) {
            host = document.createXULElement('hbox');
            host.className = ICON_HOST_CLASS;
            labelContainer.insertBefore(host, labelContainer.firstChild);
        }

        // iconUrl is always built from ICON_BASE plus a name from ICON_MAP,
        // never from page content.
        host.textContent = '';
        host.appendChild(
            window.MozXULElement.parseXULToFragment(
                `<image class="${ICON_CLASS}" src="${iconUrl}"/>`
            ).firstChild
        );
        host.setAttribute('data-zto-icon', iconUrl);
        return true;
    };

    /** Undo every icon this mod injected. */
    const removeOwnGroupIcons = () => {
        document.querySelectorAll(`.${ICON_HOST_CLASS}`).forEach(el => el.remove());
    };

    function autoAssignIcons(groupElementsMap) {
        if (!autoIcons()) return;
        const nextIconMap = {};

        for (const [label, groupEl] of groupElementsMap) {
            if (!groupEl?.isConnected || !groupEl.id) continue;

            // Respect an icon already there — set by hand, or by another mod
            // this one makes no attempt to detect or coordinate with.
            if (groupEl.querySelector('.tab-group-icon .group-icon, .tab-group-icon label')) continue;

            const tabs = Array.from(groupEl.querySelectorAll('tab'));
            const iconUrl = pickIconForGroup(label, tabs);

            try {
                const applied = applyOwnGroupIcon(groupEl, iconUrl);
                nextIconMap[groupEl.id] = iconUrl;
                if (applied) {
                    console.log(`[ZenTabsOrganiser] Auto-icon: "${label}" → ${iconUrl.split('/').pop()}`);
                }
            } catch (e) {
                console.warn(`[ZenTabsOrganiser] Failed to set icon for "${label}":`, e);
            }
        }

        // Rewritten from live groups every time, so this also prunes ids
        // that no longer exist — same shape as colours.
        writeSavedIcons(nextIconMap);
    }

    /** Re-apply saved icons at startup, before any sort has run. */
    function restoreIcons() {
        if (!autoIcons()) return;
        let restored = 0;
        for (const [groupId, iconUrl] of Object.entries(readSavedIcons())) {
            const group = document.getElementById(groupId);
            if (group?.isConnected) {
                try {
                    if (applyOwnGroupIcon(group, iconUrl)) restored++;
                } catch (e) {
                    console.warn(`[ZenTabsOrganiser] Failed to restore icon for "${groupId}":`, e);
                }
            }
        }
        if (restored > 0) console.log(`[ZenTabsOrganiser] Restored ${restored} group icons from session`);
    }

    // ==========================================
    //  Main Sort Function
    // ==========================================

    const sortTabsByTopic = async () => {
        if (isSorting) return;
        isSorting = true;

        const selectedTabs = gBrowser.selectedTabs;
        const isSortingSelected = selectedTabs.length > 1;

        console.log(`[ZenTabsOrganiser] Starting sort (${isSortingSelected ? 'selected' : 'all ungrouped'})…`);

        let separators = [];
        try {
            // --- Sorting animation on separator ---
            separators = Array.from(getSeparators());
            separators.forEach(sep => sep.classList.add('separator-is-sorting'));

            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) { console.error('[ZenTabsOrganiser] No active workspace'); return; }

            // --- Gather existing group names ---
            const groupSelector = `${GROUP_SELECTOR}:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;
            const allExistingGroupNames = new Set();
            document.querySelectorAll(groupSelector).forEach(el => {
                const label = el.getAttribute('label');
                if (label) allExistingGroupNames.add(label);
            });

            // --- Determine tabs to sort ---
            let initialTabs;
            if (isSortingSelected) {
                initialTabs = selectedTabs.filter(tab =>
                    tab.getAttribute('zen-workspace-id') === currentWorkspaceId &&
                    !tab.pinned && !tab.hasAttribute('zen-empty-tab') && tab.isConnected &&
                    !isForeignContainer(tab.closest('tab-group, zen-folder'))
                );
            } else {
                // Collect ALL tabs first
                initialTabs = Array.from(gBrowser.tabs).filter(tab => {
                    if (tab.getAttribute('zen-workspace-id') !== currentWorkspaceId) return false;
                    if (tab.pinned || tab.hasAttribute('zen-empty-tab') || !tab.isConnected) return false;
                    // Leave tabs the user already filed in a Zen folder or a split
                    // view where they are; sorting them out would dismantle those.
                    if (isForeignContainer(tab.closest('tab-group, zen-folder'))) return false;
                    // Exclude internal/settings pages from sorting
                    const url = tab.linkedBrowser?.currentURI?.spec || '';
                    if (url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('moz-extension:')) return false;
                    return true;
                });
            }

            if (initialTabs.length === 0) { console.log('[ZenTabsOrganiser] No tabs to sort'); return; }
            console.log(`[ZenTabsOrganiser] ${initialTabs.length} tabs to process`);

            // --- Ungroup all tabs first so we start fresh ---
            if (!isSortingSelected) {
                let ungrouped = 0;
                for (const tab of initialTabs) {
                    // Only ungroup out of groups this mod manages; leaving a
                    // folder or a split view would break it.
                    if (ownGroupOf(tab)) {
                        try { gBrowser.ungroupTab(tab); ungrouped++; } catch {}
                    }
                }
                if (ungrouped > 0) console.log(`[ZenTabsOrganiser] Ungrouped ${ungrouped} tabs`);
            }

            // --- Pre-grouping by keywords ---
            const preGroups = {};
            const handledTabs = new Set();
            const tabDataCache = new Map();
            const tabKeywordsCache = new Map();

            initialTabs.forEach(tab => {
                const data = getTabData(tab);
                tabDataCache.set(tab, data);
                tabKeywordsCache.set(tab, data.title ? extractTitleKeywords(data.title) : new Set());
            });

            // Check if AI is enabled (read live)
            const aiEnabled = String(getPref(AI_MODEL_PREF, "0")) !== "0";

            // Pre-grouping ONLY when AI is disabled (domain-based fallback mode)
            // When AI is active, let it handle ALL categorization for better results
            if (!aiEnabled) {
                // Keyword pre-grouping
                const keywordToTabs = new Map();
                initialTabs.forEach(tab => {
                    const kws = tabKeywordsCache.get(tab);
                    if (kws) kws.forEach(kw => {
                        if (!keywordToTabs.has(kw)) keywordToTabs.set(kw, new Set());
                        keywordToTabs.get(kw).add(tab);
                    });
                });

                const potentialKwGroups = [];
                keywordToTabs.forEach((tabsSet, keyword) => {
                    if (tabsSet.size >= minGroupSize()) {
                        potentialKwGroups.push({ keyword, tabs: tabsSet, size: tabsSet.size });
                    }
                });
                potentialKwGroups.sort((a, b) => b.size - a.size);

                potentialKwGroups.forEach(({ keyword, tabs }) => {
                    const finalTabs = new Set();
                    tabs.forEach(t => { if (!handledTabs.has(t)) finalTabs.add(t); });
                    if (finalTabs.size >= minGroupSize()) {
                        const cat = processTopic(keyword);
                        if (cat !== "Uncategorized") {
                            preGroups[cat] = Array.from(finalTabs);
                            finalTabs.forEach(t => handledTabs.add(t));
                        }
                    }
                });

                // Hostname pre-grouping
                const hostCounts = {};
                initialTabs.forEach(tab => {
                    if (!handledTabs.has(tab)) {
                        const h = tabDataCache.get(tab)?.hostname;
                        if (h && h !== 'N/A' && h !== 'Invalid URL' && h !== 'Internal Page') {
                            hostCounts[h] = (hostCounts[h] || 0) + 1;
                        }
                    }
                });

                for (const hostname of Object.keys(hostCounts).sort((a, b) => hostCounts[b] - hostCounts[a])) {
                    if (hostCounts[hostname] >= minGroupSize()) {
                        // Name it after the site, not through processTopic, whose
                        // punctuation stripping turns "mediafire.com" into
                        // "Mediafirecom".
                        const cat = getDomainLabel(hostname);
                        if (!cat || preGroups[cat] || BANNED_TOPICS.has(cat.toLowerCase())) continue;
                        const tabsForHost = initialTabs.filter(t => !handledTabs.has(t) && tabDataCache.get(t)?.hostname === hostname);
                        if (tabsForHost.length >= minGroupSize()) {
                            preGroups[cat] = tabsForHost;
                            tabsForHost.forEach(t => handledTabs.add(t));
                        }
                    }
                }
            }

            // --- AI / domain grouping ---
            const tabsForAI = aiEnabled ? initialTabs.filter(t => t.isConnected) : initialTabs.filter(t => !handledTabs.has(t) && t.isConnected);
            let aiTabTopics = [];
            const allNames = new Set([...allExistingGroupNames, ...Object.keys(preGroups)]);

            if (tabsForAI.length > 0) {
                console.log(`[ZenTabsOrganiser] ${tabsForAI.length} tabs for AI/domain analysis`);
                aiTabTopics = await askAIForMultipleTopics(tabsForAI, Array.from(allNames));

                // If AI returned nothing (not configured or failed), use domain fallback
                if (aiTabTopics.length === 0 && tabsForAI.length > 0) {
                    console.log('[ZenTabsOrganiser] Using domain-based fallback');
                    aiTabTopics = domainGroupTabs(tabsForAI);
                }
            }

            // --- Combine pre-groups + AI groups ---
            const finalGroups = { ...preGroups };
            aiTabTopics.forEach(({ tab, topic }) => {
                if (!topic || topic === "Uncategorized" || !tab?.isConnected) return;
                if (!finalGroups[topic]) finalGroups[topic] = [];
                if (!handledTabs.has(tab)) {
                    finalGroups[topic].push(tab);
                    handledTabs.add(tab);
                }
            });

            // --- Consolidate similar names (Levenshtein) ---
            const originalKeys = Object.keys(finalGroups);
            const mergedKeys = new Set();
            const consolidationMap = {};

            for (let i = 0; i < originalKeys.length; i++) {
                let keyA = originalKeys[i];
                if (mergedKeys.has(keyA)) continue;
                while (consolidationMap[keyA]) keyA = consolidationMap[keyA];
                if (mergedKeys.has(keyA)) continue;

                for (let j = i + 1; j < originalKeys.length; j++) {
                    let keyB = originalKeys[j];
                    if (mergedKeys.has(keyB)) continue;
                    while (consolidationMap[keyB]) keyB = consolidationMap[keyB];
                    if (mergedKeys.has(keyB) || keyA === keyB) continue;

                    const dist = levenshteinDistance(keyA, keyB);
                    if (dist <= CONFIG.consolidationDistanceThreshold && dist > 0) {
                        // Keep the one that's an existing group, or pre-group, or shorter
                        let canonical = keyA, merged = keyB;
                        const aExist = allExistingGroupNames.has(keyA);
                        const bExist = allExistingGroupNames.has(keyB);
                        const aPre = keyA in preGroups;
                        const bPre = keyB in preGroups;
                        if (bExist && !aExist) [canonical, merged] = [keyB, keyA];
                        else if (!aExist && !bExist && bPre && !aPre) [canonical, merged] = [keyB, keyA];
                        else if (keyA.length > keyB.length) [canonical, merged] = [keyB, keyA];

                        console.log(`[ZenTabsOrganiser] Consolidating "${merged}" → "${canonical}"`);
                        if (finalGroups[merged]) {
                            if (!finalGroups[canonical]) finalGroups[canonical] = [];
                            const unique = finalGroups[merged].filter(t => t?.isConnected && !finalGroups[canonical].includes(t));
                            finalGroups[canonical].push(...unique);
                        }
                        mergedKeys.add(merged);
                        consolidationMap[merged] = canonical;
                        delete finalGroups[merged];
                        if (merged === keyA) { keyA = canonical; break; }
                    }
                }
            }

            // --- Remove groups below minimum size threshold ---
            for (const topic of Object.keys(finalGroups)) {
                const tabs = finalGroups[topic].filter(t => t?.isConnected);
                if (tabs.length < minGroupSize()) {
                    delete finalGroups[topic];
                } else {
                    finalGroups[topic] = tabs;
                }
            }

            if (Object.keys(finalGroups).length === 0) {
                console.log('[ZenTabsOrganiser] No groups after consolidation');
                return;
            }

            console.log('[ZenTabsOrganiser] Final groups:', Object.keys(finalGroups).map(k => `${k}(${finalGroups[k].length})`).join(', '));

            // --- Get existing group elements ---
            const existingGroupElements = new Map();
            document.querySelectorAll(groupSelector).forEach(el => {
                const label = el.getAttribute('label');
                if (label) existingGroupElements.set(label, el);
            });

            // --- Create / update groups ---
            const newGroupsToColor = [];
            for (const topic in finalGroups) {
                const tabsForTopic = finalGroups[topic];
                if (tabsForTopic.length === 0) continue;

                const existingEl = existingGroupElements.get(topic);

                if (existingEl?.isConnected) {
                    // Add to existing group
                    try {
                        if (existingEl.getAttribute("collapsed") === "true") {
                            existingEl.setAttribute("collapsed", "false");
                            const lbl = existingEl.querySelector('.tab-group-label');
                            if (lbl) lbl.setAttribute('aria-expanded', 'true');
                        }
                        // Collect tabs not already in this group
                        const tabsToAdd = tabsForTopic.filter(tab =>
                            tab?.isConnected && ownGroupOf(tab) !== existingEl
                        );
                        if (tabsToAdd.length > 0) {
                            if (typeof existingEl.addTabs === 'function') {
                                existingEl.addTabs(tabsToAdd);
                            } else if (typeof gBrowser.moveTabToExistingGroup === 'function') {
                                for (const tab of tabsToAdd) gBrowser.moveTabToExistingGroup(tab, existingEl);
                            } else {
                                console.warn('[ZenTabsOrganiser] No API to move tabs to existing group');
                            }
                        }
                    } catch (e) {
                        console.error(`[ZenTabsOrganiser] Error moving tabs to "${topic}":`, e);
                    }
                } else {
                    // Create new group
                    try {
                        const opts = { label: topic, color: 'gray', insertBefore: tabsForTopic[0] };
                        const newGroup = gBrowser.addTabGroup(tabsForTopic, opts);
                        if (newGroup?.isConnected) {
                            existingGroupElements.set(topic, newGroup);
                            // Colour it now. The reconciliation pass below runs half a
                            // second later; without this the group renders grey until
                            // then and looks like it picks a colour twice.
                            newGroupsToColor.push(newGroup);
                        } else {
                            const fallback = findGroupElement(topic, currentWorkspaceId);
                            if (fallback?.isConnected) existingGroupElements.set(topic, fallback);
                        }
                    } catch (e) {
                        console.error(`[ZenTabsOrganiser] Error creating group "${topic}":`, e);
                        const fallback = findGroupElement(topic, currentWorkspaceId);
                        if (fallback?.isConnected) existingGroupElements.set(topic, fallback);
                    }
                }
            }

            // Paint brand-new groups straight away, before the browser gets a
            // chance to show them in the placeholder grey.
            if (newGroupsToColor.length) {
                const seed = new Map(newGroupsToColor.map(g => [g.getAttribute('label') || g.id, g]));
                try { autoAssignColors(seed); } catch (e) {
                    console.warn('[ZenTabsOrganiser] Initial colouring failed:', e);
                }
            }

            // --- Clean up empty groups left behind after re-sort ---
            later(() => {
                try {
                    const wsGroups = document.querySelectorAll(
                        `${GROUP_SELECTOR}:has(tab[zen-workspace-id="${currentWorkspaceId}"]),
                         ${GROUP_SELECTOR}[zen-workspace-id="${currentWorkspaceId}"]:not(:has(tab))`
                    );
                    for (const group of wsGroups) {
                        const tabs = group.querySelectorAll('tab');
                        if (tabs.length === 0 && group.isConnected) {
                            console.log(`[ZenTabsOrganiser] Removing empty group "${group.getAttribute('label')}"`);
                            try { gBrowser.removeTabGroup(group); } catch {}
                        }
                    }
                } catch (e) {
                    console.warn('[ZenTabsOrganiser] Cleanup error:', e);
                }
            }, 1000);

            console.log('[ZenTabsOrganiser] Sort complete');
        } catch (error) {
            console.error('[ZenTabsOrganiser] Sort error:', error);
        } finally {
            isSorting = false;
            syncTabRadius();

            // Always auto-assign colors & icons to ALL groups in current workspace
            try {
                const wsId = window.gZenWorkspaces?.activeWorkspace;
                if (wsId) {
                    const allGroups = new Map();
                    document.querySelectorAll(`${GROUP_SELECTOR}:has(tab[zen-workspace-id="${wsId}"])`).forEach(g => {
                        const lbl = g.getAttribute('label');
                        if (lbl) allGroups.set(lbl, g);
                    });
                    if (allGroups.size > 0) {
                        later(() => {
                            autoAssignColors(allGroups);
                            autoAssignIcons(allGroups);
                        }, 500);
                    }
                }
            } catch (e) {
                console.warn('[ZenTabsOrganiser] Auto-assign error:', e);
            }
            if (separators.length > 0) {
                later(() => {
                    separators.forEach(sep => {
                        if (sep?.isConnected) {
                            sep.classList.remove('separator-is-sorting');
                        }
                    });
                }, 3000);
            }
            later(() => {
                Array.from(gBrowser.tabs).forEach(tab => { if (tab?.isConnected) tab.classList.remove('tab-is-sorting'); });
            }, 500);
        }
    };

    // ==========================================
    //  Clear Tabs
    // ==========================================

    const clearTabs = () => {
        try {
            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) return;
            const tabsToClose = [];

            for (const tab of gBrowser.tabs) {
                const sameWs = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                // A tab counts as grouped if it sits in ANY container — one of our
                // groups, a Zen folder, or a split view. Clear takes loose tabs only.
                const inGroup = !!tab.closest('tab-group, zen-folder');
                if (sameWs && !tab.selected && !tab.pinned && !inGroup && !tab.hasAttribute('zen-empty-tab') && tab.isConnected) {
                    tabsToClose.push(tab);
                }
            }

            if (tabsToClose.length === 0) return;
            console.log(`[ZenTabsOrganiser] Clearing ${tabsToClose.length} tabs`);

            tabsToClose.forEach(tab => {
                tab.classList.add('tab-closing');
                later(() => {
                    if (tab?.isConnected) {
                        try {
                            gBrowser.removeTab(tab, { animate: false, skipSessionStore: false, closeWindowWithLastTab: false });
                        } catch {
                            if (tab?.isConnected) tab.classList.remove('tab-closing');
                        }
                    }
                }, 500);
            });
        } catch (error) {
            console.error('[ZenTabsOrganiser] Clear error:', error);
        }
    };

    // ==========================================
    //  Button Injection
    // ==========================================

    function ensureButtonsExist(container) {
        if (!container?.isConnected) return;

        if (!container.querySelector('#zen-tidy-sort-button')) {
            try {
                const frag = window.MozXULElement.parseXULToFragment(
                    `<toolbarbutton id="zen-tidy-sort-button" command="cmd_zenTidySort" label="🧹 Sort" tooltiptext="Sort tabs into groups (AI or domain)"/>`
                );
                container.appendChild(frag.firstChild.cloneNode(true));
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding sort button:', e); }
        }

        if (!container.querySelector('#zen-tidy-clear-button')) {
            try {
                const frag = window.MozXULElement.parseXULToFragment(
                    `<toolbarbutton id="zen-tidy-clear-button" command="cmd_zenTidyClear" label="🗑️ Clear" tooltiptext="Close ungrouped, non-pinned tabs"/>`
                );
                container.appendChild(frag.firstChild.cloneNode(true));
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding clear button:', e); }
        }
    }

    /** Find all separator elements regardless of Zen version class name */
    function getSeparators() {
        // Try both class names used across Zen versions
        let seps = document.querySelectorAll('.pinned-tabs-container-separator');
        if (seps.length === 0) seps = document.querySelectorAll('.vertical-pinned-tabs-container-separator');
        return seps;
    }

    function addButtonsToAllSeparators() {
        const separators = getSeparators();
        if (separators.length > 0) {
            separators.forEach(sep => {
                sep.classList.add('zen-tidy-host'); // marker class for our CSS
                ensureButtonsExist(sep);
            });
        } else {
            const periphery = document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            if (periphery && !periphery.querySelector('#zen-tidy-sort-button')) {
                periphery.classList.add('zen-tidy-host');
                ensureButtonsExist(periphery);
            }
        }
    }
    function setupCommandsAndListener() {
        const cmdSet = document.querySelector('commandset#zenCommandSet');
        if (!cmdSet) {
            console.warn('[ZenTabsOrganiser] zenCommandSet not found');
            return;
        }

        if (!cmdSet.querySelector('#cmd_zenTidySort')) {
            try {
                const cmd = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenTidySort"/>`).firstChild;
                cmdSet.appendChild(cmd);
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding sort command:', e); }
        }

        if (!cmdSet.querySelector('#cmd_zenTidyClear')) {
            try {
                const cmd = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenTidyClear"/>`).firstChild;
                cmdSet.appendChild(cmd);
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding clear command:', e); }
        }

        if (!commandListenerAdded) {
            try {
                const handler = (event) => {
                    if (event.target.id === 'cmd_zenTidySort') sortTabsByTopic();
                    else if (event.target.id === 'cmd_zenTidyClear') clearTabs();
                };
                cmdSet.addEventListener('command', handler);
                commandListenerAdded = true;
                onCleanup(() => {
                    cmdSet.removeEventListener('command', handler);
                    commandListenerAdded = false;
                });
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding command listener:', e); }
        }

        onCleanup(() => {
            cmdSet.querySelector('#cmd_zenTidySort')?.remove();
            cmdSet.querySelector('#cmd_zenTidyClear')?.remove();
        });
    }

    // ==========================================
    //  Workspace hooks (re-inject buttons on switch)
    // ==========================================

    function setupZenWorkspaceHooks() {
        if (typeof gZenWorkspaces === 'undefined') return;
        if (gZenWorkspaces._zenTidyHooksApplied) return;

        gZenWorkspaces._zenTidyOriginals = {
            onTabBrowserInserted: gZenWorkspaces.onTabBrowserInserted,
            updateTabsContainers: gZenWorkspaces.updateTabsContainers,
        };
        gZenWorkspaces._zenTidyHooksApplied = true;

        gZenWorkspaces.onTabBrowserInserted = function(event) {
            if (typeof gZenWorkspaces._zenTidyOriginals.onTabBrowserInserted === 'function') {
                try { gZenWorkspaces._zenTidyOriginals.onTabBrowserInserted.call(gZenWorkspaces, event); } catch {}
            }
            later(addButtonsToAllSeparators, 150);
        };

        gZenWorkspaces.updateTabsContainers = function(...args) {
            if (typeof gZenWorkspaces._zenTidyOriginals.updateTabsContainers === 'function') {
                try { gZenWorkspaces._zenTidyOriginals.updateTabsContainers.apply(gZenWorkspaces, args); } catch {}
            }
            later(addButtonsToAllSeparators, 150);
            later(syncTabRadius, 150);
        };

        // Sine can unload the mod while the browser stays open — put the
        // original Zen methods back so nothing keeps calling into this script.
        onCleanup(() => {
            const originals = gZenWorkspaces._zenTidyOriginals;
            if (!originals) return;
            if (typeof originals.onTabBrowserInserted === 'function') {
                gZenWorkspaces.onTabBrowserInserted = originals.onTabBrowserInserted;
            } else {
                delete gZenWorkspaces.onTabBrowserInserted;
            }
            if (typeof originals.updateTabsContainers === 'function') {
                gZenWorkspaces.updateTabsContainers = originals.updateTabsContainers;
            } else {
                delete gZenWorkspaces.updateTabsContainers;
            }
            delete gZenWorkspaces._zenTidyOriginals;
            delete gZenWorkspaces._zenTidyHooksApplied;
        });
    }

    // ==========================================
    //  Initialization
    // ==========================================

    /** Undo the DOM changes made by addButtonsToAllSeparators() */
    function removeButtonsAndHosts() {
        document.querySelectorAll('#zen-tidy-sort-button, #zen-tidy-clear-button')
            .forEach(el => el.remove());
        document.querySelectorAll('.zen-tidy-host')
            .forEach(el => el.classList.remove('zen-tidy-host', 'separator-is-sorting'));
        document.querySelectorAll('.tab-is-sorting')
            .forEach(el => el.classList.remove('tab-is-sorting'));
    }

    function initializeScript() {
        console.log('[ZenTabsOrganiser] loading…');
        let checkCount = 0;
        const maxChecks = 30;

        const interval = every(() => {
            checkCount++;
            const sepOk = !!document.querySelector('.pinned-tabs-container-separator, .vertical-pinned-tabs-container-separator');
            const periOk = !!document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            const cmdOk = !!document.querySelector('commandset#zenCommandSet');
            const gbOk = typeof gBrowser !== 'undefined' && gBrowser.tabContainer;
            const wsOk = typeof gZenWorkspaces !== 'undefined' && typeof gZenWorkspaces.activeWorkspace !== 'undefined';

            if (gbOk && cmdOk && (sepOk || periOk) && wsOk) {
                clearTracked(interval, 'interval');
                const setup = () => {
                    if (destroyed) return;
                    try {
                        removeLegacyStyleElement();
                        setupCommandsAndListener();
                        addButtonsToAllSeparators();
                        onCleanup(removeButtonsAndHosts);
                        onCleanup(removeOwnGroupIcons);
                        onCleanup(() => document.documentElement.style.removeProperty(RADIUS_VAR));
                        onCleanup(() => { localEngines = null; });
                        setupZenWorkspaceHooks();

                        // --- Restore colours and icons once the tab strip settles ---
                        // Zen's session restore can still be creating tab-group
                        // elements well after this script starts, especially with
                        // many tabs. A fixed delay either fires before they exist —
                        // silently doing nothing, so the group looks unstyled until
                        // the next Sort — or later than necessary on a light
                        // session. Instead, wait until the strip stops gaining or
                        // losing nodes for a short while, with a ceiling so a busy
                        // session cannot hold this up forever.
                        {
                            const SETTLE_MS = 250, CEILING_MS = 6000;
                            const container = document.getElementById('tabbrowser-arrowscrollbox') || document.body;
                            let settleTimer = null;
                            const restoreOnce = () => {
                                if (destroyed) return;
                                clearTracked(settleTimer, 'timeout');
                                clearTracked(ceilingTimer, 'timeout');
                                observer.disconnect();
                                syncTabRadius();
                                restoreColors();
                                restoreIcons();
                            };
                            const observer = new MutationObserver(() => {
                                clearTracked(settleTimer, 'timeout');
                                settleTimer = later(restoreOnce, SETTLE_MS);
                            });
                            observer.observe(container, { childList: true, subtree: true });
                            settleTimer = later(restoreOnce, SETTLE_MS);
                            const ceilingTimer = later(restoreOnce, CEILING_MS);
                            onCleanup(() => {
                                observer.disconnect();
                                clearTracked(settleTimer, 'timeout');
                                clearTracked(ceilingTimer, 'timeout');
                            });
                        }

                        console.log('[ZenTabsOrganiser] Setup complete ✓');
                    } catch (e) {
                        console.error('[ZenTabsOrganiser] Setup error:', e);
                    }
                };
                if ('requestIdleCallback' in window) requestIdleCallback(setup, { timeout: 2000 });
                else later(setup, 500);
            } else if (checkCount > maxChecks) {
                clearTracked(interval, 'interval');
                console.error(`[ZenTabsOrganiser] Failed to init after ${maxChecks}s`, { gbOk, cmdOk, sepOk, periOk, wsOk });
            }
        }, 1000);
    }

    // ==========================================
    //  Teardown (Sine unload / disable / update)
    // ==========================================

    const destroy = () => {
        if (destroyed) return;
        destroyed = true;

        clearAllTimers();

        // Run disposers newest-first so teardown mirrors setup.
        while (disposers.length) {
            try {
                disposers.pop()();
            } catch (e) {
                console.warn('[ZenTabsOrganiser] Cleanup step failed:', e);
            }
        }

        if (window.ZenTabsOrganiser?.destroy === destroy) delete window.ZenTabsOrganiser;
        console.log('[ZenTabsOrganiser] Unloaded');
    };

    // Public handle: lets Sine (and other mods) trigger the actions or unload us.
    window.ZenTabsOrganiser = {
        loaded: true,
        version: MOD_VERSION,
        sort: sortTabsByTopic,
        clear: clearTabs,
        destroy,
    };

    // Sine injects addUnloadListener into every chrome window it manages.
    // Declaring `supportsUnload` in theme.json is only honoured if we register here.
    if (typeof window.addUnloadListener === 'function') {
        window.addUnloadListener(destroy);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initializeScript();
    } else {
        const onLoad = () => initializeScript();
        window.addEventListener('load', onLoad, { once: true });
        onCleanup(() => window.removeEventListener('load', onLoad));
    }

})();
