const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

const COFLIX_BASE_URL = "https://coflix.date";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": COFLIX_BASE_URL + "/",
    "Origin": COFLIX_BASE_URL
};

/**
 * Normalize title for Coflix search
 */
function normalizeTitle(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Identify the host name from a URL
 */
function getHostName(url) {
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

/**
 * Search Coflix by title
 */
async function searchCoflix(title, type) {
    try {
        const query = normalizeTitle(title);
        const url = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`[Coflix Search] Query: "${query}", Type: ${type}`);
        
        const res = await axios.get(url, { headers: HEADERS, timeout: 5000 });
        if (!Array.isArray(res.data)) return [];
        
        // Log all results for debugging
        console.log(`[Coflix Search] Found ${res.data.length} results`);

        // Filter by type
        const filtered = res.data.filter(item => {
            const pType = item.post_type.toLowerCase();
            if (type === "movie") return pType === "movies" || pType === "movie";
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv";
        });

        console.log(`[Coflix Search] Filtered results: ${filtered.length}`);
        return filtered;
    } catch (e) {
        console.error("[Coflix Search Error]", e.message);
        return [];
    }
}

async function extractPlayers(pageUrl) {
    if (!pageUrl) return [];
    if (typeof pageUrl === 'object' && pageUrl.url) pageUrl = pageUrl.url;

    try {
        console.log(`[Coflix Extraction] Fetching page: ${pageUrl}`);
        const res = await axios.get(pageUrl, { headers: HEADERS, timeout: 5000 });
        const $ = cheerio.load(res.data);
        
        // Find the main iframe
        let iframeSrc = $("iframe").attr("src");
        let container = res.data;

        if (iframeSrc) {
            if (iframeSrc.startsWith("/")) iframeSrc = COFLIX_BASE_URL + iframeSrc;
            const iframeRes = await axios.get(iframeSrc, { headers: HEADERS, timeout: 5000 });
            container = iframeRes.data;
        }

        const $if = cheerio.load(container);
        const players = [];
        
        $if('li[onclick*="showVideo"]').each((i, el) => {
            const onClick = $if(el).attr("onclick");
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            
            if (base64Match && base64Match[1]) {
                const decodedUrl = Buffer.from(base64Match[1], 'base64').toString('utf8');
                const quality = $if(el).find("span").text().trim() || "HD";
                const langInfo = $if(el).find("p").text().toLowerCase();
                
                let lang = "VF";
                if (langInfo.includes("vostfr")) lang = "VOSTFR";
                else if (langInfo.includes("english") || langInfo.includes("vo")) lang = "VO";

                const host = getHostName(decodedUrl);

                players.push({
                    name: host,
                    url: decodedUrl,
                    lang: lang,
                    quality: quality
                });
            }
        });

        console.log(`[Coflix Extraction] Found ${players.length} players`);
        return players;
    } catch (e) {
        console.error("[Coflix Extraction Error]", e.message);
        return [];
    }
}

// Routes
router.get("/movie/:tmdbId", async (req, res) => {
    const { tmdbId } = req.params;
    const title = req.query.title;

    if (!title) return res.status(400).json({ success: false, error: "Title is required for scraping" });

    try {
        const results = await searchCoflix(title, "movie");
        if (results.length === 0) return res.json({ success: true, sources: [] });

        const movieUrl = results[0].url;
        const players = await extractPlayers(movieUrl);

        res.json({ success: true, tmdbId, sources: players });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    const title = req.query.title;

    if (!title) return res.status(400).json({ success: false, error: "Title is required for scraping" });

    try {
        const results = await searchCoflix(title, "tv");
        if (results.length === 0) return res.json({ success: true, sources: [] });

        const seriesId = results[0].ID;
        const seriesSlug = results[0].url.split('/').filter(Boolean).pop();
        
        // Pattern 1: WP-JSON API
        const patterns = [
            `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`,
            `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}`,
            `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/` // URL Directe (Scraping HTML)
        ];

        for (const url of patterns) {
            try {
                console.log(`[Coflix TV] Trying pattern: ${url}`);
                if (url.includes('wp-json')) {
                    const apiRes = await axios.get(url, { headers: HEADERS, timeout: 4000 });
                    if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                        const targetEpisode = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                        if (targetEpisode && targetEpisode.links) {
                            const players = await extractPlayers(targetEpisode.links);
                            if (players.length > 0) return res.json({ success: true, tmdbId, season, episode, sources: players });
                        }
                    } else if (apiRes.data && apiRes.data.links) {
                        // Cas où l'API renvoie directement l'épisode
                        const players = await extractPlayers(apiRes.data.links);
                        if (players.length > 0) return res.json({ success: true, tmdbId, season, episode, sources: players });
                    }
                } else {
                    // Scraping HTML direct de la page de l'épisode
                    const players = await extractPlayers(url);
                    if (players.length > 0) return res.json({ success: true, tmdbId, season, episode, sources: players });
                }
            } catch (err) {
                console.warn(`[Coflix TV Pattern Failed] ${url}: ${err.message}`);
            }
        }
        
        res.json({ success: true, sources: [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
