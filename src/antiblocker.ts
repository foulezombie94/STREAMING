/**
 * MOVIEVERSE Anti-Annoyance Shield v2.0
 * Based on Fanboy's Annoyance List (28,121 rules)
 * 1,025 blocked domains via Set + 1,660 blocked script patterns
 * Blocks: ads, popups, cookie banners, tracking, notifications, overlays, redirects
 */

import blacklist from './blacklist.json';
import blockedScripts from './blocked_scripts.json';
import blockedCSS from './blocked_css.json';

(() => {
    'use strict';

    // ===== 1. DOMAIN BLOCKLIST (1,025 domains from Fanboy list) =====
    const blockedDomains: Set<string> = new Set(blacklist as string[]);

    // ===== 2. ADDITIONAL STREAMING-SPECIFIC DOMAINS =====
    const extraDomains = [
        'popads.net', 'popcash.net', 'popunder.net', 'propellerads.com',
        'adcash.com', 'hilltopads.net', 'juicyads.com', 'trafficjunky.net',
        'trafficfactory.biz', 'clickadu.com', 'evadav.com', 'galaksion.com',
        'mondiad.com', 'a-ads.com', 'bitmedia.io', 'coinzilla.com',
        'cointraffic.io', 'exoclick.com', 'adnxs.com', 'adsrvr.org',
        'adtechus.com', 'advertising.com', 'amazon-adsystem.com',
        'bidswitch.net', 'casalemedia.com', 'criteo.com', 'criteo.net',
        'demdex.net', 'dotomi.com', 'exponential.com', 'eyeblaster.com',
        'flashtalking.com', 'gumgum.com', 'indexww.com', 'mathtag.com',
        'media.net', 'moatads.com', 'mookie1.com', 'openx.net',
        'pubmatic.com', 'rfihub.com', 'richaudience.com', 'rubiconproject.com',
        'scorecardresearch.com', 'serving-sys.com', 'sharethrough.com',
        'smartadserver.com', 'tidaltv.com', 'tribalfusion.com', 'turn.com',
        'yieldmo.com', 'zemanta.com', 'doubleclick.net',
        'googlesyndication.com', 'googleadservices.com',
        'pagead2.googlesyndication.com', 'adservice.google.com',
        'cloudnestra.com', 'novavaultcore.co.in',
        'bfrss.xyz', 'bfrns.xyz', 'iclickcdn.com', 'stooadstools.com',
        'hotjar.com', 'mouseflow.com', 'luckyorange.com',
        'fullstory.com', 'crazyegg.com', 'inspectlet.com',
        'logrocket.com', 'clarity.ms',
        // Shein & AliExpress
        'shein.com', 'sheinsz.ltwebstatic.com', 'shein.co', 'shein.fr',
        'sheinside.com', 'sheingsp.ltwebstatic.com',
        'aliexpress.com', 'aliexpress.ru', 'aliexpress.us',
        'alicdn.com', 'aliapp.org', 'alibaba.com',
        'ae01.alicdn.com', 'gw.alicdn.com',
        // YouTube
        'youtube.com', 'youtu.be', 'youtube-nocookie.com',
        'youtubei.googleapis.com', 'yt3.ggpht.com',
        'youtube-ui.l.google.com',
        // Facebook / Meta
        'facebook.com', 'facebook.net', 'fbcdn.net', 'fb.com', 'fb.me',
        'connect.facebook.net', 'staticxx.facebook.com',
        'messenger.com', 'fbsbx.com',
        // Instagram
        'instagram.com', 'cdninstagram.com', 'ig.me',
        // TikTok
        'tiktok.com', 'tiktokcdn.com', 'tiktokv.com',
        'musical.ly', 'tiktokcdn-us.com', 'byteoversea.com',
        'byteimg.com', 'ibyteimg.com', 'ibytedtos.com',
        // Twitter / X
        'twitter.com', 'x.com', 't.co', 'twimg.com',
        'platform.twitter.com', 'syndication.twitter.com',
        'abs.twimg.com', 'pbs.twimg.com',
        // Snapchat
        'snapchat.com', 'snap.com', 'sc-cdn.net',
        'snap-storage-cdn.appspot.com',
        // Pinterest
        'pinterest.com', 'pinimg.com', 'pinterest.fr',
        'widgets.pinterest.com',
        // LinkedIn
        'linkedin.com', 'licdn.com', 'platform.linkedin.com',
        // Reddit
        'reddit.com', 'redd.it', 'redditstatic.com', 'redditmedia.com',
        // Twitch
        'twitch.tv', 'twitchcdn.net', 'jtvnw.net',
        // Discord
        'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net',
        // Telegram
        'telegram.org', 't.me', 'telegram.me',
        // WhatsApp
        'whatsapp.com', 'whatsapp.net', 'wa.me',
        // Autres réseaux
        'tumblr.com', 'vk.com', 'vkontakte.ru',
        'weibo.com', 'wechat.com', 'line.me',
        'threads.net', 'bsky.app', 'mastodon.social',
    ];
    extraDomains.forEach(d => blockedDomains.add(d));

    // ===== 3. SCRIPT PATH PATTERNS (1,660 from Fanboy list) =====
    const scriptPatterns: string[] = blockedScripts as string[];

    // ===== 4. EXCLUSIONS (Whitelist) - To never block these =====
    const whitelist = new Set([
        'player.videasy.net', 'videasy.net',
        'multiembed.mov', 'multiembed.cc',
        'moviesapi.club', 'vidfast.pro',
        'themoviedb.org', 'tmdb.org',
        'vidsrc.me', 'vidsrc.to', 'vidsrc.cc', 'vidsrc.xyz',
        'cloudflare.com', 'fastly.net', 'akamaihd.net',
        'google.com', 'gstatic.com', 'googleapis.com'
    ]);

    // ===== 5. DOMAIN CHECK (with subdomain matching) =====
    function isDomainBlocked(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Check whitelist first
            if (whitelist.has(hostname)) return false;
            for (const d of whitelist) {
                if (hostname.endsWith('.' + d)) return false;
            }

            if (blockedDomains.has(hostname)) return true;
            // Check parent domains
            const parts = hostname.split('.');
            for (let i = 1; i < parts.length - 1; i++) {
                if (blockedDomains.has(parts.slice(i).join('.'))) return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ===== 6. SCRIPT PATH CHECK =====
    function isScriptBlocked(url: string): boolean {
        try {
            const hostname = new URL(url).hostname;
            if (whitelist.has(hostname)) return false;
            for (const d of whitelist) {
                if (hostname.endsWith('.' + d)) return false;
            }
        } catch {}

        const urlLower = url.toLowerCase();
        return scriptPatterns.some(p => urlLower.includes(p.toLowerCase()));
    }

    function shouldBlock(url: string): boolean {
        return isDomainBlocked(url) || isScriptBlocked(url);
    }

    // ===== 6. ANNOYANCE-HIDING CSS =====
    const ANNOYANCE_CSS = `
        /* Cookie / GDPR / Consent banners */
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
        #consentBanner, .cmp-container, .cmp-banner,

        /* Newsletter / subscription popups */
        .newsletter-popup, .newsletter-modal, .newsletter-overlay,
        .subscribe-popup, .subscribe-modal, .subscribe-overlay,
        .email-popup, .email-modal, .email-overlay,
        .signup-popup, .signup-modal, .signup-overlay,
        .popup-overlay, .exit-popup,
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

        /* Scroll-triggered annoyances */
        .slide-dock-on, .sticky-widget,
        [class*="scroll-triggered"],

        /* App install banners */
        .app-banner, .smart-banner, .smartbanner,
        [class*="app-banner"], [class*="smart-banner"],

        /* Chat widget auto-popups */
        .drift-widget-welcome-message,
        .intercom-lightweight-app-launcher,

        /* Paywalls */
        .paywall-overlay, .paywall-modal,
        [class*="paywall"], [class*="login-wall"],

        /* Video overlay ads */
        .video-ad-overlay, .player-ad,
        [class*="ad-overlay"], [class*="vast-"],
        [class*="preroll"], [class*="midroll"],

        /* Misc Fanboy selectors */
        .preezie-widget-modal, .es-badge-container,
        .vjs-pip-y-bottom, [name="bridged-flipcard-div"],
        .pm-follow-wrap, .bp-banner,
        .u-zIndexMetabar.u-fixed, .subscription-tout,
        .widget_rssiconwidget, .zr_alerts_widget_link,
        .ad400, .check-also-box,
        #TB_overlay, #TB_window,
        ${(blockedCSS as string[]).join(',\n        ')}
        { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }

        /* Restore body scroll */
        body.no-scroll, body.modal-open, body.popup-open,
        body.overflow-hidden, body.locked,
        html.no-scroll, html.modal-open, html.popup-open {
            overflow: auto !important;
            position: static !important;
        }
    `;

    // ===== INJECT CSS =====
    function injectCSS() {
        const style = document.createElement('style');
        style.id = 'mv-shield-css';
        style.textContent = ANNOYANCE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ===== OVERRIDE FETCH =====
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
        if (shouldBlock(url)) {
            return Promise.resolve(new Response('', { status: 200 }));
        }
        return originalFetch.apply(this, args);
    };

    // ===== OVERRIDE XMLHttpRequest =====
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
        const urlStr = url.toString();
        if (shouldBlock(urlStr)) {
            return originalXHROpen.apply(this, [method, 'data:text/plain,', ...rest] as any);
        }
        return originalXHROpen.apply(this, [method, url, ...rest] as any);
    };

    // ===== BLOCK POPUPS =====
    const originalOpen = window.open;
    window.open = function (...args: Parameters<typeof window.open>) {
        const url = args[0]?.toString() || '';
        if (url && !url.startsWith(window.location.origin) && !url.startsWith('about:')) {
            console.log('[Shield] Popup bloqué:', url);
            return null;
        }
        return originalOpen.apply(this, args);
    };

    // ===== DOM MUTATION OBSERVER (block injected scripts/iframes/overlays) =====
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;

                // Block injected scripts
                if (node.tagName === 'SCRIPT') {
                    const src = node.getAttribute('src') || '';
                    if (src && shouldBlock(src)) {
                        node.remove();
                        continue;
                    }
                    // Block inline anti-devtools
                    const txt = node.textContent || '';
                    if (/debugger|devtools|right.?click|context.?menu.*prevent|disable.*console/i.test(txt) && txt.length < 5000) {
                        node.remove();
                        continue;
                    }
                }

                // Block injected ad iframes
                if (node.tagName === 'IFRAME') {
                    const src = node.getAttribute('src') || '';
                    if (src && shouldBlock(src)) {
                        node.remove();
                        continue;
                    }
                }

                // Block injected link/stylesheets from ad networks
                if (node.tagName === 'LINK') {
                    const href = node.getAttribute('href') || '';
                    if (href && isDomainBlocked(href)) {
                        node.remove();
                        continue;
                    }
                }

                // Hide cookie/popup overlays
                const el = node as HTMLElement;
                const id = (el.id || '').toLowerCase();
                const cls = (el.className?.toString() || '').toLowerCase();
                if (
                    /cookie|gdpr|consent|newsletter.*popup|subscribe.*popup|push.*notif|paywall/i.test(id + ' ' + cls) &&
                    !el.closest('.player-section') && !el.closest('#player-section')
                ) {
                    el.style.display = 'none';
                }

                // Block fullscreen ad overlays (z-index > 9000, fixed position, full width)
                if (el.style?.position === 'fixed' || el.style?.position === 'absolute') {
                    const cs = window.getComputedStyle(el);
                    if (
                        cs.zIndex && parseInt(cs.zIndex) > 9000 &&
                        !el.closest('.player-section') &&
                        !el.id?.includes('player') &&
                        !el.classList.contains('modal') &&
                        !el.closest('.modal')
                    ) {
                        setTimeout(() => {
                            if (el.parentNode) el.style.display = 'none';
                        }, 50);
                    }
                }
            }
        }
    });

    // ===== PREVENT ANTI-DEVTOOLS =====
    document.addEventListener('contextmenu', (e) => e.stopPropagation(), true);

    // Prevent visibility tricks
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });

    // Block beforeunload annoyances
    window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);

    // ===== RESTORE SCROLL =====
    function unlockScroll() {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.position = '';
        ['no-scroll', 'modal-open', 'popup-open', 'overflow-hidden', 'locked'].forEach(c => {
            document.body.classList.remove(c);
            document.documentElement.classList.remove(c);
        });
    }
    setInterval(unlockScroll, 3000);

    // ===== INIT =====
    function init() {
        injectCSS();
        observer.observe(document.documentElement, { childList: true, subtree: true });
        const totalRules = blockedDomains.size + scriptPatterns.length;
        console.log(
            `%c[MOVIEVERSE Shield v2.0] ✅ Actif — ${blockedDomains.size} domaines + ${scriptPatterns.length} patterns = ${totalRules} règles`,
            'color: #4ade80; font-weight: bold; font-size: 13px;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
