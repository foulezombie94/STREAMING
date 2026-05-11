import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Bypass local DNS blocks (like hosts file redirecting to 127.0.0.1)
dns.setServers(['1.1.1.1', '8.8.8.8']);

// Trace deprecation warnings to find the culprit
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning') {
        console.error(`[Warning Trace] ${warning.message}\nStack: ${warning.stack}`);
    }
});


const customLookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // Localhost always uses standard lookup
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return dns.lookup(hostname, options, callback);
    }

    // 1. Try resolving via public DNS (bypasses hosts file)
    dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
            return callback(null, addresses[0], 4);
        }
        
        // 2. Fallback to standard lookup but check for loopback hijacking
        dns.lookup(hostname, options, (err2, address, family) => {
            if (err2) {
                return callback(err2);
            }
            if (!address || address === '127.0.0.1' || address === '::1') {
                return callback(new Error(`DNS_BLOCK: ${hostname} resolved to loopback or nothing`));
            }
            callback(null, address, family || 4);
        });
    });
};



const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;

const httpsAgent = isVercel ? undefined : new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = isVercel ? undefined : new http.Agent({ lookup: customLookup, keepAlive: true });

// Apply to axios
if (httpsAgent) axios.defaults.httpsAgent = httpsAgent;
if (httpAgent) axios.defaults.httpAgent = httpAgent;
axios.defaults.proxy = false;


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
            timeout: 5000,
            proxy: false
        });
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            globalCookies = setCookie.map(c => c.split(';')[0]).join('; ');
            console.log(`[Coflix] Session initialized. Cookies: ${globalCookies ? 'Yes' : 'No'}`);
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
        console.log(`[Coflix] Extracting players from: ${pageUrl}`);
        const res = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000, proxy: false });
        const html = res.data;
        console.log(`[Coflix] Page fetch status: ${res.status}, HTML size: ${html.length}`);
        
        let $ = cheerio.load(html);
        let players = [];
        
        // Pattern 1: showVideo (Base64)
        $('li[onclick*="showVideo"]').each((i, el) => {
            const onClick = $(el).attr("onclick");
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            if (base64Match && base64Match[1]) {
                try {
                    const decodedUrl = Buffer.from(base64Match[1], 'base64').toString('utf8');
                    const langInfo = $(el).find("p").text().toLowerCase();
                    let lang = langInfo.includes("vostfr") ? "VOSTFR" : (langInfo.includes("vo") ? "VO" : "VF");
                    players.push({
                        name: getHostName(decodedUrl),
                        url: decodedUrl,
                        lang,
                        quality: ""
                    });
                } catch (e) {}
            }
        });

        // Pattern 2: Dooplay/Source Boxes (Additive)
        $('.dooplay_player_option, .source-box, li[data-type], .server').each((i, el) => {
            const url = $(el).attr('data-url') || $(el).attr('data-link') || $(el).attr('data-href');
            if (url) {
                const cleanUrl = fixUrl(url);
                players.push({
                    name: getHostName(cleanUrl),
                    url: cleanUrl,
                    lang: "VF",
                    quality: ""
                });
            }
        });

        // Pattern 3: iFrame direct (Last resort if still few)
        if (players.length < 2) {
            $("iframe").each((i, el) => {
                const src = $(el).attr("src");
                if (src && !src.includes("google") && !src.includes("facebook") && !src.includes("doubleclick") && !src.includes("twitter")) {
                    const cleanUrl = fixUrl(src);
                    players.push({
                        name: getHostName(cleanUrl),
                        url: cleanUrl,
                        lang: "VF",
                        quality: ""
                    });
                }
            });
        }

        // De-duplicate by URL
        const uniquePlayers = [];
        const seenUrls = new Set();
        for (const p of players) {
            if (!seenUrls.has(p.url)) {
                seenUrls.add(p.url);
                uniquePlayers.push(p);
            }
        }

        console.log(`[Coflix] Extraction complete. Found ${uniquePlayers.length} unique players.`);
        return uniquePlayers;
    } catch (e) {
        console.error(`[Coflix] Extraction failed for ${pageUrl}: ${e.message}`);
        return [];
    }
}



async function searchCoflix(title, type) {
    try {
        if (!globalCookies) {
            console.log("[Coflix] No cookies found, initializing session...");
            await initSession();
        }
        
        const query = normalizeTitle(title);
        const suggestUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`[Coflix] Searching Suggest API: ${suggestUrl}`);
        
        const res = await axios.get(suggestUrl, { 
            headers: { 
                ...HEADERS, 
                "Cookie": globalCookies, 
                "X-Requested-With": "XMLHttpRequest" 
            }, 
            timeout: 8000,
            proxy: false
        });
        
        let data = res.data;
        console.log(`[Coflix] Suggest API status: ${res.status}, Type: ${typeof data}`);

        if (!Array.isArray(data) || data.length === 0) {
            console.log(`[Coflix] Suggest API empty for "${query}", falling back to HTML search...`);
            const searchUrl = `${COFLIX_BASE_URL}/?s=${encodeURIComponent(query)}`;
            const searchRes = await axios.get(searchUrl, { 
                headers: { ...HEADERS, "Cookie": globalCookies },
                timeout: 10000,
                proxy: false
            });
            
            const html = searchRes.data;
            const $ = cheerio.load(html);
            data = [];
            $('.result-item').each((i, el) => {
                const link = $(el).find('a').attr('href');
                const pTitle = $(el).find('.title a').text().trim();
                const pType = (link || "").includes('/series/') ? 'series' : 'movies';
                if (link && pTitle) {
                    data.push({
                        url: link,
                        title: pTitle,
                        post_title: pTitle,
                        post_type: pType
                    });
                }
            });
            console.log(`[Coflix] HTML search found ${data.length} results.`);
        }

        if (!Array.isArray(data)) {
            console.error(`[Coflix] Final search result is not an array for "${title}"`);
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

        console.log(`[Coflix] Final filtered results: ${finalResults.length}`);
        return finalResults;
    } catch (e) {

        console.error(`[Coflix] Search error for "${title}": ${e.message}`);
        return [];
    }
}



export default async function handler(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');

        // Manual URL parsing to avoid legacy req.query (which uses deprecated url.parse internally)
        const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const path = fullUrl.searchParams.get('path');
        const title = fullUrl.searchParams.get('title');

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
