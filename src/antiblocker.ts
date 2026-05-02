/**
 * MOVIEVERSE Anti-Annoyance Shield v2.1 (Anti-Redirection)
 */

(() => {
    'use strict';

    // List of aggressive redirect domains
    const blockedRedirects = [
        'shein.com', 'aliexpress.com', 'youtube.com', 'youtu.be', 
        'app.link', 'adjust.com', 'singular.net', 'branch.io'
    ];

    function injectCSS() {
        const ANNOYANCE_CSS = `
            #cookie-banner, #cookie-consent, #cookie-notice, .cookie-banner, .cookie-consent,
            .newsletter-popup, .subscribe-popup, .push-notification, .app-banner,
            .video-ad-overlay, .player-ad, [class*="vast-"], [class*="preroll"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;
        const style = document.createElement('style');
        style.id = 'mv-shield-css';
        style.textContent = ANNOYANCE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ===== 1. POPUP BLOCKING =====
    const originalOpen = window.open;
    window.open = function (...args: any[]) {
        const url = args[0]?.toString() || '';
        if (url && !url.startsWith(window.location.origin) && !url.startsWith('about:')) {
            console.log('[Shield] Popup bloqué:', url);
            return null;
        }
        return originalOpen.apply(this, args as any);
    };

    // ===== 2. REDIRECTION BLOCKING (Mobile focus) =====
    const originalHref = window.location.href;
    
    // Intercept beforeunload to detect quick exits
    window.addEventListener('beforeunload', (event) => {
        // If we are being redirected to a known bad domain, try to stop it
        console.log('[Shield] Tentative de quitter la page détectée');
        // On modern mobile browsers, we can't truly "block" navigation without user confirmation
        // but we can try to warn the user or log it.
    }, true);

    // Prevent navigation to bad domains via location.assign/replace
    const originalAssign = window.location.assign;
    window.location.assign = function(url: string) {
        if (blockedRedirects.some(d => url.includes(d))) {
            console.log('[Shield] Navigation bloquée vers:', url);
            return;
        }
        return originalAssign.apply(window.location, [url]);
    };

    const originalReplace = window.location.replace;
    window.location.replace = function(url: string) {
        if (blockedRedirects.some(d => url.includes(d))) {
            console.log('[Shield] Remplacement de page bloqué vers:', url);
            return;
        }
        return originalReplace.apply(window.location, [url]);
    };

    // Attempt to lock location.href (highly experimental, might break some things)
    try {
        const desc = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href');
        if (desc && desc.set) {
            const originalSet = desc.set;
            Object.defineProperty(window.location, 'href', {
                set: function(url) {
                    if (typeof url === 'string' && blockedRedirects.some(d => url.includes(d))) {
                        console.log('[Shield] Tentative de changement d\'URL bloquée:', url);
                        return;
                    }
                    return originalSet.apply(window.location, [url]);
                },
                configurable: true
            });
        }
    } catch (e) {
        // Fallback or fail silently if browser doesn't allow it
    }

    // ===== 3. PREVENT HISTORY MANIPULATION =====
    const originalPushState = history.pushState;
    history.pushState = function(...args: any[]) {
        if (args[2] && typeof args[2] === 'string' && blockedRedirects.some(d => args[2].includes(d))) {
            return;
        }
        return originalPushState.apply(history, args as any);
    };

    function init() {
        injectCSS();
        console.log('%c[Shield] Actif (Protection Redirection Mobile)', 'color: #4ade80; font-weight: bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
