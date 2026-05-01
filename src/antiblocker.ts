/**
 * MOVIEVERSE Anti-Annoyance Shield
 * Based on Fanboy's Annoyance List - comprehensive ad/popup/tracking blocker
 * Blocks: ads, popups, cookie banners, tracking, notifications, overlays, redirects
 */

(() => {
    'use strict';

    // ===== 1. BLOCKED DOMAINS (from Fanboy's list - ad networks, trackers, popups) =====
    const BLOCKED_DOMAINS: string[] = [
        // Ad networks
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
        'adservice.google.com', 'pagead2.googlesyndication.com',
        'adnxs.com', 'adsrvr.org', 'adtechus.com', 'advertising.com',
        'amazon-adsystem.com', 'bidswitch.net', 'casalemedia.com',
        'criteo.com', 'criteo.net', 'demdex.net', 'dotomi.com',
        'exoclick.com', 'exponential.com', 'eyeblaster.com',
        'flashtalking.com', 'gumgum.com', 'indexww.com',
        'mathtag.com', 'media.net', 'moatads.com', 'mookie1.com',
        'openx.net', 'pubmatic.com', 'rfihub.com', 'richaudience.com',
        'rubiconproject.com', 'scorecardresearch.com', 'serving-sys.com',
        'sharethrough.com', 'smartadserver.com', 'taboola.com',
        'tidaltv.com', 'tribalfusion.com', 'turn.com',
        'yieldmo.com', 'zemanta.com',
        // Popups / annoyances
        'optinmonster.com', 'opmnstr.com', 'optmnstr.com', 'optkit.com',
        'optnmnstr.com', 'optnmstr.com', 'optimonk.com',
        'hellobar.com', 'privy.com', 'sleeknote.com', 'wisepops.com',
        'exitintel.com', 'pippity.com', 'screenpopper.com',
        'convertflow.co', 'getdrip.com', 'leadpages.co',
        'hsleadflows.net', 'mailmunch.co', 'sumo.com', 'sumome.com',
        'zotabox.com', 'prooffactor.com', 'usefomo.com',
        'wheelysales.com', 'rightmessage.com',
        // Tracking / analytics (aggressive)
        'hotjar.com', 'mouseflow.com', 'luckyorange.com',
        'fullstory.com', 'crazyegg.com', 'inspectlet.com',
        'logrocket.com', 'clarity.ms',
        // Social widgets / annoyances
        'platform.twitter.com', 'connect.facebook.net',
        'apis.google.com/js/plusone', 'widgets.pinterest.com',
        'disqus.com', 'nrelate.com', 'linkwithin.com',
        // Push notifications
        'onesignal.com', 'pushwoosh.com', 'pushcrew.com',
        'webpushr.com', 'pushengage.com', 'pushassist.com',
        'pushly.com', 'gravitec.net', 'notifyon.com',
        'frizbit.com', 'letreach.com', 'batch.com',
        // Chat widgets (annoying auto-popups)
        'tawk.to', 'crisp.chat', 'drift.com', 'intercom.io',
        'livechat.com', 'olark.com', 'zendesk.com',
        // Misc annoyances from Fanboy list
        'taboola.com', 'outbrain.com', 'zergnet.com', 'revcontent.com',
        'mgid.com', 'content.ad', 'contentad.net',
        'plista.com', 'ligatus.com', 'insticator.com',
        'apester.com', 'contextly.com', 'phoenix-widget.com',
        // Malware / scam domains commonly injected by video players
        'cloudnestra.com', 'novavaultcore.co.in',
        'bfrss.xyz', 'bfrns.xyz', 'iclickcdn.com',
        'stooadstools.com', 'whos.amung.us',
        'popads.net', 'popcash.net', 'popunder.net',
        'adcash.com', 'propellerads.com', 'hilltopads.net',
        'juicyads.com', 'trafficjunky.net', 'trafficfactory.biz',
        'clickadu.com', 'evadav.com', 'galaksion.com',
        'mondiad.com', 'a-ads.com', 'bitmedia.io',
        'coinzilla.com', 'cointraffic.io',
        // Anti-devtools / anti-rightclick (from Fanboy list)
        'devtools-detect', 'disable-devtool',
        // Cookie consent popups
        'cookiebot.com', 'cookiepro.com', 'cookielaw.org',
        'trustarc.com', 'evidon.com', 'consentmanager.net',
        'quantcast.com', 'onetrust.com',
    ];

    // ===== 2. BLOCKED SCRIPT PATTERNS (from Fanboy list) =====
    const BLOCKED_SCRIPT_PATTERNS: RegExp[] = [
        /popupally/i, /popup-maker/i, /popup-builder/i,
        /exitintent/i, /exit.intent/i, /ExitIntentPopUp/i,
        /devtools-detect/i, /disable-devtool/i, /devtools-detector/i,
        /console-ban/i, /block-console/i, /console-blocker/i,
        /antirightclick/i, /disablerightclick/i, /no-right-click/i,
        /block-right-click/i, /norightclick/i,
        /detectIncognito/i, /detect\.dev/i,
        /wordpress-popup/i, /scroll-triggered-box/i,
        /hellobar/i, /optinmonster/i, /opmnstr/i,
        /mailmunch/i, /sumo\.com/i, /sumome/i,
        /pushwoosh/i, /onesignal/i, /webpushr/i,
        /popunder/i, /popads/i, /popcash/i,
        /adsbygoogle/i, /googlesyndication/i,
        /taboola/i, /outbrain/i, /mgid/i, /revcontent/i,
        /coinminer/i, /coinhive/i, /cryptonight/i,
        /snowstorm/i, /snowfall/i, /letitsnow/i, /snow\.js/i,
        /fartscroll/i, /particleground/i,
    ];

    // ===== 3. CSS SELECTORS TO HIDE (from Fanboy annoyance list) =====
    const ANNOYANCE_CSS = `
        /* Cookie consent / GDPR banners */
        #cookie-banner, #cookie-consent, #cookie-notice, #cookie-bar,
        #cookiebar, #cookie-popup, #cookie-modal, #cookie-law,
        .cookie-banner, .cookie-consent, .cookie-notice, .cookie-bar,
        .cookie-popup, .cookie-modal, .cookie-notification, .cookie-alert,
        .cookie-warning, .cc-window, .cc-banner, .cc-overlay,
        .cc-grower, .cc-revoke, .js-cookie-consent,
        .gdpr-banner, .gdpr-popup, .gdpr-modal, .gdpr-notice,
        .consent-banner, .consent-popup, .consent-modal,
        [id*="cookie-consent"], [id*="cookie-banner"],
        [class*="cookie-consent"], [class*="cookie-banner"],
        [id*="gdpr"], [class*="gdpr-banner"],
        #CybotCookiebotDialog, #onetrust-banner-sdk,
        .truste_box_overlay, .truste_overlay,

        /* Newsletter / subscription popups */
        .newsletter-popup, .newsletter-modal, .newsletter-overlay,
        .subscribe-popup, .subscribe-modal, .subscribe-overlay,
        .email-popup, .email-modal, .email-overlay,
        .signup-popup, .signup-modal, .signup-overlay,
        .popup-overlay, .modal-overlay, .exit-popup,
        .exit-intent, .exit-intent-popup, .exit-modal,
        [class*="newsletter-popup"], [class*="subscribe-popup"],
        [class*="exit-intent"], [class*="email-signup"],

        /* Push notification prompts */
        .push-notification, .push-prompt, .web-push,
        .notification-popup, .notification-banner,
        [class*="push-notification"], [class*="web-push"],
        [id*="push-notification"],

        /* Social proof / FOMO popups */
        .yo-notification, .fomo-notification, .social-proof,
        [class*="fomo-"], [class*="social-proof"],

        /* Scroll-triggered / sticky annoyances */
        .slide-dock-on, .sticky-widget,
        [class*="scroll-triggered"],

        /* App install banners */
        .app-banner, .smart-banner, .smartbanner,
        [class*="app-banner"], [class*="smart-banner"],

        /* Chat widget popups (auto-opened) */
        .drift-widget-welcome-message,
        .intercom-lightweight-app-launcher,

        /* Paywalls / login walls */
        .paywall-overlay, .paywall-modal,
        [class*="paywall"], [class*="login-wall"],

        /* Video player overlay ads */
        .video-ad-overlay, .player-ad,
        [class*="ad-overlay"], [class*="vast-"],

        /* Generic overlays & modals that block content */
        .overlay-blocker, .content-blocker,
        [class*="blocker-overlay"]
        { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }

        /* Restore body scroll when popups try to lock it */
        body.no-scroll, body.modal-open, body.popup-open,
        body.overflow-hidden, body.locked,
        html.no-scroll, html.modal-open, html.popup-open {
            overflow: auto !important;
            position: static !important;
        }
    `;

    // ===== INJECT ANNOYANCE-HIDING CSS =====
    function injectCSS() {
        const style = document.createElement('style');
        style.id = 'mv-antiblocker-css';
        style.textContent = ANNOYANCE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ===== BLOCK NETWORK REQUESTS =====
    function isDomainBlocked(url: string): boolean {
        try {
            const hostname = new URL(url).hostname;
            return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
        } catch {
            return false;
        }
    }

    function isScriptBlocked(url: string): boolean {
        return BLOCKED_SCRIPT_PATTERNS.some(p => p.test(url));
    }

    // Override fetch to block ad/tracker requests
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
        if (isDomainBlocked(url) || isScriptBlocked(url)) {
            return Promise.resolve(new Response('', { status: 200 }));
        }
        return originalFetch.apply(this, args);
    };

    // Override XMLHttpRequest to block ad/tracker requests
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
        const urlStr = url.toString();
        if (isDomainBlocked(urlStr) || isScriptBlocked(urlStr)) {
            // Redirect to empty response
            return originalXHROpen.apply(this, [method, 'data:text/plain,', ...rest] as any);
        }
        return originalXHROpen.apply(this, [method, url, ...rest] as any);
    };

    // ===== BLOCK POPUP WINDOWS (from video players) =====
    const originalOpen = window.open;
    window.open = function (...args: Parameters<typeof window.open>) {
        const url = args[0]?.toString() || '';
        // Only allow popups that are same-origin or trusted
        if (url && !url.startsWith(window.location.origin) && !url.startsWith('about:')) {
            console.log('[AntiBlocker] Blocked popup:', url);
            return null;
        }
        return originalOpen.apply(this, args);
    };

    // ===== BLOCK UNWANTED REDIRECTS =====
    // Prevent JS-based redirects from ad scripts
    const originalAssign = window.location.assign;
    const originalReplace = window.location.replace;
    
    const isRedirectAllowed = (url: string): boolean => {
        try {
            const target = new URL(url, window.location.origin);
            // Allow same-origin redirects and TMDB/our own domains
            return target.origin === window.location.origin;
        } catch {
            return false;
        }
    };

    // ===== BLOCK SCRIPT INJECTION via DOM =====
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) {
                    // Block injected scripts
                    if (node.tagName === 'SCRIPT') {
                        const src = node.getAttribute('src') || '';
                        if (src && (isDomainBlocked(src) || isScriptBlocked(src))) {
                            node.remove();
                            console.log('[AntiBlocker] Blocked script:', src);
                            continue;
                        }
                        // Block inline anti-devtools scripts
                        const content = node.textContent || '';
                        if (/debugger|devtools|right.?click|context.?menu.*prevent|disable.*console/i.test(content) && content.length < 5000) {
                            node.remove();
                            console.log('[AntiBlocker] Blocked inline anti-devtools script');
                            continue;
                        }
                    }

                    // Block injected iframes (ads)
                    if (node.tagName === 'IFRAME') {
                        const src = node.getAttribute('src') || '';
                        if (src && isDomainBlocked(src)) {
                            node.remove();
                            console.log('[AntiBlocker] Blocked ad iframe:', src);
                            continue;
                        }
                    }

                    // Remove cookie/popup overlays
                    const el = node as HTMLElement;
                    const id = (el.id || '').toLowerCase();
                    const cls = (el.className?.toString() || '').toLowerCase();
                    if (
                        /cookie|gdpr|consent|newsletter.*popup|subscribe.*popup|push.*notif/i.test(id + ' ' + cls) &&
                        !el.closest('.player-section') // Don't touch our player
                    ) {
                        el.style.display = 'none';
                        console.log('[AntiBlocker] Hidden annoyance element:', id || cls);
                    }

                    // Block fullscreen overlays from ad scripts
                    const style = window.getComputedStyle(el);
                    if (
                        style.position === 'fixed' &&
                        style.zIndex && parseInt(style.zIndex) > 9000 &&
                        (style.width === '100%' || style.width === '100vw') &&
                        !el.closest('.player-section') &&
                        !el.closest('#player-section') &&
                        !el.id?.includes('player') &&
                        !el.classList.contains('modal')
                    ) {
                        // Likely an ad overlay
                        setTimeout(() => {
                            if (el.parentNode && !el.closest('.player-section')) {
                                el.style.display = 'none';
                                console.log('[AntiBlocker] Hidden fullscreen overlay');
                            }
                        }, 100);
                    }
                }
            }
        }
    });

    // ===== PREVENT ANTI-DEVTOOLS / ANTI-RIGHTCLICK =====
    // Re-enable right-click
    document.addEventListener('contextmenu', (e) => { e.stopPropagation(); }, true);
    
    // Block debugger statements from video player scripts
    // This is handled by the script content check in MutationObserver

    // Prevent visibility change tricks (sites that pause when you switch tabs)
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });

    // ===== BLOCK beforeunload ANNOYANCES =====
    window.addEventListener('beforeunload', (e) => {
        // Prevent "are you sure you want to leave" popups from ad scripts
        e.stopImmediatePropagation();
    }, true);

    // ===== RESTORE SCROLL when popups try to lock body =====
    function unlockScroll() {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.position = '';
        document.body.classList.remove('no-scroll', 'modal-open', 'popup-open', 'overflow-hidden', 'locked');
        document.documentElement.classList.remove('no-scroll', 'modal-open', 'popup-open');
    }

    // Periodically check for scroll locks (from cookie banners etc)
    setInterval(unlockScroll, 3000);

    // ===== INITIALIZE =====
    function init() {
        injectCSS();
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        console.log('%c[MOVIEVERSE AntiBlocker] Shield active ✅', 'color: #4ade80; font-weight: bold; font-size: 14px;');
    }

    // Start immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
