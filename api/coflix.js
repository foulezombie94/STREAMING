import * as cheerio from 'cheerio';
import axios from 'axios';

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

// Simple cookie jar simulation
let globalCookies = "";

async function initSession() {
    try {
        const res = await axios.get(COFLIX_BASE_URL + "/", { 
            headers: HEADERS,
            timeout: 5000 
        });
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            globalCookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }
    } catch (e) {
        console.warn("Init session failed:", e.message);
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
        const res = await axios.get(pageUrl, { headers: HEADERS });
        const html = res.data;
        let $ = cheerio.load(html);
        
        let iframeSrc = $("iframe").attr("src");
        let container = html;

        if (iframeSrc) {
            iframeSrc = fixUrl(iframeSrc);
            try {
                const iframeRes = await axios.get(iframeSrc, { headers: HEADERS, timeout: 5000 });
                container = iframeRes.data;
            } catch (err) {}
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
                        lang: lang,
                        quality: quality
                    });
                } catch (e) {}
            }
        });

        // Pattern 2: Dooplay Player Options / Source Boxes (Fallbacks)
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
        return [];
    }
}

async function searchCoflix(title, type) {
    try {
        if (!globalCookies) await initSession();
        
        const query = normalizeTitle(title);
        const suggestUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`Searching Coflix Suggest API: ${suggestUrl}`);
        
        const res = await axios.get(suggestUrl, { 
            headers: { ...HEADERS, "Cookie": globalCookies, "X-Requested-With": "XMLHttpRequest" }, 
            timeout: 8000 
        });
        let data = res.data;
        
        // If Suggest API fails or is empty, try the main search page HTML
        if (!Array.isArray(data) || data.length === 0) {
            console.log("Suggest API empty, trying HTML search page...");
            const searchUrl = `${COFLIX_BASE_URL}/?s=${encodeURIComponent(query)}`;
            const searchRes = await axios.get(searchUrl, { 
                headers: { ...HEADERS, "Cookie": globalCookies },
                timeout: 10000
            });
            const html = searchRes.data;
            const $ = cheerio.load(html);
            
            data = [];
            $('.result-item').each((i, el) => {
                const link = $(el).find('a').attr('href');
                const pTitle = $(el).find('.title a').text().trim();
                const pType = link.includes('/series/') ? 'series' : 'movies';
                if (link && pTitle) {
                    data.push({
                        url: link,
                        title: pTitle,
                        post_title: pTitle,
                        post_type: pType
                    });
                }
            });
        }

        if (!Array.isArray(data)) return [];
        
        return data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            if (type === "movie") return pType === "movies" || pType === "movie";
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv";
        });
    } catch (e) {
        console.error("Coflix search error:", e.message);
        return [];
    }
}

export default async function handler(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');

        const { path, title } = req.query;
        if (!path || !title) return res.status(400).json({ success: false, error: "Missing path or title" });

        const parts = path.split('/').filter(Boolean);
        const type = parts[0]; 
        const tmdbId = parts[1];

        if (type === 'movie') {
            const results = await searchCoflix(title, "movie");
            if (results.length === 0) return res.json({ success: true, sources: [] });
            const players = await extractPlayers(results[0].url);
            return res.json({ success: true, tmdbId, sources: players });
        } 
        
        if (type === 'tv') {
            const season = parts[2];
            const episode = parts[3];
            const results = await searchCoflix(title, "tv");
            if (results.length === 0) return res.json({ success: true, sources: [] });

            const seriesId = results[0].ID;
            const seriesSlug = (results[0].url || "").split('/').filter(Boolean).pop() || normalizeTitle(results[0].title || results[0].post_title).replace(/\s+/g, '-').toLowerCase();
            
            // Pattern 1: WP-JSON API
            try {
                const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
                const apiRes = await axios.get(apiPath, { headers: HEADERS });
                const apiData = apiRes.data;
                if (apiData && Array.isArray(apiData.episodes)) {
                    const targetEp = apiData.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        const players = await extractPlayers(targetEp.links);
                        if (players.length > 0) return res.json({ success: true, sources: players });
                    }
                }
            } catch (err) {}

            // Try multiple HTML patterns
            const slugPatterns = [
                `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
                `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
                `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
            ];

            for (const path of slugPatterns) {
                const players = await extractPlayers(path);
                if (players && players.length > 0) {
                    return res.json({ success: true, sources: players });
                }
            }
            
            return res.json({ success: true, sources: [] });
        }

        return res.status(404).json({ success: false, error: "Type not supported" });

    } catch (error) {
        console.error("Coflix handler error:", error.message);
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            debug: "Production environments like Vercel are sometimes blocked by Coflix IP filters. Try local testing or a different proxy."
        });
    }
}
