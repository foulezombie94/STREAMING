const express = require("express");
const router = express.Router();
const axios = require("axios");
const cheerio = require("cheerio");
const { Buffer } = require("buffer");
const cache = require('../utils/redis');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const COFLIX_BASE_URL = "https://coflix.band";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    "Referer": COFLIX_BASE_URL + "/",
    "Origin": COFLIX_BASE_URL
};

let globalCookies = "";

async function initSession() {
    try {
        const res = await axios.get(COFLIX_BASE_URL + "/", { 
            headers: HEADERS,
            timeout: 5000,
            proxy: false
        });
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            globalCookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }
    } catch (e) {
        console.error(`[Coflix] Session init failed: ${e.message}`);
    }
}

async function getTmdbTitle(tmdbId, type) {
    try {
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
        const res = await axios.get(url, { timeout: 4000 });
        return res.data.title || res.data.name || res.data.original_title || res.data.original_name;
    } catch (e) {
        console.error(`[TMDB] Error fetching title for ${tmdbId}: ${e.message}`);
        return null;
    }
}

function normalizeCoflixQuery(query) {
    if (!query) return query;
    const replacements = {
        "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a",
        "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e",
        "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i",
        "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o",
        "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u",
        "\u00fd": "y", "\u00ff": "y", "\u00f1": "n", "\u00e7": "c", "\u0153": "oe", "\u00e6": "ae"
    };

    let normalized = query.toLowerCase();
    for (const [special, normal] of Object.entries(replacements)) {
        normalized = normalized.split(special).join(normal);
    }
    return normalized.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;
    const t1 = title1.toLowerCase().trim();
    const t2 = title2.toLowerCase().trim();
    if (t1 === t2) return 1.0;
    if (t1.includes(t2) || t2.includes(t1)) return 0.8;
    return 0.5; // Simplified for basic matching
}

function fixUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return COFLIX_BASE_URL + url;
    return url;
}

function getHostName(url) {
    if (!url) return "Direct";
    const u = url.toLowerCase();
    if (u.includes("vidoza")) return "Vidoza";
    if (u.includes("uqload")) return "Uqload";
    if (u.includes("upstream")) return "Upstream";
    if (u.includes("dood")) return "DoodStream";
    if (u.includes("streamtape")) return "Streamtape";
    if (u.includes("voe")) return "VOE";
    if (u.includes("mixdrop")) return "MixDrop";
    if (u.includes("evoload")) return "Evoload";
    if (u.includes("sendvid")) return "SendVid";
    if (u.includes("sibnet")) return "Sibnet";
    if (u.includes("ok.ru")) return "OK.ru";
    
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
        return "Direct";
    }
}

async function searchCoflix(title, type) {
    try {
        if (!globalCookies) await initSession();
        const query = normalizeCoflixQuery(title);
        const url = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        
        const res = await axios.get(url, { 
            headers: { ...HEADERS, "Cookie": globalCookies, "X-Requested-With": "XMLHttpRequest" }, 
            timeout: 5000 
        });
        const data = res.data;
        
        if (!Array.isArray(data)) return [];
        
        let coflixTypes = [];
        if (type === "movie") {
            coflixTypes = ["movies", "movie", "post"];
        } else {
            coflixTypes = ["series", "animes", "doramas", "tvshows", "tvshow", "tv", "post"];
        }

        let filtered = data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            return coflixTypes.includes(pType) || !pType;
        });

        filtered.sort((a, b) => calculateTitleSimilarity(title, b.title) - calculateTitleSimilarity(title, a.title));

        return filtered.length > 0 ? filtered : data.slice(0, 1);
    } catch (e) {
        return [];
    }
}

async function extractPlayersFromIframe(iframeSrc) {
    const players = [];

    // Removed direct return of lecteurvideo bridge to ensure deep extraction

    try {
        const iframePageResponse = await axios.get(iframeSrc, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 8000 });
        const iframePage$ = cheerio.load(iframePageResponse.data);

        let playerItems = iframePage$('li[onclick*="showVideo"]');
        if (!playerItems.length) {
            playerItems = iframePage$("div li[onclick]");
        }

        playerItems.each((i, element) => {
            try {
                const $element = iframePage$(element);
                const onClickAttr = $element.attr("onclick") || "";
                const base64Match = onClickAttr.match(/showVideo\(['"]([^'\"]+)['"]/);

                if (base64Match && base64Match[1]) {
                    const base64Url = base64Match[1];
                    let decodedUrl = null;
                    try {
                        decodedUrl = Buffer.from(base64Url, "base64").toString("utf-8");
                    } catch (err) {}

                    if (decodedUrl && !decodedUrl.includes("lecteur1.xtremestream.xyz")) {
                        const quality = $element.find("span").text().trim() || "HD";
                        let language = "VF";
                        const info = $element.find("p").text().trim().toLowerCase();
                        if (info.includes("french") || info.includes("vf")) language = "VF";
                        else if (info.includes("english") || info.includes("vo")) language = "VO";
                        else if (info.includes("vostfr")) language = "VOSTFR";

                        players.push({
                            name: getHostName(decodedUrl),
                            url: decodedUrl,
                            lang: language,
                            quality: quality
                        });
                    }
                }
            } catch (err) {}
        });

        // Additive check for standard data-url tags if base64 fails
        if (players.length === 0) {
            iframePage$('.dooplay_player_option, .source-box, li[data-type], .server, .list-server-items li, #server-list li').each((i, el) => {
                const url = iframePage$(el).attr('data-url') || iframePage$(el).attr('data-link') || iframePage$(el).attr('data-href');
                if (url) {
                    const cleanUrl = fixUrl(url);
                    players.push({
                        name: getHostName(cleanUrl),
                        url: cleanUrl,
                        lang: "VF",
                        quality: "HD"
                    });
                }
            });
        }
    } catch (e) {
        console.error(`[Coflix] Iframe fetch error: ${e.message}`);
    }

    const uniquePlayers = [];
    const seenUrls = new Set();
    for (const p of players) {
        if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            uniquePlayers.push(p);
        }
    }
    return uniquePlayers;
}

