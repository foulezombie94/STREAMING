import { IncomingMessage, ServerResponse } from 'http';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Redis } from '@upstash/redis';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';
import { gotScraping } from 'got-scraping';

// Logging Helper
const debugLog = (msg: string) => {
    if (process.env.DEBUG === 'true') {
        console.log(msg);
    }
};

// Session configuration - NO global mutable state to avoid race conditions
const getSessionCookies = async () => {
    try {
        return await redis.get("coflix:session_cookies") as string || "";
    } catch (e) { return ""; }
};

// SSRF & Security Protection
const isSafeUrl = (urlStr: string): boolean => {
    try {
        const url = new URL(urlStr);
        const host = url.hostname.toLowerCase();

        // 1. Block Localhost & Common Private Ranges
        const blocked = [
            'localhost', '127.0.0.1', '0.0.0.0', '[::1]', 
            '169.254.169.254', 'metadata.google.internal'
        ];
        if (blocked.some(b => host.includes(b))) return false;

        // 2. Block Private IP Patterns (Class A, B, C)
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) return false;
        
        // 3. Block special schemes
        if (!['http:', 'https:'].includes(url.protocol)) return false;

        return true;
    } catch (e) { return false; }
};

const tlsCache = new Map();
const safeSetCache = (key: string, value: any, ttl = 60000) => {
    tlsCache.set(key, value);
    setTimeout(() => {
        tlsCache.delete(key);
    }, ttl);
};

