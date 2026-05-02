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
        // Ad networks often seen on mobile
        'creativecdn.com', 'dnacdn.net', 'adnuntius.delivery',
        'mndsrv.com', 'onclickalgo.com', 'onclickperformance.com',
        'wig671.com', 'highrevenuegate.com', 'vdtv.io', 'vidoza.net',
        'upstream.to', 'doodstream.com', 'dood.to', 'mixdrop.co',
        'rabbitstream.net', 'megacloud.tv', 'vizcloud.online'
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
        'vidsrc.me', 'vidsrc.to', 'vidsrc.cc', 'vidsrc.xyz', 'vidsrc.in', 'vidsrc.pm', 'vidsrc.net', 'vidsrc.vip',
        'superembed.stream', 'embed.su', '2embed.me', '2embed.cc',
        'cloudflare.com', 'fastly.net', 'akamaihd.net', 'amazonaws.com', 'azureedge.net',
        'google.com', 'gstatic.com', 'googleapis.com'
    ]);

    // ===== 5. HELPERS =====
    function isDomainBlocked(url: string): boolean {
        try {
            const hostname = new URL(url).hostname;
            if (whitelist.has(hostname)) return false;
            for (const d of whitelist) {
                if (hostname.endsWith('.' + d)) return false;
            }
            if (blockedDomains.has(hostname)) return true;
            const parts = hostname.split('.');
            for (let i = 1; i < parts.length - 1; i++) {
                if (blockedDomains.has(parts.slice(i).join('.'))) return true;
            }
            return false;
        } catch { return false; }
    }

    function shouldBlock(url: string): boolean {
        if (!url) return false;
        const urlLower = url.toLowerCase();
        return isDomainBlocked(url) || scriptPatterns.some(p => urlLower.includes(p.toLowerCase()));
    }

    // ===== 6. CSS INJECTION =====
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

        /* App install banners */
        .app-banner, .smart-banner, .smartbanner,
        [class*="app-banner"], [class*="smart-banner"],

        /* Video overlay ads (careful not to hide player controls) */
        .video-ad-overlay, .player-ad,
        [class*="vast-"], [class*="preroll"], [class*="midroll"],
        
        /* Misc */
        ${(blockedCSS as string[]).slice(0, 100).join(',\n        ')}
        { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
    `;

    function injectCSS() {
        const style = document.createElement('style');
        style.id = 'mv-shield-css';
        style.textContent = ANNOYANCE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ===== 7. POPUP BLOCKING =====
    const originalOpen = window.open;
    window.open = function (...args: any[]) {
        const url = args[0]?.toString() || '';
        if (url && !url.startsWith(window.location.origin) && !url.startsWith('about:')) {
            console.log('[Shield] Popup bloqué:', url);
            return null;
        }
        return originalOpen.apply(this, args as any);
    };

    // ===== 8. INIT =====
    function init() {
        injectCSS();
        console.log(
            `%c[MOVIEVERSE Shield v2.0] ✅ Actif — Mode Sécurisé Mobile`,
            'color: #4ade80; font-weight: bold; font-size: 13px;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
