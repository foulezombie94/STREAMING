import blacklist from './blacklist.json';
import blockedScripts from './blocked_scripts.json';
import blockedCSS from './blocked_css.json';

(() => {
    'use strict';

    // ===== 1. CORE LISTS =====
    const blockedDomains = new Set(blacklist as string[]);
    const scriptPatterns: string[] = blockedScripts as string[];
    const whitelist = new Set([
        'player.videasy.net', 'videasy.net',
        'multiembed.mov', 'multiembed.cc',
        'moviesapi.club', 'vidfast.pro',
        'themoviedb.org', 'tmdb.org',
        'vidsrc.me', 'vidsrc.to', 'vidsrc.cc', 'vidsrc.xyz',
        'cloudflare.com', 'fastly.net', 'akamaihd.net',
        'google.com', 'gstatic.com', 'googleapis.com'
    ]);

    const extraDomains = [
        'popads.net', 'popcash.net', 'popunder.net', 'propellerads.com',
        'adcash.com', 'hilltopads.net', 'juicyads.com', 'trafficjunky.net',
        'clickadu.com', 'evadav.com', 'galaksion.com',
        'shein.com', 'aliexpress.com', 'alicdn.com',
        'doubleclick.net', 'googlesyndication.com',
        'youtube.com', 'youtu.be', 'facebook.com', 'tiktok.com'
    ];
    extraDomains.forEach(d => blockedDomains.add(d));

    // ===== 2. HELPERS =====
    function isDomainBlocked(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            if (whitelist.has(hostname)) return false;
            for (const d of whitelist) if (hostname.endsWith('.' + d)) return false;
            if (blockedDomains.has(hostname)) return true;
            const parts = hostname.split('.');
            for (let i = 1; i < parts.length - 1; i++) {
                if (blockedDomains.has(parts.slice(i).join('.'))) return true;
            }
            return false;
        } catch { return false; }
    }

    function isScriptBlocked(url: string): boolean {
        try {
            const hostname = new URL(url).hostname;
            if (whitelist.has(hostname)) return false;
        } catch {}
        const urlLower = url.toLowerCase();
        return scriptPatterns.some(p => urlLower.includes(p.toLowerCase()));
    }

    function shouldBlock(url: string): boolean {
        return isDomainBlocked(url) || isScriptBlocked(url);
    }

    function getGracefulResponse(url: string) {
        if (url.includes('.json')) return '{}';
        if (url.includes('.js')) return '/* blocked */';
        return '';
    }

    // ===== 3. NETWORK PROTECTION =====
    const originalFetch = window.fetch;
    window.fetch = function (...args: any[]) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (shouldBlock(url)) {
            return Promise.resolve(new Response(getGracefulResponse(url), { 
                status: 200, 
                headers: { 'Content-Type': url.includes('.json') ? 'application/json' : 'text/javascript' }
            }));
        }
        return originalFetch.apply(this, args as any);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
        const urlStr = url.toString();
        if (shouldBlock(urlStr)) {
            return originalXHROpen.apply(this, [method, 'data:text/plain,' + getGracefulResponse(urlStr), ...rest] as any);
        }
        return originalXHROpen.apply(this, [method, url, ...rest] as any);
    };

    // ===== 4. POPUP PROTECTION =====
    window.open = function () { return null; };
    window.alert = function () { return true; };
    window.confirm = function () { return true; };

    // Neutralize window focus/blur tricks used to open popups
    window.onblur = null;
    window.onfocus = null;

    // ===== 5. CSS SHIELD =====
    const style = document.createElement('style');
    style.textContent = `
        /* Hide all ad elements */
        [class*="popup"], [id*="popup"], .ads-layer, .overlay-ads, 
        .video-ad-overlay, .player-ad, [class*="vast-"],
        #popads, .popunder, .ad-banner, .ali-ads, .shein-ads,
        ${(blockedCSS as string[]).join(',\n        ')}
        { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }

        /* Force restore scroll */
        html, body { overflow: auto !important; position: static !important; height: auto !important; }
        
        /* Ensure player is on top */
        .iframe-wrapper { position: relative !important; z-index: 2147483647 !important; }
        #shield-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647; cursor: pointer; background: transparent; }
    `;
    document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);

    // ===== 6. DYNAMIC PROTECTION (MutationObserver) =====
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;

                // 1. Block unauthorized IFRAMEs
                if (node.tagName === 'IFRAME' && node.id !== 'video-iframe') {
                    node.remove();
                    continue;
                }

                // 2. Block ad scripts
                if (node.tagName === 'SCRIPT') {
                    const src = node.getAttribute('src') || '';
                    if (src && shouldBlock(src)) node.remove();
                    continue;
                }

                // 3. Block elements with ad classes/IDs
                const idCls = (node.id + ' ' + node.className).toLowerCase();
                if (/ad-container|ad_wrapper|overlay-ad|popup-content/i.test(idCls)) {
                    node.remove();
                }
            }
        }

        // Add Anti-Popup Overlay to player
        const wrapper = document.querySelector('.iframe-wrapper');
        if (wrapper && !document.getElementById('shield-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'shield-overlay';
            overlay.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                overlay.remove();
                console.log('[Shield] Premier clic (anti-popup) absorbé.');
            };
            wrapper.appendChild(overlay);
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Periodically clean up
    setInterval(() => {
        document.querySelectorAll('iframe:not(#video-iframe), [class*="popup"], [id*="popup"]').forEach(el => el.remove());
    }, 2000);

    console.log('%c[MOVIEVERSE Shield v3.0] ✅ Protection Active', 'color: #4ade80; font-weight: bold; font-size: 14px;');
})();