router.get("/movie/:tmdbId", async (req, res) => {
    const { tmdbId } = req.params;
    const cacheKey = cache.generateKey('movix', 'movie', tmdbId);
    
    try {
        // 1. Check Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            console.log(`[Cache] Movix Hit for ${tmdbId}`);
            return res.json({ success: true, tmdb_id: tmdbId, players: cachedData, cached: true });
        }

        const title = await getTmdbTitle(tmdbId, "movie");
        if (!title) {
            return res.json({ success: true, tmdb_id: tmdbId, players: { vf: [], vostfr: [] } });
        }

        const results = await searchCoflix(title, "movie");
        let players = [];
        if (results.length > 0) {
            const pageUrl = results[0].url;
            const response = await axios.get(pageUrl, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 8000 });
            const $ = cheerio.load(response.data);
            
            let iframe = $("main div div div article div:nth-child(2) div:nth-child(1) aside div div iframe");
            if (!iframe.length) iframe = $("article iframe");
            if (!iframe.length) iframe = $("iframe");

            let iframeSrc = iframe.attr("src");
            if (iframeSrc) {
                iframeSrc = fixUrl(iframeSrc);
                players = await extractPlayersFromIframe(iframeSrc);
            }
        }

        const finalPlayers = {
            vf: players.filter(s => s.lang === "VF" || s.lang === "Français" || s.lang === "VO"),
            vostfr: players.filter(s => s.lang === "VOSTFR")
        };

        // 2. Save to Cache (7 days)
        if (players.length > 0) {
            await cache.set(cacheKey, finalPlayers, 604800);
        }

        res.json({
            success: true,
            tmdb_id: tmdbId,
            players: finalPlayers
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    const cacheKey = cache.generateKey('movix', 'tv', `${tmdbId}_s${season}e${episode}`);

    try {
        // 1. Check Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            console.log(`[Cache] Movix Hit for TV ${tmdbId} S${season}E${episode}`);
            return res.json({ success: true, tmdb_id: tmdbId, season, episode, players: cachedData, cached: true });
        }

        const title = await getTmdbTitle(tmdbId, "tv");
        if (!title) {
            return res.json({ success: true, tmdb_id: tmdbId, season, episode, players: { vf: [], vostfr: [] } });
        }

        const results = await searchCoflix(title, "tv");
        let players = [];
        if (results.length > 0) {
            const pageUrl = results[0].url;
            const response = await axios.get(pageUrl, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 8000 });
            const $ = cheerio.load(response.data);

            const seasonItems = $("article section div aside div ul li, ul li, .seasons li, .season-list li, [data-season]");
            let targetPostId = null;

            seasonItems.each((i, el) => {
                const $input = $(el).find("input");
                const sNumber = parseInt($input.attr("data-season") || $(el).attr("data-season"));
                if (sNumber === parseInt(season)) {
                    targetPostId = $input.attr("post-id") || $(el).attr("post-id");
                }
            });

            if (targetPostId) {
                try {
                    const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${targetPostId}/${season}`;
                    const apiRes = await axios.get(apiPath, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 4000 });
                    if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                        const targetEp = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                        if (targetEp && targetEp.links) {
                            let epUrl = targetEp.links.startsWith("http") ? targetEp.links : `${COFLIX_BASE_URL}${targetEp.links}`;
                            
                            const epResponse = await axios.get(epUrl, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 8000 });
                            const ep$ = cheerio.load(epResponse.data);
                            
                            let epIframe = ep$("main div div div article div iframe");
                            if (!epIframe.length) epIframe = ep$("article iframe");
                            if (!epIframe.length) epIframe = ep$("iframe");

                            let epIframeSrc = epIframe.attr("src");
                            if (epIframeSrc) {
                                epIframeSrc = fixUrl(epIframeSrc);
                                players = await extractPlayersFromIframe(epIframeSrc);
                            }
                        }
                    }
                } catch (err) {}
            }

            if (players.length === 0) {
                const seriesSlug = (pageUrl || "").split('/').filter(Boolean).pop() || normalizeCoflixQuery(results[0].title).replace(/\s+/g, '-').toLowerCase();
                const slugPatterns = [
                    `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                    `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
                    `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
                    `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
                ];

                for (const path of slugPatterns) {
                    try {
                        const epResponse = await axios.get(path, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 5000 });
                        const ep$ = cheerio.load(epResponse.data);

                        let epIframe = ep$("main div div div article div iframe");
                        if (!epIframe.length) epIframe = ep$("article iframe");
                        if (!epIframe.length) epIframe = ep$("iframe");

                        let epIframeSrc = epIframe.attr("src");
                        if (epIframeSrc) {
                            epIframeSrc = fixUrl(epIframeSrc);
                            players = await extractPlayersFromIframe(epIframeSrc);
                            if (players.length > 0) break;
                        }
                    } catch(e) {}
                }
            }
        }

        const finalPlayers = {
            vf: players.filter(s => s.lang === "VF" || s.lang === "Français" || s.lang === "VO"),
            vostfr: players.filter(s => s.lang === "VOSTFR")
        };

        // 2. Save to Cache (7 days)
        if (players.length > 0) {
            await cache.set(cacheKey, finalPlayers, 604800);
        }

        res.json({
            success: true,
            tmdb_id: tmdbId,
            season,
            episode,
            players: finalPlayers
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
