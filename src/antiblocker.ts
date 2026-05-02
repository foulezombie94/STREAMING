/**
 * MOVIEVERSE Anti-Annoyance Shield v2.0 (Mobile Compatible)
 */

(() => {
    'use strict';

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

    const originalOpen = window.open;
    window.open = function (...args: any[]) {
        const url = args[0]?.toString() || '';
        if (url && !url.startsWith(window.location.origin) && !url.startsWith('about:')) {
            console.log('[Shield] Popup bloqué:', url);
            return null;
        }
        return originalOpen.apply(this, args as any);
    };

    function init() {
        injectCSS();
        console.log('%c[Shield] Actif (Mode Mobile)', 'color: #4ade80; font-weight: bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
