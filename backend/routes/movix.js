const express = require("express");
const router = express.Router();
const axios = require("axios");
const cheerio = require("cheerio");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "e1a2bb6a3ed288feb5d767908732e751";
const COFLIX_BASE_URL = "https://coflix.date";

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

async function searchCoflix(title, type) {
    try {
        if (!globalCookies) await initSession();
        const query = normalizeTitle(title);
        const url = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        
        const res = await axios.get(url, { 
            headers: { ...HEADERS, "Cookie": globalCookies, "X-Requested-With": "XMLHttpRequest" }, 
            timeout: 5000 
        });
        const data = res.data;
        
        if (!Array.isArray(data)) return [];
        
        const filtered = data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            if (type === "movie") {
                return pType === "movies" || pType === "movie" || pType === "post" || !pType;
            }
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv" || pType === "post" || !pType;
        });

        return filtered.length > 0 ? filtered : data.slice(0, 1);
    } catch (e) {
        return [];
    }
}

async function extractPlayers(pageUrl) {
    if (!pageUrl) return [];
    try {
        const res = await axios.get(pageUrl, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 8000 });
        const html = res.data;
        let $ = cheerio.load(html);
        
        let iframeSrc = $("iframe").attr("src");
        let container = html;

        if (iframeSrc) {
            iframeSrc = fixUrl(iframeSrc);
            try {
                const iframeRes = await axios.get(iframeSrc, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 5000 });
                container = iframeRes.data;
            } catch (err) {}
        }

        const $if = cheerio.load(container);
        const players = [];
        
        $if('li[onclick*="showVideo"]').each((i, el) => {
            const onClick = $if(el).attr("onclick");
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            
            if (base64Match && base64Match[1]) {
                try {
                    const decodedUrl = Buffer.from(base64Match[1], 'base64').toString('utf8');
                    const langInfo = $if(el).find("p").text().toLowerCase();
                    
                    let lang = "VF";
                    if (langInfo.includes("vostfr")) lang = "VOSTFR";
                    else if (langInfo.includes("english") || langInfo.includes("vo")) lang = "VO";

                    players.push({
                        name: getHostName(decodedUrl),
                        url: decodedUrl,
                        lang,
                        quality: "HD"
                    });
                } catch (e) {}
            }
        });

        $('.dooplay_player_option, .source-box, li[data-type], .server, .list-server-items li, #server-list li').each((i, el) => {
            const url = $(el).attr('data-url') || $(el).attr('data-link') || $(el).attr('data-href');
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

        const uniquePlayers = [];
        const seenUrls = new Set();
        for (const p of players) {
            if (!seenUrls.has(p.url)) {
                seenUrls.add(p.url);
                uniquePlayers.push(p);
            }
        }

        return uniquePlayers;
    } catch (e) {
        return [];
    }
}

router.get("/movie/:tmdbId", async (req, res) => {
    const { tmdbId } = req.params;
    
    try {
        const title = await getTmdbTitle(tmdbId, "movie");
        if (!title) {
            return res.json({ success: true, tmdb_id: tmdbId, players: { vf: [], vostfr: [] } });
        }

        const results = await searchCoflix(title, "movie");
        let players = [];
        if (results.length > 0) {
            players = await extractPlayers(results[0].url);
        }

        res.json({
            success: true,
            tmdb_id: tmdbId,
            players: {
                vf: players.filter(s => s.lang === "VF" || s.lang === "Français" || s.lang === "VO"),
                vostfr: players.filter(s => s.lang === "VOSTFR" || s.lang === "VOSTFR")
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    
    try {
        const title = await getTmdbTitle(tmdbId, "tv");
        if (!title) {
            return res.json({ success: true, tmdb_id: tmdbId, season, episode, players: { vf: [], vostfr: [] } });
        }

        const results = await searchCoflix(title, "tv");
        let players = [];
        if (results.length > 0) {
            const seriesId = results[0].ID;
            const seriesSlug = (results[0].url || "").split('/').filter(Boolean).pop() || normalizeTitle(results[0].title || results[0].post_title).replace(/\s+/g, '-').toLowerCase();

            try {
                const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
                const apiRes = await axios.get(apiPath, { headers: { ...HEADERS, "Cookie": globalCookies }, timeout: 4000 });
                if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                    const targetEp = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        players = await extractPlayers(targetEp.links);
                    }
                }
            } catch (err) {}

            if (players.length === 0) {
                const slugPatterns = [
                    `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                    `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
                    `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
                    `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
                ];

                for (const path of slugPatterns) {
                    players = await extractPlayers(path);
                    if (players.length > 0) break;
                }
            }
        }

        res.json({
            success: true,
            tmdb_id: tmdbId,
            season,
            episode,
            players: {
                vf: players.filter(s => s.lang === "VF" || s.lang === "Français" || s.lang === "VO"),
                vostfr: players.filter(s => s.lang === "VOSTFR" || s.lang === "VOSTFR")
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
