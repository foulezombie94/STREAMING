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

        // Pattern 2: Server Lists/Boxes (Additive & Aggressive)
        $('.dooplay_player_option, .source-box, li[data-type], .server, .list-server-items li, #server-list li, .player-option').each((i, el) => {
            const url = $(el).attr('data-url') || $(el).attr('data-link') || $(el).attr('data-href') || $(el).attr('data-video');
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


        // Pattern 3: High-Precision Deep Extraction (Reference Code Style)
        const iframes = $("iframe").toArray();
        let specificIframe = $("main div div div article div:nth-child(2) div:nth-child(1) aside div div iframe");
        if (specificIframe.length) {
            iframes.push(specificIframe[0]);
        }

        for (const el of iframes) {
            let src = $(el).attr('src');
            if (!src) continue;
            
            // Log for diagnostics
            if (!src.includes('doubleclick') && !src.includes('google')) {
                console.log(`[Coflix] Found iframe source: ${src}`);
            }

            if (src.includes('lecteurvideo')) {
                try {
                    const cleanSrc = fixUrl(src).replace('&ads=true', '');
                    const bridgeUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(cleanSrc)}`;
                    const bridgeRes = await axios.get(bridgeUrl, { timeout: 8000 });
                    
                    if (bridgeRes.data && bridgeRes.data.contents) {
                        const $if = cheerio.load(bridgeRes.data.contents);
                        let playerItems = $if('li[onclick*="showVideo"]');
                        if (!playerItems.length) playerItems = $if("div li[onclick]");

                        playerItems.each((i, ifEl) => {
                            const onClick = $if(ifEl).attr('onclick') || "";
                            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
                            if (base64Match && base64Match[1]) {
                                try {
                                    const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                                    const info = $if(ifEl).find("p").text().trim();
                                    players.push({
                                        name: `${getHostName(decoded)} - ${info || 'Server'}`,
                                        url: fixUrl(decoded),
                                        lang: info.toLowerCase().includes("vostfr") ? "VOSTFR" : "VF",
                                        quality: $if(ifEl).find("span").text().trim() || "HD"
                                    });
                                } catch (e) {}
                            }
                        });
                    }
                } catch (e) {}
            } else if (!src.includes('google') && !src.includes('facebook') && !src.includes('doubleclick') && !src.includes('twitter')) {
                // If it's a direct video iframe (Voe, Upstream, etc.)
                players.push({
                    name: getHostName(src),
                    url: fixUrl(src),
                    lang: "VF",
                    quality: "HD"
                });
            }
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
        const season = parts[2];
        const episode = parts[3];

        if (type === 'movie') {
            const results = await searchCoflix(title, "movie");
            if (results.length === 0) return res.json({ success: true, sources: [] });
            const players = await extractPlayers(results[0].url);
            return res.json({ success: true, tmdbId, sources: players });
        } else {
            // Series/TV logic
            const results = await searchCoflix(title, "series");
            if (results.length === 0) return res.json({ success: true, sources: [] });
            
            let seriesUrl = results[0].url;
            let finalUrl = seriesUrl;

            // If we have season/episode, we need to find the episode link
            if (season && episode) {
                try {
                    // 1. Try common slug patterns first (faster)
                    const seriesSlug = seriesUrl.split('/').filter(Boolean).pop();
                    const slugPatterns = [
                        `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                        `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}-streaming/`,
                        `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`
                    ];

                    for (const pattern of slugPatterns) {
                        const testPlayers = await extractPlayers(pattern);
                        if (testPlayers.length > 0) {
                            return res.json({ success: true, tmdbId, sources: testPlayers });
                        }
                    }

                    // 2. Fallback: Parse the series page for links
                    const seriesRes = await axios.get(seriesUrl, { headers: HEADERS, timeout: 5000 });
                    const $ = cheerio.load(seriesRes.data);
                    const epSearch = `s${season}-e${episode}`;
                    const epSearchLong = `saison-${season}-episode-${episode}`;
                    
                    let foundUrl = "";
                    $('a').each((i, el) => {
                        const href = $(el).attr('href');
                        if (href && (href.toLowerCase().includes(epSearch) || href.toLowerCase().includes(epSearchLong))) {
                            foundUrl = fixUrl(href);
                        }
                    });

                    if (foundUrl) finalUrl = foundUrl;
                } catch (e) {
                    console.error(`[Coflix] Series navigation failed: ${e.message}`);
                }
            }

            const players = await extractPlayers(finalUrl);
            return res.json({ success: true, tmdbId, sources: players });
        }


    } catch (error) {
        console.error("Coflix handler error:", error.message);
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            debug: "Production environments like Vercel are sometimes blocked by Coflix IP filters. Try local testing or a different proxy."
        });
    }
}
