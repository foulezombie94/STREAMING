import { IncomingMessage, ServerResponse } from 'http';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Redis } from '@upstash/redis';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';

// DNS Bypass (Bypass ISP and Vercel DNS blocks)
dns.setServers(['1.1.1.1', '8.8.8.8']);

const customLookup = (hostname: string, options: any, callback: any) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) return callback(null, addresses[0], 4);
        dns.lookup(hostname, options, callback);
    });
};

const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Suppress DEP0169 warnings from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning: any) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') return;
  console.warn(warning.name + ': ' + warning.message);
});

const COFLIX_BASE_URL = "https://coflix.dance";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
};

interface VercelRequest extends IncomingMessage {
    query: { [key: string]: string | string[] };
}
interface VercelResponse extends ServerResponse {
    status: (code: number) => VercelResponse;
    json: (body: any) => VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Polyfill for status/json
    if (!res.status) res.status = (code: number) => { res.statusCode = code; return res; };
    if (!res.json) res.json = (body: any) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    try {
        const { path, title, year } = req.query;
        if (!path || !title) return res.status(400).json({ success: false, error: "Missing path or title" });

        const pathStr = Array.isArray(path) ? path[0] : path;
        const titleStr = Array.isArray(title) ? title[0] : title;
        const yearStr = Array.isArray(year) ? year[0] : year;

        const parts = pathStr.split('/').filter(Boolean);
        const type = parts[0] === 'tv' ? 'series' : 'movie';
        const tmdbId = parts[1];
        const season = parts[2];
        const episode = parts[3];

        console.log(`[Coflix Prod] ${type} - ${titleStr} (${tmdbId}) [Year: ${yearStr}] ${type === 'series' ? `S${season}E${episode}` : ''}`);

        // 0. Cache Check
        const cacheKey = `mv:coflix:${type}:${tmdbId}_${season || '0'}_${episode || '0'}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                console.log(`[Cache Prod] Hit for ${titleStr}`);
                return res.json({ success: true, sources: cached, cached: true });
            }
        } catch (e) {
            console.error("[Cache Error]", e);
        }

        // 1. Session Management (Persistent via Redis)
        let cookies = "";
        try {
            const cachedCookies = await redis.get<string>("coflix:session_cookies");
            if (cachedCookies) {
                cookies = cachedCookies;
                console.log(`[Coflix Prod] Using cached session cookies from Redis`);
            } else {
                const startInit = Date.now();
                console.log(`[Coflix Prod] No cached session. Initializing new one...`);
                // Hit home page to get new session
                const initRes = await axios.get(COFLIX_BASE_URL + "/", { 
                    headers: HEADERS, 
                    timeout: 5000,
                    httpsAgent,
                    httpAgent
                });
                const setCookie = initRes.headers['set-cookie'];
                if (setCookie) {
                    cookies = setCookie.map(c => c.split(';')[0]).join('; ');
                    await redis.set("coflix:session_cookies", cookies, { ex: 3600 }); // Cache for 1 hour
                    console.log(`[Coflix Prod] New session cookies saved to Redis (init took ${Date.now() - startInit}ms)`);
                    await sleep(1000);
                }
            }
        } catch (e: any) {
            console.error(`[Coflix Prod] Session management failed: ${e.message}`);
        }

        // 2. Search
        const normalizeCoflixQuery = (q: string) => {
            const replacements: Record<string, string> = {
                "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
                "è": "e", "é": "e", "ê": "e", "ë": "e",
                "ì": "i", "í": "i", "î": "i", "ï": "i",
                "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
                "ù": "u", "ú": "u", "û": "u", "ü": "u",
                "ý": "y", "ÿ": "y", "ñ": "n", "ç": "c", "œ": "oe", "æ": "ae"
            };
            let n = q.toLowerCase();
            for (const [s, r] of Object.entries(replacements)) n = n.split(s).join(r);
            return n.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        };

        const normalized = normalizeCoflixQuery(titleStr);
        const searchUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(normalized)}`;
        const searchRes = await axios.get(searchUrl, { 
            headers: { ...HEADERS, "Cookie": cookies, "X-Requested-With": "XMLHttpRequest" }, 
            timeout: 5000,
            httpsAgent,
            httpAgent
        });

        // Capture cookies from search too
        if (searchRes.headers['set-cookie']) {
            const searchCookies = searchRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            cookies = cookies ? `${cookies}; ${searchCookies}` : searchCookies;
        }

        await sleep(1000); // Wait after search

        const results = Array.isArray(searchRes.data) ? searchRes.data : [];
        console.log(`[Coflix Prod] Search returned ${results.length} results for "${titleStr}"`);
        
        if (results.length === 0) {
            console.warn(`[Coflix Prod] No results found for query: ${normalized}`);
            return res.json({ success: true, sources: [] });
        }

        // Filter and Rank
        const mapped = results.map((r: any) => {
            const pType = (r.post_type || "").toLowerCase();
            return {
                ...r,
                type: (pType === 'series' || pType === 'tv') ? 'series' : 'movie'
            };
        }).filter((r: any) => r.type === type);

        // Similarity ranking (Basic version for self-contained script)
        const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const qNorm = normalize(titleStr);
        
        const ranked = mapped.sort((a: any, b: any) => {
            const aNorm = normalize(a.post_title || a.title || "");
            const bNorm = normalize(b.post_title || b.title || "");
            const aScore = aNorm === qNorm ? 1 : (aNorm.includes(qNorm) ? 0.8 : 0.5);
            const bScore = bNorm === qNorm ? 1 : (bNorm.includes(qNorm) ? 0.8 : 0.5);
            return bScore - aScore;
        });

        const target = ranked[0];
        if (!target) return res.json({ success: true, sources: [] });
        
        let pageUrl = target.url;

        // 3. If Series, resolve episode URL
        if (type === 'series' && season && episode) {
            const seriesId = target.ID;
            const seriesSlug = target.url.split('/').filter(Boolean).pop();

            // Tier 1: WP-JSON API
            try {
                const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
                const apiRes = await axios.get(apiPath, { headers: { ...HEADERS, "Cookie": cookies }, timeout: 4000 });
                if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                    const targetEp = apiRes.data.episodes.find((ep: any) => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        pageUrl = targetEp.links.startsWith('http') ? targetEp.links : (COFLIX_BASE_URL + targetEp.links);
                    }
                }
            } catch (err) {}
            
            // Tier 2: Direct Series Page Scraping
            if (pageUrl === target.url) {
                try {
                    const startHtml = Date.now();
                    const seriesPage = await axios.get(target.url, { 
                        headers: { ...HEADERS, "Cookie": cookies }, 
                        timeout: 5000,
                        httpsAgent,
                        httpAgent
                    });
                    const $main = cheerio.load(seriesPage.data);
                    const episodeLink = $main(`.episode:contains("T${season}-E${episode}") a`).attr('href')
                                   || $main(`.episode:contains("${season}x${episode}") a`).attr('href')
                                   || $main(`[data-season="${season}"]`).find(`[data-episode="${episode}"] a`).attr('href') 
                                   || $main(`li[data-episode="${episode}"] a`).attr('href')
                                   || $main(`a:contains("Épisode ${episode}")`).attr('href');
                    
                    if (episodeLink) {
                        pageUrl = episodeLink.startsWith('http') ? episodeLink : (COFLIX_BASE_URL + episodeLink);
                        console.log(`[Coflix Prod] Tier 2 Success: Found episode link in HTML (${Date.now() - startHtml}ms)`);
                    }
                } catch (e: any) {
                    console.warn(`[Coflix Prod] Tier 2 (HTML) failed: ${e.message}`);
                }
            }

            // Tier 3: Deterministic URL Patterns
            if (pageUrl === target.url) {
                const patterns = [
                    `${COFLIX_BASE_URL}/episode/${seriesSlug}-${season}x${episode}/`,
                    `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`,
                    `${COFLIX_BASE_URL}/${seriesSlug}-saison-${season}-episode-${episode}/`
                ];
                
                for (const p of patterns) {
                    try {
                        const check = await axios.head(p, { headers: { ...HEADERS, "Cookie": cookies }, timeout: 3000 });
                        if (check.status === 200) {
                            pageUrl = p;
                            break;
                        }
                    } catch (e) {}
                }
            }
        }

