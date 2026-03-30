// VERSION 2.2.0 — Zen Tabs Organiser (AI + Domain hybrid)
(() => {
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

    // --- Read preferences at load ---
    const ENABLE_SORT  = getPref(ENABLE_SORT_PREF, true);
    const ENABLE_CLEAR = getPref(ENABLE_CLEAR_PREF, true);

    // AI prefs are read live in askAIForMultipleTopics (not cached here)
    const MIN_GROUP_SIZE  = parseInt(getPref(MIN_GROUP_SIZE_PREF, "2"), 10) || 2;
    const AUTO_ICONS      = getPref(AUTO_ICONS_PREF, true);
    const AUTO_COLORS     = getPref(AUTO_COLORS_PREF, true);

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
        consolidationDistanceThreshold: 2,
        styles: `
        /*
         * All separator rules use .zen-tidy-host which is added by JS at
         * runtime to whichever element is found (pinned-tabs-container-separator
         * OR vertical-pinned-tabs-container-separator). This avoids duplicating
         * every rule for both class names.
         */

        /* ============= Sort & Clear buttons ============= */
        /* Override Zen's native toolbarbutton hiding in separator */
        .pinned-tabs-container-separator #zen-tidy-sort-button,
        .pinned-tabs-container-separator #zen-tidy-clear-button,
        .vertical-pinned-tabs-container-separator #zen-tidy-sort-button,
        .vertical-pinned-tabs-container-separator #zen-tidy-clear-button,
        #zen-tidy-sort-button,
        #zen-tidy-clear-button {
            visibility: visible !important;
            opacity: 0.6 !important;
            font-size: 11px !important;
            appearance: none !important;
            -moz-appearance: none !important;
            padding: 2px 8px !important;
            margin: 0 2px !important;
            border: none !important;
            border-radius: 4px !important;
            background: transparent !important;
            color: inherit !important;
            cursor: pointer !important;
            pointer-events: auto !important;
            label { display: block !important; cursor: pointer; }
        }

        #zen-tidy-sort-button:hover,
        #zen-tidy-clear-button:hover {
            opacity: 1 !important;
            background: color-mix(in srgb, currentColor 10%, transparent) !important;
        }

        #zen-tidy-sort-button .toolbarbutton-icon,
        #zen-tidy-clear-button .toolbarbutton-icon {
            display: none !important;
        }

        /* Hide buttons via preference toggles */
        @media not (-moz-bool-pref: "${ENABLE_SORT_PREF}") {
            #zen-tidy-sort-button { display: none !important; }
        }
        @media not (-moz-bool-pref: "${ENABLE_CLEAR_PREF}") {
            #zen-tidy-clear-button { display: none !important; }
        }

        /* ============= Separator host ============= */
        .zen-tidy-host {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: flex-end !important;
            min-height: 24px !important;
            max-height: 24px !important;
            height: 24px !important;
            padding: 0 4px !important;
            margin: 0 !important;
            background-color: transparent !important;
            overflow: visible !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        .zen-tidy-host * {
            visibility: visible !important;
        }

        /* Hide the native separator line */
        .zen-tidy-host::before {
            display: none !important;
        }

        /* ============= Separator line ============= */
        .zen-tidy-host toolbarseparator {
            height: 1px !important;
            flex: 1 !important;
            margin: auto 4px !important;
            position: relative !important;
            overflow: visible !important;
            border: none !important;
        }

        .zen-tidy-host toolbarseparator::before {
            border: none !important;
        }

        /* ============= Sorting animation ============= */
        .zen-tidy-host toolbarseparator {
            transition: height 0.6s ease, background 0.6s ease, opacity 0.6s ease !important;
        }

        @keyframes zenSortingPulse {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 1; }
        }

        .zen-tidy-host.separator-is-sorting toolbarseparator {
            height: 1px !important;
            background: #c4a7e7 !important;
            animation: zenSortingPulse 1.2s ease-in-out infinite 0.6s !important;
        }
        .zen-tidy-host.separator-is-sorting > #zen-tidy-sort-button,
        .zen-tidy-host.separator-is-sorting > #zen-tidy-clear-button {
            z-index: 200 !important;
            pointer-events: auto !important;
        }

        /* ============= Tab animations ============= */
        .tab-closing {
            animation: zenTidyFadeUp 0.5s forwards;
        }
        @keyframes zenTidyFadeUp {
            0%   { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); max-height: 0; padding: 0; margin: 0; border: 0; }
        }
        @keyframes zenTidyPulse {
            0%, 100% { opacity: 0.6; }
            50%      { opacity: 1; }
        }
        .tab-is-sorting .tab-icon-image,
        .tab-is-sorting .tab-label {
            animation: zenTidyPulse 1.5s ease-in-out infinite;
            will-change: opacity;
        }
        .tabbrowser-tab {
            transition: transform 0.3s ease-out, opacity 0.3s ease-out,
                        max-height 0.5s ease-out, margin 0.5s ease-out, padding 0.5s ease-out;
        }
    `
    };

    // --- Globals & State ---
    let isSorting = false;
    let commandListenerAdded = false;

    // --- Style injection ---
    const injectStyles = () => {
        let el = document.getElementById('zen-tabs-organiser-styles');
        if (el) {
            if (el.textContent !== CONFIG.styles) el.textContent = CONFIG.styles;
            return;
        }
        el = Object.assign(document.createElement('style'), {
            id: 'zen-tabs-organiser-styles',
            textContent: CONFIG.styles
        });
        document.head.appendChild(el);
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
            return document.querySelector(`tab-group[label="${safe}"]:has(tab[zen-workspace-id="${workspaceId}"])`);
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
            setTimeout(() => {
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

    function getDomainLabel(domain) {
        const stripped = domain.startsWith('www.') ? domain.slice(4) : domain;
        return stripped.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
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

    let paletteIndex = 0;

    function autoAssignColors(groupElementsMap) {
        if (!AUTO_COLORS) return;

        paletteIndex = 0; // Reset on each Sort

        for (const [label, groupEl] of groupElementsMap) {
            if (!groupEl?.isConnected) continue;
            try {
                const color = CURATED_PALETTE[paletteIndex % CURATED_PALETTE.length];
                paletteIndex++;

                // Set as favicon-style custom color + mark as managed
                groupEl.setAttribute('zen-tidy-color', 'true');
                groupEl.color = `${groupEl.id}-favicon`;
                document.documentElement.style.setProperty(
                    `--tab-group-color-${groupEl.id}-favicon`, color);
                document.documentElement.style.setProperty(
                    `--tab-group-color-${groupEl.id}-favicon-invert`, color);

                console.log(`[ZenTabsOrganiser] Auto-color: "${label}" → ${color}`);
            } catch (e) {
                console.warn(`[ZenTabsOrganiser] Failed to set color for "${label}":`, e);
            }
        }

        // Save our color mapping to SessionStore for restoration on restart
        try {
            const colorMap = {};
            for (const [label, groupEl] of groupElementsMap) {
                if (groupEl?.id) {
                    const idx = Array.from(groupElementsMap.keys()).indexOf(label);
                    colorMap[groupEl.id] = CURATED_PALETTE[idx % CURATED_PALETTE.length];
                }
            }
            SessionStore.setCustomWindowValue(window, 'zenTidyColors', JSON.stringify(colorMap));
            console.log('[ZenTabsOrganiser] Colors saved to SessionStore');
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Failed to persist colors:', e);
        }
    }

    /** Restore curated palette colors from SessionStore on startup */
    function restoreColors() {
        try {
            const raw = SessionStore.getCustomWindowValue(window, 'zenTidyColors');
            if (!raw) return;
            const colorMap = JSON.parse(raw);
            let restored = 0;
            for (const [groupId, color] of Object.entries(colorMap)) {
                const group = document.getElementById(groupId);
                if (group?.isConnected) {
                    group.setAttribute('zen-tidy-color', 'true');
                    group.color = `${groupId}-favicon`;
                    document.documentElement.style.setProperty(`--tab-group-color-${groupId}-favicon`, color);
                    document.documentElement.style.setProperty(`--tab-group-color-${groupId}-favicon-invert`, color);
                    restored++;
                }
            }
            if (restored > 0) console.log(`[ZenTabsOrganiser] Restored ${restored} group colors from session`);
        } catch (e) {
            console.warn('[ZenTabsOrganiser] Failed to restore colors:', e);
        }
    }

    /**
     * Auto-assign icons to groups that don't have one yet.
     * Respects the zen-tabs-organiser.auto_icons preference.
     */
    function autoAssignIcons(groupElementsMap) {
        if (!AUTO_ICONS) return;
        if (typeof globalThis.advancedTabGroups === 'undefined') {
            console.log('[ZenTabsOrganiser] ATG not available, skipping auto-icons');
            return;
        }
        const atg = globalThis.advancedTabGroups;

        for (const [label, groupEl] of groupElementsMap) {
            if (!groupEl?.isConnected) continue;

            // Skip if group already has a custom icon
            const existingIcon = groupEl.querySelector('.tab-group-icon .group-icon, .tab-group-icon label');
            if (existingIcon) continue;

            const tabs = Array.from(groupEl.querySelectorAll('tab'));
            const iconUrl = pickIconForGroup(label, tabs);

            try {
                atg.applyGroupIcon(groupEl, iconUrl);

                console.log(`[ZenTabsOrganiser] Auto-icon: "${label}" → ${iconUrl.split('/').pop()}`);
            } catch (e) {
                console.warn(`[ZenTabsOrganiser] Failed to set icon for "${label}":`, e);
            }
        }
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
            const groupSelector = `tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;
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
                    !tab.pinned && !tab.hasAttribute('zen-empty-tab') && tab.isConnected
                );
            } else {
                // Collect ALL tabs first
                initialTabs = Array.from(gBrowser.tabs).filter(tab => {
                    if (tab.getAttribute('zen-workspace-id') !== currentWorkspaceId) return false;
                    if (tab.pinned || tab.hasAttribute('zen-empty-tab') || !tab.isConnected) return false;
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
                    if (tab.closest('tab-group')) {
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
                    if (tabsSet.size >= MIN_GROUP_SIZE) {
                        potentialKwGroups.push({ keyword, tabs: tabsSet, size: tabsSet.size });
                    }
                });
                potentialKwGroups.sort((a, b) => b.size - a.size);

                potentialKwGroups.forEach(({ keyword, tabs }) => {
                    const finalTabs = new Set();
                    tabs.forEach(t => { if (!handledTabs.has(t)) finalTabs.add(t); });
                    if (finalTabs.size >= MIN_GROUP_SIZE) {
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
                    if (hostCounts[hostname] >= MIN_GROUP_SIZE) {
                        const cat = processTopic(hostname);
                        if (preGroups[cat] || cat === "Uncategorized") continue;
                        const tabsForHost = initialTabs.filter(t => !handledTabs.has(t) && tabDataCache.get(t)?.hostname === hostname);
                        if (tabsForHost.length >= MIN_GROUP_SIZE) {
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
                if (tabs.length < MIN_GROUP_SIZE) {
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
                            tab?.isConnected && tab.closest('tab-group') !== existingEl
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

            // --- Clean up empty groups left behind after re-sort ---
            setTimeout(() => {
                try {
                    const wsGroups = document.querySelectorAll(`tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"]), tab-group:not(:has(tab))`);
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

            // Always auto-assign colors & icons to ALL groups in current workspace
            try {
                const wsId = window.gZenWorkspaces?.activeWorkspace;
                if (wsId) {
                    const allGroups = new Map();
                    document.querySelectorAll(`tab-group:has(tab[zen-workspace-id="${wsId}"])`).forEach(g => {
                        const lbl = g.getAttribute('label');
                        if (lbl) allGroups.set(lbl, g);
                    });
                    if (allGroups.size > 0) {
                        setTimeout(() => {
                            autoAssignColors(allGroups);
                            autoAssignIcons(allGroups);
                        }, 500);
                    }
                }
            } catch (e) {
                console.warn('[ZenTabsOrganiser] Auto-assign error:', e);
            }
            if (separators.length > 0) {
                setTimeout(() => {
                    separators.forEach(sep => {
                        if (sep?.isConnected) {
                            sep.classList.remove('separator-is-sorting');
                        }
                    });
                }, 3000);
            }
            setTimeout(() => {
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
            const groupSelector = `tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;
            const tabsToClose = [];

            for (const tab of gBrowser.tabs) {
                const sameWs = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                const gp = tab.closest('tab-group');
                const inGroup = gp ? gp.matches(groupSelector) : false;
                if (sameWs && !tab.selected && !tab.pinned && !inGroup && !tab.hasAttribute('zen-empty-tab') && tab.isConnected) {
                    tabsToClose.push(tab);
                }
            }

            if (tabsToClose.length === 0) return;
            console.log(`[ZenTabsOrganiser] Clearing ${tabsToClose.length} tabs`);

            tabsToClose.forEach(tab => {
                tab.classList.add('tab-closing');
                setTimeout(() => {
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
                cmdSet.addEventListener('command', (event) => {
                    if (event.target.id === 'cmd_zenTidySort') sortTabsByTopic();
                    else if (event.target.id === 'cmd_zenTidyClear') clearTabs();
                });
                commandListenerAdded = true;
            } catch (e) { console.error('[ZenTabsOrganiser] Error adding command listener:', e); }
        }
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
            setTimeout(addButtonsToAllSeparators, 150);
        };

        gZenWorkspaces.updateTabsContainers = function(...args) {
            if (typeof gZenWorkspaces._zenTidyOriginals.updateTabsContainers === 'function') {
                try { gZenWorkspaces._zenTidyOriginals.updateTabsContainers.apply(gZenWorkspaces, args); } catch {}
            }
            setTimeout(addButtonsToAllSeparators, 150);
        };
    }

    // ==========================================
    //  Initialization
    // ==========================================

    /** Update --zen-tidy-collapse-delay on each group based on tab count */
    function updateCollapseTimings() {
        document.querySelectorAll('tab-group').forEach(group => {
            const tabCount = group.querySelectorAll('.tab-group-container tab').length;
            // Last tab's delay = (min(tabCount, 10) - 1) * 0.03s, plus the animation duration 0.25s
            const lastTabEnd = Math.min(tabCount, 10) * 0.03 + 0.25;
            group.style.setProperty('--zen-tidy-collapse-duration', `${lastTabEnd.toFixed(2)}s`);
        });
    }

    function setupCollapseTimingObserver() {
        updateCollapseTimings();
        // Re-calculate when groups are collapsed/expanded or created
        const observer = new MutationObserver(() => updateCollapseTimings());
        const tabContainer = document.getElementById('tabbrowser-arrowscrollbox');
        if (tabContainer) {
            observer.observe(tabContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['collapsed'] });
        }
    }

    function initializeScript() {
        console.log('[ZenTabsOrganiser] v2.2.0 loading…');
        let checkCount = 0;
        const maxChecks = 30;

        const interval = setInterval(() => {
            checkCount++;
            const sepOk = !!document.querySelector('.pinned-tabs-container-separator, .vertical-pinned-tabs-container-separator');
            const periOk = !!document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            const cmdOk = !!document.querySelector('commandset#zenCommandSet');
            const gbOk = typeof gBrowser !== 'undefined' && gBrowser.tabContainer;
            const wsOk = typeof gZenWorkspaces !== 'undefined' && typeof gZenWorkspaces.activeWorkspace !== 'undefined';

            if (gbOk && cmdOk && (sepOk || periOk) && wsOk) {
                clearInterval(interval);
                const setup = () => {
                    try {
                        injectStyles();
                        setupCommandsAndListener();
                        addButtonsToAllSeparators();
                        setupZenWorkspaceHooks();
                        setupCollapseTimingObserver();
                        // Restore curated colors after ATG has processed groups
                        setTimeout(restoreColors, 2000);
                        console.log('[ZenTabsOrganiser] Setup complete ✓');
                    } catch (e) {
                        console.error('[ZenTabsOrganiser] Setup error:', e);
                    }
                };
                if ('requestIdleCallback' in window) requestIdleCallback(setup, { timeout: 2000 });
                else setTimeout(setup, 500);
            } else if (checkCount > maxChecks) {
                clearInterval(interval);
                console.error(`[ZenTabsOrganiser] Failed to init after ${maxChecks}s`, { gbOk, cmdOk, sepOk, periOk, wsOk });
            }
        }, 1000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initializeScript();
    } else {
        window.addEventListener('load', initializeScript, { once: true });
    }

})();
