const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const cache = require('../utils/redis');

const COFLIX_BASE_URL = "https://coflix.cymru";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
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
        console.error(`[Coflix] Session initialization failed for ${COFLIX_BASE_URL}: ${e.message}`);
    }
}


function normalizeTitle(title) {
    if (!title) return "";
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
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

async function extractPlayers(pageUrl) {
    if (!pageUrl) return [];
    try {
        console.log(`[Coflix] Extracting from: ${pageUrl}`);
        const res = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
        const html = res.data;
        const $ = cheerio.load(html);
        const players = [];
        
        // Helper to parse elements
        const parseElement = (el, source$) => {
            const onclick = source$(el).attr('onclick');
            if (onclick && onclick.includes('showVideo')) {
                const match = onclick.match(/showVideo\(['"]([^'"]+)['"]/);
                if (match && match[1]) {
                    try {
                        const decoded = Buffer.from(match[1], 'base64').toString('utf8');
                        if (decoded.includes("xtremestream")) return;
                        
                        const sub = source$(el).find('p').text().trim().toLowerCase();
                        let lang = "VF";
                        if (sub.includes("vostfr")) lang = "VOSTFR";
                        else if (sub.includes("vo") || sub.includes("english")) lang = "VO";
                        
                        players.push({
                            name: getHostName(decoded),
                            url: decoded.startsWith('//') ? 'https:'+decoded : decoded,
                            lang,
                            quality: "HD"
                        });
                    } catch (e) {}
                }
            }
        };

        // 1. Direct li items with showVideo
        $('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $));

        // 2. Iframe Bridge (Deep extraction)
        const allIframes = $("iframe").toArray();
        for (const el of allIframes) {
            const src = $(el).attr('src');
            if (!src) continue;
            if (src.includes('youtube.com') || src.includes('youtu.be')) continue;

            if (src.includes('lecteurvideo') || src.includes('bridge') || src.includes('embed.php')) {
                try {
                    const iframePageHtml = await axios.get(fixUrl(src), { 
                        headers: { ...HEADERS, "Referer": COFLIX_BASE_URL + "/" }, 
                        timeout: 8000 
                    });
                    const $if = cheerio.load(iframePageHtml.data);
                    $if('li[onclick*="showVideo"], a[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, element) => parseElement(element, $if));
                } catch (e) {}
            }
        }

        // 3. Direct data-url
        $('[data-url], [data-link]').each((_, el) => {
            const url = $(el).attr('data-url') || $(el).attr('data-link');
            if (url && url.includes('http')) {
                players.push({
                    name: getHostName(url),
                    url,
                    lang: "VF",
                    quality: "HD"
                });
            }
        });

        // Deduplicate
        const seenUrls = new Set();
        return players.filter(p => {
            if (seenUrls.has(p.url)) return false;
            seenUrls.add(p.url);
            return true;
        });

    } catch (e) {
        console.error(`[Coflix] Extraction error for ${pageUrl}: ${e.message}`);
        return [];
    }
}

async function searchCoflix(title, type) {
    try {
        if (!globalCookies) await initSession();
        const query = normalizeTitle(title);
        const url = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`[Coflix] Searching: ${url}`);
        
        const res = await axios.get(url, { 
            headers: { ...HEADERS, "Cookie": globalCookies, "X-Requested-With": "XMLHttpRequest" }, 
            timeout: 5000 
        });
        const data = res.data;
        
        if (!Array.isArray(data)) {
            console.warn(`[Coflix] Search response for "${title}" is not an array`);
            return [];
        }
        
        const filtered = data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            if (type === "movie") {
                return pType === "movies" || pType === "movie" || pType === "post" || !pType;
            }
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv" || pType === "post" || !pType;
        });

        // Rank by similarity
        const qNorm = query.toLowerCase();
        const ranked = filtered.sort((a, b) => {
            const aTitle = (a.post_title || a.title || "").toLowerCase();
            const bTitle = (b.post_title || b.title || "").toLowerCase();
            const aScore = aTitle === qNorm ? 1 : (aTitle.includes(qNorm) ? 0.8 : 0.5);
            const bScore = bTitle === qNorm ? 1 : (bTitle.includes(qNorm) ? 0.8 : 0.5);
            return bScore - aScore;
        });

        const finalResults = ranked.slice(0, 1);
        console.log(`[Coflix] Found ${data.length} results. Selected: ${finalResults[0]?.post_title || finalResults[0]?.title}`);
        return finalResults;

    } catch (e) {
        console.error(`[Coflix] Search error for "${title}": ${e.message}`);
        return [];
    }
}


router.get("/movie/:tmdbId", async (req, res) => {
    const { tmdbId } = req.params;
    const { title } = req.query;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const cacheKey = cache.generateKey('coflix', 'movie', `${tmdbId}_${title}`);
    
    try {
        // 1. Check Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            console.log(`[Cache] Hit for ${title} (${tmdbId})`);
            return res.json({ success: true, tmdbId, sources: cachedData, cached: true });
        }

        // 2. If not in cache, scrape
        const results = await searchCoflix(title, "movie");
        if (results.length === 0) return res.json({ success: true, sources: [] });
        
        const players = await extractPlayers(results[0].url);
        
        // 3. Save to Cache (24h)
        if (players.length > 0) {
            await cache.set(cacheKey, players, 86400);
        }

        res.json({ success: true, tmdbId, sources: players });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    const { title } = req.query;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const cacheKey = cache.generateKey('coflix', 'tv', `${tmdbId}_s${season}e${episode}_${title}`);

    try {
        // 1. Check Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            console.log(`[Cache] Hit for ${title} S${season}E${episode}`);
            return res.json({ success: true, sources: cachedData, cached: true });
        }

        const results = await searchCoflix(title, "tv");
        if (results.length === 0) return res.json({ success: true, sources: [] });

        let players = [];
        const seriesId = results[0].ID;
        const seriesSlug = (results[0].url || "").split('/').filter(Boolean).pop() || normalizeTitle(results[0].title || results[0].post_title).replace(/\s+/g, '-').toLowerCase();

        // Try WP-JSON
        try {
            const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
            const apiRes = await axios.get(apiPath, { headers: HEADERS, timeout: 4000 });
            if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                const targetEp = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                if (targetEp && targetEp.links) {
                    players = await extractPlayers(targetEp.links);
                }
            }
        } catch (err) {}

        // Try HTML patterns & Direct Parsing
        if (players.length === 0) {
            try {
                const seriesPage = await axios.get(results[0].url, { headers: HEADERS, timeout: 5000 });
                const $main = cheerio.load(seriesPage.data);
                
                let episodeLink = $main(`.episode:contains("T${season}-E${episode}") a`).attr('href')
                               || $main(`.episode:contains("${season}x${episode}") a`).attr('href')
                               || $main(`[data-season="${season}"]`).find(`[data-episode="${episode}"] a`).attr('href') 
                               || $main(`li[data-episode="${episode}"] a`).attr('href')
                               || $main(`a:contains("Épisode ${episode}")`).attr('href');
                
                if (episodeLink) {
                    players = await extractPlayers(fixUrl(episodeLink));
                }
            } catch (e) {}
        }

        if (players.length === 0) {
            const slugPatterns = [
                `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
                `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
                `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
            ];

            for (const path of slugPatterns) {
                players = await extractPlayers(path);
                if (players.length > 0) break;
            }
        }

        // 3. Save to Cache
        if (players.length > 0) {
            await cache.set(cacheKey, players, 86400);
        }

        res.json({ success: true, sources: players });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