const getCacheKey = (url: string, method: string, cookies: string) => {
    return `${url}:${method}:${cookies.slice(0, 40)}`;
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
dns.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9']);

const httpsAgent = new https.Agent({ keepAlive: true });
const httpAgent = new http.Agent({ keepAlive: true });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Targeted warning filtering (Ignore specific dependency noise only)
process.on('warning', (warning: any) => {
    if (warning.code !== 'DEP0169') {
        console.warn(`${warning.name}: ${warning.message}`);
    }
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
    // SSRF Protection (Hardened)
    if (!isSafeUrl(url)) {
        throw new Error("Blocked URL (Security Violation)");
    }

    const cookies = dedupeCookies(options.headers?.Cookie || "");
    const response = await axios({
        url,
        method,
        data: options.data,
        headers: { ...HEADERS, ...options.headers, "Cookie": cookies },
        httpsAgent,
        httpAgent,
        timeout: 10000,
        validateStatus: (status) => status < 500,
        maxRedirects: 5
    });
    return { data: response.data, status: response.status, headers: response.headers };
};

const fetchTLS = async (url: string, options: any = {}, method: 'GET' | 'POST' = 'GET') => {
    // SSRF Protection (Hardened)
    if (!isSafeUrl(url)) {
        throw new Error("Blocked URL (Security Violation)");
    }

    const cookies = dedupeCookies(options.headers?.Cookie || "");
    const cacheKey = getCacheKey(url, method, cookies);

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

        // 0. Cache Check (Season-based for series, Item-based for movies)
        const isSeries = type === 'series';
        const cacheKey = isSeries 
            ? `mv:coflix:series:${tmdbId}:s${season}` 
            : `mv:coflix:movie:${tmdbId}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                debugLog(`[Cache Prod] Hit for ${titleStr} (${isSeries ? `S${season}` : 'Movie'})`);
                return res.json({ success: true, data: cached, cached: true });
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
                debugLog(`[Coflix Prod] Using cached session cookies from Redis`);
            } else {
                const startInitTime = Date.now();
                // Hit home page via TLS to get new session (only if search fails or initially)
                const initRes = await fetchTLS(COFLIX_BASE_URL + "/");
                const setCookie = initRes.headers?.['set-cookie'] as string[] | undefined;
                if (setCookie) {
                    cookies = dedupeCookies(setCookie.map((c: string) => c.split(';')[0]).join('; '));
                    await redis.set("coflix:session_cookies", cookies, { ex: 3600 }); // Cache for 1 hour
                    debugLog(`[Coflix Prod] New session cookies saved (took ${Date.now() - startInitTime}ms)`);
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
                debugLog(`[Coflix Prod] Search Cache Hit for ${normalized}`);
                return res.json({ success: true, sources: cachedSearch, cached: true });
            }
        } catch (e) {}

        const searchUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(normalized)}`;
        const searchRes = await fetchTLS(searchUrl, { 
            headers: { "Cookie": cookies, "X-Requested-With": "XMLHttpRequest" }
        });

        // Capture cookies from search too
        const searchSetCookie = searchRes.headers?.['set-cookie'] as string[] | undefined;
        if (searchSetCookie) {
            const newRawCookies = searchSetCookie.map((c: string) => c.split(';')[0]).join('; ');
            cookies = dedupeCookies(cookies ? `${cookies}; ${newRawCookies}` : newRawCookies);
            await redis.set("coflix:session_cookies", cookies, { ex: 3600 });
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
        
        // 3. SEASON EXTRACTION LOGIC
        if (isSeries && season) {
            const seriesId = target.ID;
            debugLog(`[Coflix Prod] Extracting full season ${season} for ${titleStr}`);
            
            let episodesList: any[] = [];
            
            // Tier 1: WP-JSON API (Get all episode links at once)
            try {
                const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
                const apiRes = await fetchTLS(apiPath, { headers: { "Cookie": cookies } });
                if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                    episodesList = apiRes.data.episodes.map((ep: any) => ({
                        number: parseInt(ep.number),
                        url: ep.links?.[0]?.url || ""
                    })).filter((ep: any) => ep.url);
                }
            } catch (e) {}

            // Fallback: If API fails, try to scrape the series page for episode list
            if (episodesList.length === 0) {
                try {
                    const seriesPage = await fetchTLS(target.url, { headers: { "Cookie": cookies } });
                    const $main = cheerio.load(seriesPage.data);
                    $main('.episode').each((_, el) => {
                        const text = $main(el).text();
                        const href = $main(el).find('a').attr('href');
                        const match = text.match(/E(\d+)/i) || text.match(/Épisode (\d+)/i);
                        if (match && href) {
                            episodesList.push({
                                number: parseInt(match[1]),
                                url: href.startsWith('http') ? href : (COFLIX_BASE_URL + href)
                            });
                        }
                    });
                } catch (e) {}
            }

            if (episodesList.length === 0) return res.json({ success: false, error: "No episodes found for this season" });

            // 4. Scrape ALL episodes in chunks
            const seasonData: { [key: number]: any[] } = {};
            const chunkSize = 4; // Process 4 episodes at a time

            for (let i = 0; i < episodesList.length; i += chunkSize) {
                const chunk = episodesList.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (ep) => {
                    try {
                        const epRes = await fetchTLS(ep.url, { headers: { "Cookie": cookies } });
                        const $ep = cheerio.load(epRes.data);
                        
                        // Initial extraction from page
                        let epPlayers = extractFromContext($ep);
                        
                        // Deep extraction for this episode
                        const epIframeSources: string[] = [];
                        $ep('iframe').each((_, el) => {
                            const src = $ep(el).attr('src') || $ep(el).attr('data-src');
                            if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter')) {
                                epIframeSources.push(src);
                            }
                        });

                        // Deep extraction (limited to first 2 iframes per episode to save time/resources)
                        const deepRes = await Promise.all(epIframeSources.slice(0, 2).map(async (src) => {
                            try {
                                const targetIframe = src.startsWith('//') ? 'https:' + src : (src.startsWith('/') ? COFLIX_BASE_URL + src : src);
                                const iframeRes = await fetchTLS(targetIframe, { 
                                    headers: { "Referer": ep.url, "Cookie": cookies },
                                    useProxy: true
                                });
                                return extractFromContext(cheerio.load(iframeRes.data));
                            } catch (e) { return []; }
                        }));

                        const seen = new Set();
                        seasonData[ep.number] = [...epPlayers, ...deepRes.flat()].filter(p => {
                            if (!p.url || seen.has(p.url)) return false;
                            seen.add(p.url);
                            return true;
                        }).slice(0, 8);
                        
                        debugLog(`[Coflix Prod] Extracted S${season}E${ep.number}: ${seasonData[ep.number].length} sources`);
                    } catch (e) {
                        debugLog(`[Coflix Prod] Failed S${season}E${ep.number}`);
                    }
                }));
            }

            // Cache and return full season
            await redis.set(cacheKey, seasonData, { ex: 86400 });
            return res.json({ success: true, data: seasonData });
        }

        // 5. MOVIE EXTRACTION LOGIC (Simplified fallback for movies)
        let pageUrl = target.url;
        debugLog(`[Coflix Prod] Final Page URL: ${pageUrl}`);
        const pageRes = await fetchTLS(pageUrl, { headers: { "Cookie": cookies, "Referer": searchUrl } });
        const html = pageRes.data;
        debugLog(`[Coflix Prod] Page Title: ${cheerio.load(html)('title').text().trim()} (${Math.round(html.length/1024)}kb)`);
        
        // Adaptive anti-bot delay
        await sleep(500); 

        const $ = cheerio.load(html);

        const extractFromContext = (source$: cheerio.CheerioAPI): any[] => {
            const extracted: any[] = [];
            // Refined selector: Focus on elements likely to contain player data
            source$('[onclick*="Video"], [onclick*="Player"], [onclick*="show"], [data-url], [data-link], .server, .player-item, iframe').each((_, el) => {
                const onclick = source$(el).attr('onclick') || "";
                const dataUrl = source$(el).attr('data-url') || "";
                const dataLink = source$(el).attr('data-link') || "";
                const dataSrc = source$(el).attr('data-src') || "";
                const href = source$(el).attr('href') || "";
                
                let targetUrl = "";
                
                // Case 1: JS-based injection (Improved regex for varying quotes and separators)
                if (onclick.includes('Video') || onclick.includes('Player') || onclick.includes('show')) {
                    const matches = onclick.matchAll(/['"]([^'"]+)['"]/g);
                    for (const match of matches) {
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
                                   break; // Take the first valid match
                               }
                            } catch(e) { }
                        }
                    }
                } 
                // Case 2: data-url/data-link
                else if (dataUrl || dataLink) {
                    targetUrl = (dataUrl || dataLink || "").trim();
                }
                // Case 3: data-src
                else if (dataSrc && (dataSrc.includes('http') || dataSrc.includes('//'))) {
                    targetUrl = dataSrc.trim();
                }
                // Case 4: href fallback
                else if (href && (href.includes('lecteur') || href.includes('video') || href.includes('embed'))) {
                    targetUrl = href.trim();
                }

                if (targetUrl && (targetUrl.includes('http') || targetUrl.startsWith('//'))) {
                    try {
                        const fullUrl = targetUrl.startsWith('//') ? 'https:' + targetUrl : targetUrl;
                        if (fullUrl.includes('xtremestream')) return;

                        const name = new URL(fullUrl).hostname.replace('www.', '').split('.')[0].toUpperCase();
                        const sub = source$(el).text().toLowerCase();
                        
                        extracted.push({
                            name,
                            url: fullUrl,
                            lang: sub.includes("vostfr") ? "VOSTFR" : (sub.includes("vo") ? "VO" : "VF")
                        });
                    } catch (e) {}
                }
            });
            return extracted;
        };

        // Step 1: Initial extraction
        let allPlayers = extractFromContext($);

        // 5. Parallel Deep Extraction (Iframes) with Native Concurrency Limit (Chunks)
        const iframeSources: string[] = [];
        $('iframe').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('twitter')) {
                iframeSources.push(src);
            }
        });

        // Process in chunks of 3 to avoid saturation
        const chunkSize = 3;
        for (let i = 0; i < iframeSources.length; i += chunkSize) {
            const chunk = iframeSources.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map(async (src) => {
                try {
                    const fixUrl = (u: string) => u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? COFLIX_BASE_URL + u : u);
                    const targetIframe = fixUrl(src);
                    
                    const iframeRes = await fetchTLS(targetIframe, { 
                        headers: { "Referer": pageUrl, "Cookie": cookies },
                        useProxy: true
                    });
                    
                    const $if = cheerio.load(iframeRes.data);
                    const nestedPlayers = extractFromContext($if);
                    
                    if (nestedPlayers.length > 0) {
                        debugLog(`[Coflix Prod] Deep Extraction Success: Found ${nestedPlayers.length} players in ${new URL(targetIframe).hostname}`);
                    }
                    return nestedPlayers;
                } catch (e: any) {
                    debugLog(`[Coflix Prod] Deep extraction failed for ${src.substring(0, 30)}...`);
                    return [];
                }
            }));
            allPlayers = [...allPlayers, ...results.flat()];
        }

        // Deduplicate
        const seen = new Set();
        const finalPlayers = allPlayers.filter((p: any) => {
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
        
        // 6. Cache Save (24h)
        if (finalPlayers.length > 0) {
            try {
                await redis.set(cacheKey, finalPlayers.slice(0, 10), { ex: 86400 });
            } catch (e: any) {}
        }

        return res.json({ success: true, data: finalPlayers.slice(0, 10) });

    } catch (error: any) {
        console.error("[Coflix Prod Error]", error.message);
        return res.status(200).json({ success: false, error: error.message });
    }
}
