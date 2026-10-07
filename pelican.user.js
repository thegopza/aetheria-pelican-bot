// ==UserScript==
// @name         Aetheria Online - Pelican Bot (Auto-Update)
// @namespace    https://github.com/thegopza/aetheria-pelican-bot
// @version      2.1.0
// @description  Auto-farming, Auto-Sell, Smart Ammo Restock, and Packet Inspector for Aetheria Online
// @author       Pelican
// @match        https://www.aetheria-online.in.th/play*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aetheria-online.in.th
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      cdnjs.cloudflare.com
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/pelican.user.js
// @downloadURL  https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/pelican.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Pelican Loader] 🚀 Tampermonkey Auto-Loader active! Preparing injection...');

    // 1. Ensure msgpack-lite is loaded first
    function ensureMsgpack(callback) {
        if (window.msgpack) {
            callback();
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js';
        s.onload = () => {
            console.log('[Pelican Loader] 📦 Loaded msgpack-lite CDN');
            callback();
        };
        s.onerror = () => {
            console.warn('[Pelican Loader] ⚠️ Failed to load msgpack CDN, continuing...');
            callback();
        };
        (document.head || document.documentElement).appendChild(s);
    }

    // 2. Fetch and inject the latest bot.js directly from GitHub
    const GITHUB_URL = 'https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/bot.js?t=' + Date.now();

    ensureMsgpack(() => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: GITHUB_URL,
            nocache: true,
            onload: function(response) {
                if (response.status === 200 && response.responseText && response.responseText.length > 1000) {
                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.textContent = response.responseText;
                    (document.head || document.documentElement).appendChild(script);
                    console.log('%c[Pelican Loader] ✅ Injected latest Pelican Bot from GitHub successfully! (' + response.responseText.length + ' bytes)', 'color: #22c55e; font-weight: bold;');
                } else {
                    console.error('[Pelican Loader] ❌ Failed to fetch bot.js from GitHub. Status:', response.status);
                }
            },
            onerror: function(err) {
                console.error('[Pelican Loader] ❌ Network error while fetching bot.js:', err);
            }
        });
    });
})();