        // 4. Extract Players
        console.log(`[Coflix Prod] Final Page URL: ${pageUrl}`);
        const pageRes = await axios.get(pageUrl, { 
            headers: { 
                ...HEADERS, 
                "Cookie": cookies,
                "Referer": searchUrl, // More realistic Referer chain
                "Sec-Fetch-Site": "same-origin"
            }, 
            timeout: 8000,
            httpsAgent,
            httpAgent
        });
        const $ = cheerio.load(pageRes.data);
        const players: any[] = [];

        const extractFromContext = (source$: cheerio.CheerioAPI) => {
            source$('li[onclick*="showVideo"], div[onclick*="showVideo"], a[onclick*="showVideo"]').each((_, el) => {
                const onclick = source$(el).attr('onclick') || "";
                const match = onclick.match(/showVideo\(['"]([^'"]+)['"]/);
                if (match && match[1]) {
                    try {
                        const url = Buffer.from(match[1], 'base64').toString('utf8');
                        if (url.includes('xtremestream')) return;
                        
                        const fullUrl = url.startsWith('//') ? 'https:' + url : url;
                        const name = new URL(fullUrl).hostname.replace('www.', '').split('.')[0].toUpperCase();
                        const sub = source$(el).find('p, span').text().toLowerCase();
                        
                        players.push({
                            name,
                            url: fullUrl,
                            lang: sub.includes("vostfr") ? "VOSTFR" : (sub.includes("vo") ? "VO" : "VF")
                        });
                    } catch (e) {}
                }
            });

            // Handle direct data-url
            source$('[data-url], [data-link], .server').each((_, el) => {
                const url = source$(el).attr('data-url') || source$(el).attr('data-link');
                if (url && url.includes('http')) {
                    try {
                        const fullUrl = url.startsWith('//') ? 'https:' + url : url;
                        players.push({
                            name: new URL(fullUrl).hostname.replace('www.', '').split('.')[0].toUpperCase(),
                            url: fullUrl,
                            lang: "VF"
                        });
                    } catch (e) {}
                }
            });
        };

        // Step 1: Initial extraction
        extractFromContext($);

        // Update cookies from page response if any
        if (pageRes.headers['set-cookie']) {
            const newCookies = pageRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            cookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
        }

        // Step 2: Iframe extraction
        await sleep(1500); // Give it a moment to "load" conceptually
        const iframes = $('iframe').toArray();
        for (const iframe of iframes) {
            const src = $(iframe).attr('src');
            if (!src || src.includes('youtube') || src.includes('youtu.be')) continue;

            if (src.includes('lecteurvideo') || src.includes('bridge') || src.includes('embed.php')) {
                try {
                    const startIframe = Date.now();
                    const fixUrl = (u: string) => u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? COFLIX_BASE_URL + u : u);
                    const targetIframe = fixUrl(src);
                    
                    const iframeRes = await axios.get(targetIframe, { 
                        headers: { 
                            ...HEADERS, 
                            "Referer": pageUrl, 
                            "Cookie": cookies,
                            "Sec-Fetch-Dest": "iframe",
                            "Sec-Fetch-Mode": "navigate",
                            "Sec-Fetch-Site": "cross-site"
                        }, 
                        timeout: 5000,
                        httpsAgent,
                        httpAgent
                    });
                    
                    const $if = cheerio.load(iframeRes.data);
                    const countBefore = players.length;
                    extractFromContext($if);
                    const found = players.length - countBefore;
                    
                    console.log(`[Coflix Prod] Iframe Bridge [${targetIframe.substring(0, 40)}...] extracted ${found} players in ${Date.now() - startIframe}ms`);
                } catch (e: any) {
                    console.warn(`[Coflix Prod] Iframe extraction failed for ${src.substring(0, 40)}... : ${e.message}`);
                }
            }
        }

        // Deduplicate
        const seen = new Set();
        const finalPlayers = players.filter(p => {
            if (!p.url || seen.has(p.url)) return false;
            seen.add(p.url);
            return true;
        });

        console.log(`[Coflix Prod] Final count: ${finalPlayers.length} players found for ${titleStr}`);
        if (finalPlayers.length === 0) {
            console.error(`[Coflix Prod] EXTRACTION FAILURE: No players found on page ${pageUrl}`);
            // Log a snippet of the HTML for debugging if possible (limit length)
            console.log(`[Coflix Prod] HTML Preview: ${$.html().substring(0, 500)}...`);
        }
        
        // 5. Cache Save (24h)
        if (finalPlayers.length > 0) {
            try {
                await redis.set(cacheKey, finalPlayers.slice(0, 10), { ex: 86400 });
            } catch (e) {}
        }

        return res.json({ success: true, sources: finalPlayers.slice(0, 10) });

    } catch (error: any) {
        console.error("[Coflix Prod Error]", error.message);
        return res.status(200).json({ success: false, error: error.message });
    }
}

