import whitelist from './whitelist.json';

/**
 * MOVIEVERSE Anti-Annoyance Shield v2.4 (Robust Protection & Performance)
 * Optimized for early execution and minimum overhead.
 */

(() => {
    'use strict';

    // 1. EARLY CSS INJECTION (Avoid FOUC)
    const ANNOYANCE_CSS = `
        #cookie-banner, #cookie-consent, #cookie-notice, .cookie-banner, .cookie-consent,
        .newsletter-popup, .subscribe-popup, .push-notification, .app-banner,
        .video-ad-overlay, .player-ad, [class*="vast-"], [class*="preroll"],
        .mgid-widget, .taboola-ad, .outbrain-ad {
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

    // List of aggressive redirect domains (to be blocked)
    const blockedRedirects = [
        'shein.com', 'aliexpress.com', 'app.link', 'adjust.com', 
        'singular.net', 'branch.io', 'onclickads.net', 'popads.net',
        'propellerads.com', 'adsterra.com', 'exoclick.com'
    ];

    // Common ad-script patterns
    const blockedScriptPatterns = [
        'vast-client', 'prebid', 'ad-delivery', 'doubleclick', 'adnxs',
        'popads', 'onclickads', 'propellerads', 'adsterra'
    ];

    // Whitelist of trusted domains (loaded from JSON)
    const trustedDomains = whitelist;

    /**
     * Checks if a URL belongs to a trusted domain
     */
    function isTrusted(url: string): boolean {
        if (!url) return false;
        try {
            const parsedUrl = new URL(url.startsWith('//') ? window.location.protocol + url : url);
            const hostname = parsedUrl.hostname;
            return trustedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
        } catch (e) {
            return trustedDomains.some(domain => url.includes(domain));
        }
    }

    /**
     * Checks if a script URL should be blocked
     */
    function isBlockedScript(url: string): boolean {
        if (!url || isTrusted(url)) return false;
        return blockedScriptPatterns.some(pattern => url.toLowerCase().includes(pattern));
    }

    // ===== 1. POPUP BLOCKING =====
    const originalOpen = window.open;
    window.open = function (...args: any[]) {
        const url = args[0]?.toString() || '';
        if (!url || url.startsWith(window.location.origin) || url.startsWith('about:') || isTrusted(url)) {
            try {
                return originalOpen.apply(this, args as any);
            } catch (e) {
                return null;
            }
        }
        console.log('[Shield] Popup bloqué:', url);
        return null;
    };

    // ===== 2. REDIRECTION BLOCKING =====
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href) {
            const href = anchor.href;
            if (blockedRedirects.some(d => href.includes(d)) && !isTrusted(href)) {
                console.log('[Shield] Clic vers domaine bloqué empêché:', href);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
    }, true);

    // ===== 3. SCRIPT BLOCKING (Monkey Patching) =====
    const originalCreateElement = document.createElement;
    document.createElement = function (tagName: string, options?: ElementCreationOptions) {
        const element = originalCreateElement.call(document, tagName, options);
        if (tagName.toLowerCase() === 'script') {
            const script = element as HTMLScriptElement;
            
            // Override src property
            const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            Object.defineProperty(script, 'src', {
                set: function(value) {
                    if (isBlockedScript(value)) {
                        console.log('[Shield] Script bloqué:', value);
                        return;
                    }
                    if (originalDescriptor && originalDescriptor.set) {
                        originalDescriptor.set.call(this, value);
                    }
                },
                get: function() {
                    return originalDescriptor && originalDescriptor.get ? originalDescriptor.get.call(this) : '';
                }
            });
        }
        return element;
    };

    // ===== 4. IFRAME PROTECTION =====
    function protectTrustedIframes() {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            if (isTrusted(iframe.src)) {
                iframe.style.setProperty('display', 'block', 'important');
                iframe.style.setProperty('visibility', 'visible', 'important');
                iframe.style.setProperty('opacity', '1', 'important');
            }
        });
    }

    // Safety for History API
    try {
        const originalPushState = history.pushState;
        history.pushState = function(...args: any[]) {
            const url = args[2] && typeof args[2] === 'string' ? args[2] : '';
            if (url && blockedRedirects.some(d => url.includes(d)) && !isTrusted(url)) {
                console.log('[Shield] History pushState bloqué');
                return;
            }
            return originalPushState.apply(history, args as any);
        };
    } catch (e) {}

    function init() {
        setInterval(protectTrustedIframes, 2000);
        console.log('%c[Shield] v2.4 Actif - Protection optimisée', 'color: #4ade80; font-weight: bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


