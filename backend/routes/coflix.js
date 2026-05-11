const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

const COFLIX_BASE_URL = "https://coflix.date";
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
        let $ = cheerio.load(html);
        
        let iframeSrc = $("iframe").attr("src");
        let container = html;

        if (iframeSrc) {
            iframeSrc = fixUrl(iframeSrc);
            try {
                const iframeRes = await axios.get(iframeSrc, { headers: HEADERS, timeout: 5000 });
                container = iframeRes.data;
            } catch (err) {
                console.error(`[Coflix] Iframe fetch failed: ${iframeSrc}`);
            }
        }

        const $if = cheerio.load(container);
        const players = [];
        
        // Pattern 1: showVideo (Base64)
        $if('li[onclick*="showVideo"]').each((i, el) => {
            const onClick = $if(el).attr("onclick");
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            
            if (base64Match && base64Match[1]) {
                try {
                    const decodedUrl = Buffer.from(base64Match[1], 'base64').toString('utf8');
                    const quality = $if(el).find("span").text().trim() || "HD";
                    const langInfo = $if(el).find("p").text().toLowerCase();
                    
                    let lang = "VF";
                    if (langInfo.includes("vostfr")) lang = "VOSTFR";
                    else if (langInfo.includes("english") || langInfo.includes("vo")) lang = "VO";

                    players.push({
                        name: getHostName(decodedUrl),
                        url: decodedUrl,
                        lang,
                        quality: ""
                    });
                } catch (e) {}
            }
        });

        // Pattern 2: Fallback Selectors
        if (players.length === 0) {
            $if('.dooplay_player_option, .source-box, li[data-type]').each((i, el) => {
                const url = $if(el).attr('data-url') || $if(el).attr('data-link');
                if (url) {
                    const name = $if(el).find('.title, .name, span').text().trim() || "Server " + (i+1);
                    players.push({
                        name: getHostName(url),
                        url: fixUrl(url),
                        lang: "VF",
                        quality: "HD"
                    });
                }
            });
        }

        return players;
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
        
        // Lenient filtering: prioritize matching type, but accept others if they match the query
        const filtered = data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            if (type === "movie") {
                return pType === "movies" || pType === "movie" || pType === "post" || !pType;
            }
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv" || pType === "post" || !pType;
        });

        // If filtering was too strict and removed everything, take the first result as a last resort
        const finalResults = filtered.length > 0 ? filtered : data.slice(0, 1);

        console.log(`[Coflix] Found ${finalResults.length} results for "${title}"`);
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

    try {
        const results = await searchCoflix(title, "movie");
        if (results.length === 0) return res.json({ success: true, sources: [] });
        const players = await extractPlayers(results[0].url);
        res.json({ success: true, tmdbId, sources: players });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    const { title } = req.query;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    try {
        const results = await searchCoflix(title, "tv");
        if (results.length === 0) return res.json({ success: true, sources: [] });

        const seriesId = results[0].ID;
        const seriesSlug = (results[0].url || "").split('/').filter(Boolean).pop() || normalizeTitle(results[0].title || results[0].post_title).replace(/\s+/g, '-').toLowerCase();

        // Try WP-JSON
        try {
            const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
            const apiRes = await axios.get(apiPath, { headers: HEADERS, timeout: 4000 });
            if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                const targetEp = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                if (targetEp && targetEp.links) {
                    const players = await extractPlayers(targetEp.links);
                    if (players.length > 0) return res.json({ success: true, sources: players });
                }
            }
        } catch (err) {}

        // Try HTML patterns
        const slugPatterns = [
            `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
            `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
            `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
            `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
        ];

        for (const path of slugPatterns) {
            const players = await extractPlayers(path);
            if (players.length > 0) return res.json({ success: true, sources: players });
        }

        res.json({ success: true, sources: [] });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
