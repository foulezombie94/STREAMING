import { IncomingMessage, ServerResponse } from 'http';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Redis } from '@upstash/redis';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';
import { gotScraping } from 'got-scraping';

// Session configuration - NO global mutable state to avoid race conditions
const getSessionCookies = async () => {
    try {
        return await redis.get("coflix:session_cookies") as string || "";
    } catch (e) { return ""; }
};

const tlsCache = new Map();
const safeSetCache = (key: string, value: any, ttl = 60000) => {
    tlsCache.set(key, value);
    const t = setTimeout(() => {
        tlsCache.delete(key);
        clearTimeout(t);
    }, ttl);
};

const getCacheKey = (url: string, method: string, cookies: string, data?: any) => {
    return `${url}:${method}:${cookies.substring(0, 40)}:${JSON.stringify(data || {})}`;
};

const dedupeCookies = (cookieStr: string) => {
    if (!cookieStr) return "";
    const map = new Map();
    cookieStr.split(';').forEach(c => {
        const parts = c.trim().split('=');
        if (parts.length >= 2) {
            map.set(parts[0], parts.slice(1).join('='));
        }
    });
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
};

// DNS Bypass (Bypass ISP and Vercel DNS blocks)
dns.setServers(['1.1.1.1', '8.8.8.8']);

