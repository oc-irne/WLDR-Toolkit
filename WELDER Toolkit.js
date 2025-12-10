// ==UserScript==
// @name         WELDER Toolkit - Timeline
// @namespace    https://welder.nl/
// @version      0.1
// @description  Post Finder, Top5, CSV Export, Engagement Graph, Pinned Detector, Active Accounts Leaderboard + Floating Tools Sidebar + Draggable Tool Output Window + Passcode Lock
// @author       Enrico Rijken
// @match        https://*.welder.nl/*
// @match        https://*.welder.cloud/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**********************************************
     * STATUS BUBBLE (NON-BLOCKING TOAST)
     **********************************************/
    function showStatus(message, duration = 0) {
        let box = document.getElementById("welderStatusBox");
        if (!box) {
            box = document.createElement("div");
            box.id = "welderStatusBox";
            box.style.cssText = `
                position: fixed;
                top: 88px;
                right: 20px;
                background: var(--primary);
                color: white;
                padding: 10px 16px;
                border-radius: 8px;
                border: 1px solid rgba(0, 0, 0, 0.1);
                z-index: 999999999;
                font-size: 15px;
                font-family: sans-serif;
                opacity: 0;
                transform: translateY(-10px);
                transition: opacity .25s ease, transform .25s ease;
            `;
            document.body.appendChild(box);
        }

        box.textContent = message;
        requestAnimationFrame(() => {
            box.style.opacity = "1";
            box.style.transform = "translateY(0)";
        });

        if (duration > 0) {
            setTimeout(hideStatus, duration);
        }
    }

    function hideStatus() {
        const box = document.getElementById("welderStatusBox");
        if (!box) return;

        box.style.opacity = "0";
        box.style.transform = "translateY(-10px)";
        setTimeout(() => box && box.remove(), 300);
    }

    /**********************************************
     * GLOBAL SETTINGS
     **********************************************/
    const SCROLL_INTERVAL = 150;
    const LOAD_WAIT = 800;
    const MAX_STABLE = 4;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    let lastPosts = null; // cache for CSV / graph / leaderboards
    let timelineScanned = false;
    let toolkitUnlocked = false; // 🔒 passcode gate (once per page load)

    /**********************************************
     * DRAGGABLE HELPER (for Tool Output Window)
     **********************************************/
    function makeDraggable(el) {
        let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

        const header = el.querySelector(".draggable-header") || el;
        header.style.cursor = "move";

        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();

            mouseX = e.clientX;
            mouseY = e.clientY;

            document.onmouseup = closeDrag;
            document.onmousemove = drag;
        }

        function drag(e) {
            e.preventDefault();

            posX = mouseX - e.clientX;
            posY = mouseY - e.clientY;

            mouseX = e.clientX;
            mouseY = e.clientY;

            el.style.top = (el.offsetTop - posY) + "px";
            el.style.left = (el.offsetLeft - posX) + "px";
        }

        function closeDrag() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    /**********************************************
     * KILL TOOLKIT
     **********************************************/
    function destroyToolkit() {
        console.log("Destroying toolkit…");

        const ids = [
            "welderToolkitBtn",
            "welderToolkitPanel",
            "welderToolsSidebar",
            "welderGlowCSS",
            "welderStatusBox",
            "welderToolWindow"
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // Reset flags
        timelineScanned = false;
        lastPosts = null;
        toolkitUnlocked = false;
    }

    /**********************************************
     * SCROLL CONTAINER DETECTION
     **********************************************/
    function getScrollContainer() {
        let el = document.querySelector(
            ".main-view-container, .ui-view, .content-wrapper, .scrollable-content"
        );
        if (el && el.scrollHeight > el.clientHeight + 50) return el;

        let best = document.documentElement;
        let maxScroll = 0;

        for (const node of document.querySelectorAll("*")) {
            const s = node.scrollHeight - node.clientHeight;
            if (s > 200 && node.clientHeight > 200 && node.scrollHeight > maxScroll) {
                maxScroll = node.scrollHeight;
                best = node;
            }
        }
        return best;
    }

    /**********************************************
     * AUTOSCROLL
     **********************************************/
    async function fastScroll(scrollEl) {
        let lastHeight = scrollEl.scrollHeight;
        let stable = 0;

        while (stable < MAX_STABLE) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
            await sleep(SCROLL_INTERVAL);

            const newHeight = scrollEl.scrollHeight;
            if (newHeight === lastHeight) {
                stable++;
                await sleep(LOAD_WAIT);
            } else {
                stable = 0;
                lastHeight = newHeight;
            }
        }
    }

    /**********************************************
     * HEAT COLOR FOR METRICS
     **********************************************/
    function reactionHeatColor(value, max) {
        if (max === 0) return "rgba(0,0,0,0.05)";
        const pct = value / max;

        if (pct >= 0.8) return "rgba(255,60,0,0.35)";
        if (pct >= 0.6) return "rgba(255,120,0,0.35)";
        if (pct >= 0.4) return "rgba(255,200,0,0.35)";
        if (pct >= 0.2) return "rgba(0,200,0,0.25)";
        return "rgba(0,120,255,0.25)";
    }

    /**********************************************
     * GLOW + BUTTON + PANEL + SIDEBAR CSS
     **********************************************/
    function injectGlowCSS() {
        if (document.getElementById("welderGlowCSS")) return;

        const css = `
            @keyframes glowPulse {
                0% { box-shadow: 0 0 0 var(--primary); }
                50% { box-shadow: 0 0 22px var(--primary); }
                100% { box-shadow: 0 0 0 var(--primary); }
            }
            .glow-highlight {
                outline: 4px solid var(--primary) !important;
                border-radius: 8px;
                animation: glowPulse 1.3s infinite ease-in-out;
            }

            #welderToolkitBtn {
                transform: scale(0.45) rotate(0deg);
                transition: transform .25s cubic-bezier(.175,.885,.32,1.275);
            }
            #welderToolkitBtn.magnetic-grow {
                transform: scale(1) rotate(0deg);
            }
            #welderToolkitBtn.open {
                transform: scale(1) rotate(90deg);
            }

            #welderToolkitPanel {
                opacity: 0;
                transform: translateY(8px);
                pointer-events: none;
                transition: opacity .2s ease, transform .2s ease;
            }
            #welderToolkitPanel.open {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            .tk-action, .tk-util, .tk-scan {
                width: 100%;
                margin-top: 4px;
                padding: 6px 8px;
                border-radius: 6px;
                background: var(--primary);
                color:white;
                border:none;
                cursor:pointer;
                font-size: 13px;
                text-align:left;
                transition: background .15s, transform .1s, box-shadow .15s;
            }
            .tk-action:hover, .tk-util:hover, .tk-scan:hover {
                background: var(--primary);
                box-shadow: inset 0 0 0 9999px rgba(0,0,0,0.2);
                transform: translateY(-1px);
                box-shadow:0 1px 4px rgba(0,0,0,0.18);
            }

            .small-label {
                font-size: 12px;
                opacity: 0.7;
            }

            /* FLOATING TOOLS SIDEBAR (LEFT OF PANEL) */
            #welderToolsSidebar {
                position: fixed;
                bottom: 80px;
                right: 20px;
                margin-right: 272px; /* panel width (260) + gap (12) */
                width: 220px;
                max-height: 70vh;
                background: #ffffff;
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                font-family: sans-serif;
                z-index: 999999998;
                overflow: hidden;
                display: none; /* shown after first scan */
                opacity: 0;
                pointer-events: none;
                transform: translateX(8px);
                transition: opacity .2s ease, transform .2s ease, width .2s ease;
            }

            #welderToolsSidebar.visible {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(0);
            }

            #welderToolsSidebarHeader {
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding:8px 10px;
                border-bottom:1px solid rgba(0,0,0,0.06);
                background:rgba(0,0,0,0.02);
                cursor:pointer;
            }

            #welderToolsSidebarTitle {
                font-weight:600;
                font-size:13px;
            }

            #welderToolsSidebarToggle {
                font-size:11px;
                opacity:0.7;
                transition: transform .2s ease;
            }

            #welderToolsSidebarContent {
                padding:8px 10px 10px;
                display:flex;
                flex-direction:column;
                gap:4px;
            }

            #welderToolsSidebar.collapsed {
                width: 48px;
            }

            #welderToolsSidebar.collapsed #welderToolsSidebarContent {
                display:none;
            }

            #welderToolsSidebar.collapsed #welderToolsSidebarTitle {
                font-size:12px;
                text-align:center;
                width:100%;
            }

            #welderToolsSidebar.collapsed #welderToolsSidebarToggle {
                transform: rotate(180deg);
            }

            /* TOOL OUTPUT WINDOW */
            #welderToolWindow {
                position: fixed;
                top: 120px;
                left: calc(50% - 180px); /* centered-ish; draggable afterwards */
                width: 360px;
                max-height: 70vh;
                overflow-y: auto;
                background: #ffffff;
                border: 1px solid rgba(0,0,0,0.15);
                border-radius: 8px;
                padding: 12px;
                font-family: sans-serif;
                z-index: 999999999;
                display: none;
                box-shadow: 0 4px 14px rgba(0,0,0,0.12);
            }
        `;
        const style = document.createElement("style");
        style.id = "welderGlowCSS";
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**********************************************
     * COLLECT POSTS
     **********************************************/
    function collectPosts() {
        const anchors = [...document.querySelectorAll("div[id^='message-'].anchor-scroll")];

        return anchors
            .map(anchor => {
                const root = anchor.nextElementSibling;
                if (!root) return null;

                // Generic metric reader (views etc.)
                const getVal = selector => {
                    const icon = root.querySelector(selector);
                    if (!icon) return 0;
                    const txt = icon.parentElement.textContent.trim();
                    const match = txt.match(/\d+/);
                    return match ? parseInt(match[0], 10) : 0;
                };

                // Reactions: from footer stats comment icon
                let reactions = 0;
                const reactionsIcon = root.querySelector(".message-footer-stats span i.fa-comment");
                if (reactionsIcon && reactionsIcon.parentElement) {
                    const txt = reactionsIcon.parentElement.textContent.trim();
                    const match = txt.match(/\d+/);
                    reactions = match ? parseInt(match[0], 10) : 0;
                }

                /******** AUTHOR: user OR company ********/
                let author = null;

                // User account (profile link)
                const userEl = root.querySelector("a[ui-sref^='user-view'][href^='/v2/user/']");
                if (userEl) {
                    author = userEl.textContent.trim();
                }

                // Company account (ML title)
                if (!author) {
                    const companyEl = root.querySelector("ml[value$='company_account.t_title'] span");
                    if (companyEl) {
                        author = companyEl.textContent.trim();
                    }
                }

                if (!author) author = "Unknown";

                /******** PINNED DETECTION ********/
                const pinnedIcon = root.querySelector("img.message-pin");
                const pinned = !!pinnedIcon;

                /******** LIKES ********/
                let likes = 0;
                const likesSpan =
                    root.querySelector('span[tooltip-enable="$ctrl.numberOfLikes"]') ||
                    anchor.parentElement.querySelector('span[tooltip-enable="$ctrl.numberOfLikes"]');

                if (likesSpan) {
                    const txt = likesSpan.textContent.trim();
                    const match = txt.match(/\d+/);
                    likes = match ? parseInt(match[0], 10) : 0;
                }

                /******** VIEWS ********/
                const views = getVal(".fa-eye");

                /******** ENGAGEMENT SCORE ********/
                const engagement = likes * 2 + reactions * 3 + views * 0.1;

                return {
                    id: anchor.id,
                    likes,
                    views,
                    reactions,
                    engagement,
                    author,
                    pinned,
                    el: root
                };
            })
            .filter(Boolean);
    }

    /**********************************************
     * CSV EXPORT
     **********************************************/
    function exportCSV() {
        if (!lastPosts || !lastPosts.length) {
            showStatus("Scan timeline first to load posts", 3000);
            return;
        }

        const headers = [
            "id",
            "author",
            "likes",
            "views",
            "reactions",
            "engagement",
            "pinned"
        ];
        const rows = lastPosts.map(p =>
            [
                `"${p.id}"`,
                `"${p.author.replace(/"/g, '""')}"`,
                p.likes,
                p.views,
                p.reactions,
                p.engagement.toFixed(2),
                p.pinned ? "yes" : "no"
            ].join(",")
        );

        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "welder-posts.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showStatus("Exported CSV (welder-posts.csv)", 3000);
    }

    /**********************************************
     * ENGAGEMENT GRAPH (returns DOM node)
     **********************************************/
    function buildEngagementGraphNode() {
        const container = document.createElement("div");

        if (!lastPosts || !lastPosts.length) {
            container.textContent = "Scan timeline first to show engagement graph.";
            container.style.fontSize = "12px";
            container.style.opacity = "0.7";
            return container;
        }

        container.innerHTML = `
            <div style="font-weight:bold;margin-bottom:4px;">Engagement over timeline</div>
        `;

        const max = Math.max(...lastPosts.map(p => p.engagement)) || 1;

        lastPosts.forEach((p, i) => {
            const row = document.createElement("div");
            row.style.cssText = `
                display:flex;
                align-items:center;
                margin-bottom:3px;
                font-size:11px;
            `;
            const label = document.createElement("span");
            label.textContent = `#${i + 1}`;
            label.style.cssText = `width:28px;`;

            const barWrap = document.createElement("div");
            barWrap.style.cssText = `
                flex:1;
                background: rgba(0,0,0,0.05);
                border-radius:4px;
                overflow:hidden;
                margin-left:4px;
            `;

            const bar = document.createElement("div");
            const widthPct = (p.engagement / max) * 100;
            bar.style.cssText = `
                height:8px;
                width:${widthPct}%;
                background: var(--primary);
            `;
            barWrap.appendChild(bar);
            row.appendChild(label);
            row.appendChild(barWrap);
            container.appendChild(row);
        });

        return container;
    }

    /**********************************************
     * PINNED POSTS LIST (returns DOM node)
     **********************************************/
    function buildPinnedListNode() {
        const container = document.createElement("div");

        if (!lastPosts || !lastPosts.length) {
            container.textContent = "Scan timeline first to show pinned posts.";
            container.style.fontSize = "12px";
            container.style.opacity = "0.7";
            return container;
        }

        const pinned = lastPosts.filter(p => p.pinned);

        const title = document.createElement("div");
        title.style.fontWeight = "bold";
        title.textContent = `Pinned posts (${pinned.length})`;
        container.appendChild(title);

        if (!pinned.length) {
            const none = document.createElement("div");
            none.textContent = "No pinned posts detected.";
            none.style.fontSize = "12px";
            none.style.opacity = "0.7";
            container.appendChild(none);
            return container;
        }

        pinned.forEach(p => {
            const row = document.createElement("div");
            row.style.cssText = `
                margin-top:4px;
                padding:4px 6px;
                border-radius:6px;
                background:rgba(255,215,0,0.25);
                cursor:pointer;
                font-size:12px;
            `;
            row.textContent = `${p.id} — ${p.author}`;
            row.onclick = () => {
                p.el.classList.add("glow-highlight");
                p.el.scrollIntoView({ behavior:"smooth", block:"center" });
                showStatus(`Jumped to pinned post ${p.id}`, 3000);
                setTimeout(() => p.el.classList.remove("glow-highlight"), 2000);
            };
            container.appendChild(row);
        });

        return container;
    }

    /**********************************************
     * ACTIVE ACCOUNT LEADERBOARD (returns DOM node)
     **********************************************/
    function buildLeadersNode() {
        const container = document.createElement("div");

        if (!lastPosts || !lastPosts.length) {
            container.textContent = "Scan timeline first to show leaderboard.";
            container.style.fontSize = "12px";
            container.style.opacity = "0.7";
            return container;
        }

        const map = new Map();
        lastPosts.forEach(p => {
            const key = p.author || "Unknown";
            if (!map.has(key)) {
                map.set(key, { author: key, posts: 0, engagement: 0 });
            }
            const entry = map.get(key);
            entry.posts += 1;
            entry.engagement += p.engagement;
        });

        const leaders = [...map.values()]
            .sort((a, b) => b.posts - a.posts || b.engagement - a.engagement)
            .slice(0, 5);

        const title = document.createElement("div");
        title.style.fontWeight = "bold";
        title.textContent = "Most active accounts";
        container.appendChild(title);

        leaders.forEach((user, i) => {
            const row = document.createElement("div");
            row.style.cssText = `
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:4px 6px;
                border-radius:6px;
                background:rgba(0,0,0,0.04);
                margin-top:4px;
                font-size:12px;
            `;
            row.innerHTML = `
                <span>#${i + 1} ${user.author}</span>
                <span>${user.posts} posts</span>
            `;
            container.appendChild(row);
        });

        return container;
    }

    /**********************************************
     * SCAN TIMELINE (STEP 1)
     **********************************************/
    async function scanTimeline() {
        showStatus("Scanning timeline…");

        const scrollEl = getScrollContainer();
        await fastScroll(scrollEl);
        injectGlowCSS();

        const posts = collectPosts();
        if (!posts.length) {
            showStatus("No posts found", 3000);
            return;
        }
        lastPosts = posts;
        timelineScanned = true;

        const metricsContainer = document.getElementById("postFinderMetrics");
        if (metricsContainer) {
            metricsContainer.style.display = "block";
        }

        // Show sidebar after first successful scan
        const sidebar = document.getElementById("welderToolsSidebar");
        if (sidebar) {
            sidebar.style.display = "block";
            sidebar.classList.add("visible");
        }

        // Rename Scan button to Rescan
        const scanBtn = document.getElementById("scanTimelineBtn");
        if (scanBtn) {
            scanBtn.textContent = "Rescan timeline";
        }

        showStatus(`Scan complete: found ${posts.length} posts. Now choose a metric or open Tools.`, 4000);
    }

    /**********************************************
     * SHOW TOP BY METRIC (STEP 2)
     **********************************************/
    function showTop(type) {
        if (!lastPosts || !lastPosts.length) {
            showStatus("Scan timeline first", 3000);
            return;
        }

        const posts = lastPosts;

        // Determine label + metric field
        const metricLabel = {
            likes: "likes",
            views: "views",
            reactions: "reactions",
            engagement: "engagement score"
        };
        const field = type === "engagement" ? "engagement" : type;

        /************* BUILD TOP 5 BY SELECTED METRIC *************/
        const top5 = [...posts].sort((a, b) => b[field] - a[field]).slice(0, 5);
        const maxVal = top5[0][field];

        const wrapper = document.getElementById("top5Wrapper");
        const list = document.getElementById("top5Reactions");
        if (!wrapper || !list) return;

        wrapper.style.display = "block";
        wrapper.querySelector(".top5title").textContent = `Top 5 by ${metricLabel[type] || field}`;
        list.innerHTML = "";

        top5.forEach((p, i) => {
            const row = document.createElement("div");
            row.style.cssText = `
                padding: 6px 8px;
                border-radius: 6px;
                background:${reactionHeatColor(p[field], maxVal)};
                display:flex;
                justify-content:space-between;
                cursor:pointer;
                font-size:12px;
            `;
            row.innerHTML = `
                <span>#${i + 1}</span>
                <span style="font-weight:bold;">${p[field]}</span>
            `;
            row.onclick = () => {
                p.el.classList.add("glow-highlight");
                p.el.scrollIntoView({ behavior:"smooth", block:"center" });
                showStatus(`Jumped to #${i + 1} (${metricLabel[type] || field} = ${p[field]})`, 3000);
                setTimeout(() => p.el.classList.remove("glow-highlight"), 2000);
            };
            list.appendChild(row);
        });

        /************* SINGLE WINNER *************/
        const winner = posts.reduce((a, b) => (b[field] > a[field] ? b : a));
        winner.el.classList.add("glow-highlight");
        winner.el.scrollIntoView({ behavior: "smooth", block: "center" });

        showStatus(
            `Top post → ❤️${winner.likes}  👁️${winner.views}  💬${winner.reactions}  ⚡${winner.engagement.toFixed(1)}`,
            4000
        );
        setTimeout(() => winner.el.classList.remove("glow-highlight"), 2000);
    }

    /**********************************************
     * TOOLKIT UI (FLOATING PANEL + SIDEBAR + TOOL WINDOW)
     **********************************************/
    function createToolkit() {
        injectGlowCSS();

        let open = false;

        /******** FLOATING BUTTON ********/
        const btn = document.createElement("div");
        btn.id = "welderToolkitBtn";
        btn.innerHTML = "⚙️";
        btn.style.cssText = `
            position:fixed;
            bottom:20px;
            right:20px;
            width:50px;
            height:50px;
            background:var(--primary);
            color:white;
            font-size:28px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            cursor:pointer;
            z-index:999999999;
        `;
        document.body.appendChild(btn);

        /******** PANEL (POST FINDER) ********/
        const panel = document.createElement("div");
        panel.id = "welderToolkitPanel";
        panel.style.cssText = `
            position:fixed;
            bottom:80px;
            right:20px;
            width:260px;
            background:white;
            border: 1px solid rgba(0, 0, 0, 0.1);
            padding:12px;
            border-radius:8px;
            font-family:sans-serif;
            z-index:999999999;
        `;
        panel.innerHTML = `
            <div style="font-weight:bold;display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                <img src="https://app.welder.nl/company/logo.svg" style="height:22px;">
                <span>Toolkit</span>
            </div>

            <div style="font-weight:bold;margin-top:6px;">Post Finder</div>
            <div class="small-label" style="margin-top:2px;margin-bottom:4px;">
                Scan the timeline, then choose what to highlight.
            </div>
            <button class="tk-scan" id="scanTimelineBtn">Scan timeline</button>

            <div id="postFinderMetrics" style="display:none;margin-top:6px;">
                <div class="small-label" style="margin-bottom:4px;">Show top posts by:</div>
                <button class="tk-action" data-type="likes">Most Likes</button>
                <button class="tk-action" data-type="views">Most Views</button>
                <button class="tk-action" data-type="reactions">Most Reactions</button>
                <button class="tk-action" data-type="engagement">Best Engagement Score</button>
            </div>

            <div id="top5Wrapper" style="display:none;margin-top:10px;">
                <div class="top5title" style="font-weight:bold;"></div>
                <div id="top5Reactions" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;"></div>
            </div>

            <hr style="margin:12px 0;">
            <div class="small-label">v0.1 — Enrico Rijken</div>
        `;
        document.body.appendChild(panel);

        /******** FLOATING TOOLS SIDEBAR (INIT HIDDEN) ********/
        const sidebar = document.createElement("div");
        sidebar.id = "welderToolsSidebar";
        sidebar.classList.add("collapsed"); // start collapsed when first shown
        sidebar.innerHTML = `
            <div id="welderToolsSidebarHeader">
                <span id="welderToolsSidebarTitle">🛠️</span>
                <span id="welderToolsSidebarToggle">⮜</span>
            </div>
            <div id="welderToolsSidebarContent">
                <div class="small-label" style="margin-bottom:4px;">Powered by last scan</div>
                <button class="tk-util" data-util="export">Export CSV</button>
                <button class="tk-util" data-util="graph">Engagement Graph</button>
                <button class="tk-util" data-util="pinned">Pinned Posts</button>
                <button class="tk-util" data-util="leaders">Active Accounts</button>
            </div>
        `;
        document.body.appendChild(sidebar);

        /******** TOOL OUTPUT WINDOW ********/
        const toolWindow = document.createElement("div");
        toolWindow.id = "welderToolWindow";
        toolWindow.innerHTML = `
            <div class="draggable-header"
                style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:move;">
                <span style="font-weight:bold;">Tool Output</span>
                <button id="closeToolWindow"
                    style="
                        background:none;
                        border:none;
                        font-size:18px;
                        cursor:pointer;
                        line-height:1;
                    ">✖</button>
            </div>
            <div id="toolWindowContent" style="margin-top:4px;"></div>
        `;
        document.body.appendChild(toolWindow);

        makeDraggable(toolWindow);

        const toolWindowContent = toolWindow.querySelector("#toolWindowContent");
        const closeToolWindowBtn = toolWindow.querySelector("#closeToolWindow");
        closeToolWindowBtn.onclick = () => {
            toolWindow.style.display = "none";
        };

        /******** MAGNETIC ********/
        document.addEventListener("mousemove", e => {
            if (open) return;
            const r = btn.getBoundingClientRect();
            const dist = Math.hypot(
                e.clientX - (r.left + r.width / 2),
                e.clientY - (r.top + r.height / 2)
            );
            if (dist < 40) btn.classList.add("magnetic-grow");
            else btn.classList.remove("magnetic-grow");
        });

        /******** BUTTON TOGGLE (COG ↔ X + ROTATE + PASSCODE) ********/
        btn.onclick = () => {

            // 🔒 PASSCODE REQUIRED ON FIRST OPEN (ONCE PER PAGE LOAD)
            if (!toolkitUnlocked) {
                const code = prompt("Enter toolkit passcode:");
                if (code !== "0309") {
                    showStatus("Incorrect passcode", 2000);
                    return;
                }
                toolkitUnlocked = true;
                showStatus("Toolkit unlocked", 1500);
            }

            open = !open;

            const titleEl = sidebar?.querySelector("#welderToolsSidebarTitle");

            if (open) {
                // OPEN MAIN TOOLKIT
                btn.innerHTML = "✖️";
                btn.classList.add("open");
                panel.classList.add("open");

                // If timeline was previously scanned → show tools sidebar again
                if (timelineScanned) {
                    sidebar.style.display = "block";
                    sidebar.classList.add("visible");
                    sidebar.classList.add("collapsed"); // always reopen collapsed
                    if (titleEl) titleEl.textContent = "🛠️"; // collapsed icon
                }

            } else {
                // CLOSE MAIN TOOLKIT
                btn.innerHTML = "⚙️";
                btn.classList.remove("open");
                panel.classList.remove("open");

                // Hide tools sidebar (but do NOT delete it)
                sidebar.classList.remove("visible");
                sidebar.classList.add("collapsed");
                if (titleEl) titleEl.textContent = "🛠️";

                // Also hide tool window when closing main panel
                toolWindow.style.display = "none";
            }
        };

        /******** POST FINDER STEP 1: SCAN ********/
        const scanBtn = panel.querySelector("#scanTimelineBtn");
        scanBtn.onclick = () => {
            scanTimeline();
        };

        /******** POST FINDER STEP 2: METRIC BUTTONS ********/
        panel.querySelectorAll(".tk-action").forEach(el => {
            el.onclick = () => showTop(el.dataset.type);
        });

        /******** TOOL ACTIONS (SIDEBAR → TOOL WINDOW) ********/
        sidebar.querySelectorAll(".tk-util").forEach(el => {
            el.onclick = () => {
                const action = el.dataset.util;

                if (action === "export") {
                    exportCSV();
                    return;
                }

                // For visual tools, open window
                toolWindowContent.innerHTML = "";
                toolWindow.style.display = "block";

                if (action === "graph") {
                    toolWindowContent.appendChild(buildEngagementGraphNode());
                } else if (action === "pinned") {
                    toolWindowContent.appendChild(buildPinnedListNode());
                } else if (action === "leaders") {
                    toolWindowContent.appendChild(buildLeadersNode());
                }
            };
        });

        /******** COLLAPSIBLE SIDEBAR BEHAVIOR ********/
        const sbHeader = sidebar.querySelector("#welderToolsSidebarHeader");

        const toggleSidebar = () => {
            const isCollapsed = sidebar.classList.contains("collapsed");
            if (isCollapsed) {
                sidebar.classList.remove("collapsed");
            } else {
                sidebar.classList.add("collapsed");
            }
        };

        sbHeader.onclick = toggleSidebar;
    }

    /**********************************************
     * INIT ON PAGE LOAD
     **********************************************/
    window.addEventListener("load", () => {
        if (location.pathname.startsWith("/v2/mycompany")) {
            setTimeout(createToolkit, 800);
        }
    });

    /**********************************************
     * SPA URL CHANGE LISTENER — only run toolkit on /v2/mycompany
     **********************************************/
    function monitorSPA() {
        let lastUrl = location.href;

        function onUrlChange() {
            if (location.href === lastUrl) return;
            lastUrl = location.href;

            const isMyCompany = /^\/v\d+\/mycompany$/.test(location.pathname);

            if (isMyCompany) {
                if (!document.getElementById("welderToolkitBtn")) {
                    console.log("Initializing Toolkit on", location.pathname);
                    setTimeout(createToolkit, 600);
                }
            } else {
                if (document.getElementById("welderToolkitBtn")) {
                    console.log("Leaving mycompany → destroying toolkit");
                    destroyToolkit();
                }
            }
        }

        // Patch SPA routing
        const push = history.pushState;
        history.pushState = function () {
            push.apply(this, arguments);
            onUrlChange();
        };

        const replace = history.replaceState;
        history.replaceState = function () {
            replace.apply(this, arguments);
            onUrlChange();
        };

        window.addEventListener("popstate", onUrlChange);

        // Fallback checker (SPAs sometimes don't fire the events)
        setInterval(onUrlChange, 400);
    }

    monitorSPA();
})();