const customLookup = (hostname: string, options: any, callback: any) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
        return callback(null, hostname, 4);
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return dns.lookup(hostname, options, callback);
    }

    dns.lookup(hostname, options, (err, address, family) => {
        if (!err && address && address !== '127.0.0.1' && address !== '::1') {
            return callback(null, address, family || 4);
        }

        dns.resolve4(hostname, (err2, addresses) => {
            if (!err2 && addresses && addresses.length > 0 && addresses[0]) {
                return callback(null, addresses[0], 4);
            }
            // Ensure we don't call callback with undefined address if possible
            return callback(err || err2 || new Error(`ENOTFOUND: ${hostname}`), null, family || 4);
        });
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

const fetchAxios = async (url: string, options: any = {}, method: 'GET' | 'POST' = 'GET') => {
    const cookies = options.headers?.Cookie || "";
    const response = await axios({
        url,
        method,
        data: options.data,
        headers: { ...HEADERS, ...options.headers, "Cookie": cookies },
        httpsAgent,
        httpAgent,
        timeout: 10000,
        validateStatus: () => true,
        maxRedirects: 5
    });
    return { data: response.data, status: response.status, headers: response.headers };
};

const fetchTLS = async (url: string, options: any = {}, method: 'GET' | 'POST' = 'GET') => {
    const cookies = dedupeCookies(options.headers?.Cookie || "");
    const cacheKey = getCacheKey(url, method, cookies, options.data);

    // 1. Check Cache
    if (tlsCache.has(cacheKey)) return tlsCache.get(cacheKey);

    try {
        // SCAPERAPI STRATEGY: Use residential proxy for all Coflix requests to ensure maximum bypass
        const apiKey = process.env.SCRAPER_API_KEY;
        if (apiKey && (url.includes('coflix') || options.useProxy)) {
            console.log(`[Coflix Proxy] Tunneling request through ScraperAPI: ${url.substring(0, 50)}...`);
            const scraperUrl = `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=fr&keep_headers=true`;
            const response = await axios.get(scraperUrl, { 
                timeout: 12000,
                headers: { 
                    ...HEADERS, 
                    ...options.headers, 
                    "Cookie": cookies 
                }
            });
            
            const output = { data: response.data, status: response.status, headers: response.headers };
            safeSetCache(cacheKey, output);
            return output;
        }

        const response = await gotScraping({
            url,
            method: method as any,
            body: options.data,
            headers: { 
                ...HEADERS, 
                ...options.headers, 
                "Cookie": cookies 
            },
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 124 }],
                devices: ['desktop'],
                locales: ['fr-FR', 'en-US']
            },
            timeout: { request: 10000 },
            retry: { limit: 0 },
            followRedirect: true
        });

        let data = response.body;
        if (typeof data === 'string' && (data.trim().startsWith('{') || data.trim().startsWith('['))) {
            try { data = JSON.parse(data); } catch (e) {}
        }
        
        const output = { 
            data, 
            status: response.statusCode, 
            headers: response.headers 
        };
        
        // 2. Set Cache Robustly
        safeSetCache(cacheKey, output);

        return output;
    } catch (e: any) {
        console.warn(`[Coflix Proxy Error] ${e.message}`);
        return fetchAxios(url, options, method);
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Polyfill for status/json
    if (!res.status) res.status = (code: number) => { res.statusCode = code; return res; };
    if (!res.json) res.json = (body: any) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    try {
        const { path, title, year } = req.query;
        if (!path || !title) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res.status(400).json({ success: false, error: "Missing path or title" });
        }

        const pathStr = Array.isArray(path) ? path[0] : path;
        const titleStr = Array.isArray(title) ? title[0] : title;
        const yearStr = Array.isArray(year) ? year[0] : year;

        const parts = pathStr.split('/').filter(Boolean);
        const type = parts[0] === 'tv' ? 'series' : 'movie';
        const tmdbId = parts[1];
        const season = parts[2];
        const episode = parts[3];
        const isAnime = req.query.isAnime === 'true';

        console.log(`[Coflix Prod] ${type} - ${titleStr} (${tmdbId}) [Year: ${yearStr}] [Animé: ${isAnime}] ${type === 'series' ? `S${season}E${episode}` : ''}`);

        // 0. Cache Check
        const cacheKey = `mv:coflix:${type}:${tmdbId}_${season || '0'}_${episode || '0'}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                console.log(`[Cache Prod] Hit for ${titleStr}`);
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.json({ success: true, sources: cached, cached: true });
            }
        } catch (e) {
            console.error("[Cache Error]", e);
        }

        // 1. Session Management (Persistent via Redis)
        let cookies = "";
        try {
            const cachedCookies = await getSessionCookies();
            if (cachedCookies) {
                cookies = cachedCookies;
                console.log(`[Coflix Prod] Using cached session cookies from Redis`);
            } else {
                const startInitTime = Date.now();
                // Hit home page via TLS to get new session (only if search fails or initially)
                const initRes = await fetchTLS(COFLIX_BASE_URL + "/");
                const setCookie = initRes.headers['set-cookie'] as string[] | undefined;
                if (setCookie) {
                    cookies = dedupeCookies(setCookie.map((c: string) => c.split(';')[0]).join('; '));
                    await redis.set("coflix:session_cookies", cookies, { ex: 3600 }); // Cache for 1 hour
                    console.log(`[Coflix Prod] New session cookies saved (took ${Date.now() - startInitTime}ms)`);
                }
            }
        } catch (e: any) {
            console.error(`[Coflix Prod] Session management failed: ${e.message}`);
        }

        // 2. Search
        const normalizeCoflixQuery = (q: string) => {
            return q.toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        };

        const normalized = normalizeCoflixQuery(titleStr);
        const searchCacheKey = `mv:search:coflix:${normalized}`;
        
        // Tier 0: Search Cache
        try {
            const cachedSearch = await redis.get(searchCacheKey);
            if (cachedSearch) {
                console.log(`[Coflix Prod] Search Cache Hit for ${normalized}`);
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.json({ success: true, sources: cachedSearch, cached: true });
            }
        } catch (e) {}

        const searchUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(normalized)}`;
        const searchRes = await fetchTLS(searchUrl, { 
            headers: { "Cookie": cookies, "X-Requested-With": "XMLHttpRequest" }
        });

        // Capture cookies from search too
        const searchSetCookie = searchRes.headers['set-cookie'] as string[] | undefined;
        if (searchSetCookie) {
            const newCookies = searchSetCookie.map((c: string) => c.split(';')[0]).join('; ');
            if (newCookies !== cookies) {
                cookies = newCookies;
                await redis.set("coflix:session_cookies", cookies, { ex: 3600 });
            }
        }
        if (searchRes.headers['set-cookie']) {
            const searchCookies = (searchRes.headers['set-cookie'] as string[]).map((c: string) => c.split(';')[0]).join('; ');
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
            const url = (r.url || "").toLowerCase();
            
            // Si le post_type est anime/animes ou que l'URL contient "/animes/" ou "/anime/", on le considère comme une série (car il a des saisons/épisodes)
            const isAnimeType = pType === 'anime' || pType === 'animes' || url.includes('/animes/') || url.includes('/anime/');
            
            return {
                ...r,
                type: (pType === 'series' || pType === 'tv' || isAnimeType) ? 'series' : 'movie',
                isAnimeType
            };
        }).filter((r: any) => r.type === type);

        // Similarity ranking (Basic version for self-contained script)
        const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const qNorm = normalize(titleStr);
        
        let ranked = mapped.sort((a: any, b: any) => {
            const aNorm = normalize(a.post_title || a.title || "");
            const bNorm = normalize(b.post_title || b.title || "");
            const aScore = aNorm === qNorm ? 1 : (aNorm.includes(qNorm) ? 0.8 : 0.5);
            const bScore = bNorm === qNorm ? 1 : (bNorm.includes(qNorm) ? 0.8 : 0.5);
            return bScore - aScore;
        });

        // Si c'est un animé, on filtre pour éviter les versions live-action.
        // On détecte la version live-action par l'année dans l'URL (ex: /one-piece-2023/) ou
        // par des mots-clés comme "live", "netflix" dans le titre Coflix.
        if (isAnime && ranked.length > 0) {
            const liveActionKeywords = /live.?action|netflix|\d{4}(?=\/|$)/i;
            const animeFiltered = ranked.filter((r: any) => {
                const url = (r.url || "").toLowerCase();
                const title = normalize(r.post_title || r.title || "");
                // Exclure si l'URL ou le titre contient des indicateurs de live-action
                return !liveActionKeywords.test(url) && !title.includes('live action');
            });

            // Parmi ceux qui restent, on priorise ceux qui sont explicitement des animés (/animes/ ou type anime)
            const exactAnimes = animeFiltered.filter((r: any) => {
                const url = (r.url || "").toLowerCase();
                return url.includes('/animes/') || url.includes('/anime/') || r.isAnimeType;
            });

            if (exactAnimes.length > 0) {
                console.log(`[Coflix Prod] Strict Animé filter match: prioritizing ${exactAnimes.length} exact anime results`);
                ranked = exactAnimes;
            } else if (animeFiltered.length > 0) {
                console.log(`[Coflix Prod] Animé filter: keeping ${animeFiltered.length} non-live-action results`);
                ranked = animeFiltered;
            }
        } else if (!isAnime && ranked.length > 0) {
            // Si ce n'est PAS un animé, on exclut les URLs qui contiennent "/animes/" ou "/anime/"
            const nonAnimes = ranked.filter((r: any) => {
                const url = (r.url || "").toLowerCase();
                return !url.includes('/animes/') && !url.includes('/anime/') && !r.isAnimeType;
            });
            if (nonAnimes.length > 0) {
                console.log(`[Coflix Prod] Non-Animé filter: keeping ${nonAnimes.length} standard series results`);
                ranked = nonAnimes;
            }
        }

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
                const apiRes = await fetchTLS(apiPath, { headers: { "Cookie": cookies } });
                if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                    const targetEp = apiRes.data.episodes.find((ep: any) => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        pageUrl = targetEp.links[0]?.url || pageUrl;
                    }
                }
            } catch (e) {}

            if (pageUrl === target.url) {
                try {
                    const seriesPage = await fetchTLS(target.url, { headers: { "Cookie": cookies } });
                    const $main = cheerio.load(seriesPage.data);
                    const episodeLink = $main(`.episode:contains("T${season}-E${episode}") a`).attr('href')
                                   || $main(`.episode:contains("${season}x${episode}") a`).attr('href')
                                   || $main(`[data-season="${season}"]`).find(`[data-episode="${episode}"] a`).attr('href') 
                                   || $main(`li[data-episode="${episode}"] a`).attr('href')
                                   || $main(`a:contains("Épisode ${episode}")`).attr('href');
                    
                    if (episodeLink) {
                        pageUrl = episodeLink.startsWith('http') ? episodeLink : (COFLIX_BASE_URL + episodeLink);
                    }
                } catch (e: any) {}
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
                        const check = await fetchTLS(p, { headers: { "Cookie": cookies } });
                        if (check.status === 200) {
                            pageUrl = p;
                            break;
                        }
                    } catch (e: any) {}
                }
            }
        }

        // 4. Extract Players (Using Fast CycleTLS for the main page to handle anti-bot)
        console.log(`[Coflix Prod] Final Page URL: ${pageUrl}`);
        const pageRes = await fetchTLS(pageUrl, { headers: { "Cookie": cookies, "Referer": searchUrl } });
        const html = pageRes.data;
        console.log(`[Coflix Prod] Page Title: ${cheerio.load(html)('title').text().trim()} (${Math.round(html.length/1024)}kb)`);
        
        // Anti-bot delay before extraction
        await sleep(2000);

        const players: any[] = [];
        const $ = cheerio.load(html);

        const extractFromContext = (source$: cheerio.CheerioAPI) => {
            // Refined selector: Focus on elements likely to contain player data
            source$('[onclick*="Video"], [onclick*="Player"], [onclick*="show"], [data-url], [data-link], .server, .player-item, iframe').each((_, el) => {
                const onclick = source$(el).attr('onclick') || "";
                const dataUrl = source$(el).attr('data-url') || "";
                const dataLink = source$(el).attr('data-link') || "";
                const dataSrc = source$(el).attr('data-src') || "";
                const href = source$(el).attr('href') || "";
                
                let targetUrl = "";
                
                // Case 1: JS-based injection
                if (onclick.includes('Video') || onclick.includes('Player') || onclick.includes('show')) {
                    const match = onclick.match(/['"]([^'"]+)['"]/);
                    if (match && match[1]) {
                        try {
                           let decoded = match[1];
                           // Try to decode ONLY if it looks like base64
                           const isBase64 = /^[A-Za-z0-9+/=]+$/.test(decoded) && decoded.length > 10;
                           if (isBase64) {
                               decoded = Buffer.from(decoded, 'base64').toString('utf8');
                           }
                           
                           // Validation: Ensure it looks like a URL/Target
                           if (decoded.includes('http') || decoded.startsWith('//') || decoded.includes('.html')) {
                               targetUrl = decoded;
                           }
                        } catch(e) { }
                    }
                } 
                // Case 2: data-url/data-link
                else if (dataUrl || dataLink) {
                    targetUrl = dataUrl || dataLink || "";
                }
                // Case 3: data-src
                else if (dataSrc && (dataSrc.includes('http') || dataSrc.includes('//'))) {
                    targetUrl = dataSrc;
                }
                // Case 4: href fallback
                else if (href && (href.includes('lecteur') || href.includes('video') || href.includes('embed'))) {
                    targetUrl = href;
                }

                if (targetUrl && (targetUrl.includes('http') || targetUrl.startsWith('//'))) {
                    try {
                        const fullUrl = targetUrl.startsWith('//') ? 'https:' + targetUrl : targetUrl;
                        if (fullUrl.includes('xtremestream')) return;

                        const name = new URL(fullUrl).hostname.replace('www.', '').split('.')[0].toUpperCase();
                        const sub = source$(el).text().toLowerCase();
                        
                        players.push({
                            name,
                            url: fullUrl,
                            lang: sub.includes("vostfr") ? "VOSTFR" : (sub.includes("vo") ? "VO" : "VF")
                        });
                    } catch (e) {}
                }
            });
        };

        // Step 1: Initial extraction
        extractFromContext($);

        // 5. Parallel Deep Extraction (Iframes)
        const iframePromises: Promise<void>[] = [];
        $('iframe').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src && !src.includes('google') && !src.includes('facebook')) {
                iframePromises.push((async () => {
                    try {
                        const fixUrl = (u: string) => u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? COFLIX_BASE_URL + u : u);
                        const targetIframe = fixUrl(src);
                        
                        const iframeRes = await fetchTLS(targetIframe, { 
                            headers: { "Referer": pageUrl, "Cookie": cookies },
                            useProxy: true
                        });
                        
                        const $if = cheerio.load(iframeRes.data);
                        const countBefore = players.length;
                        extractFromContext($if);
                        const found = players.length - countBefore;
                        
                        if (found > 0) {
                            console.log(`[Coflix Prod] Deep Extraction Success: Found ${found} players in ${new URL(targetIframe).hostname}`);
                        }
                    } catch (e: any) {
                        console.warn(`[Coflix Prod] Deep extraction failed for ${src.substring(0, 30)}...`);
                    }
                })());
            }
        });
        
        await Promise.all(iframePromises);

        // Deduplicate
        const seen = new Set();
        const finalPlayers = players.filter((p: any) => {
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
            } catch (e: any) {}
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        } else {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }

        return res.json({ success: true, sources: finalPlayers.slice(0, 10) });

    } catch (error: any) {
        console.error("[Coflix Prod Error]", error.message);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.status(200).json({ success: false, error: error.message });
    }
}

