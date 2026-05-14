import * as cheerio from 'cheerio';
import { ScraperEngine } from '../utils/scraper-engine.js';
import { rankResults, normalizeTitle } from '../utils/similarity.js';
import type { PlayerInfo, SearchResult } from '../utils/types.js';

export class CoflixScraper {
    private engine: ScraperEngine;
    private baseURL = "https://coflix.dance";
    private cache: Map<string, { data: any, timestamp: number }> = new Map();
    private CACHE_TTL = 30 * 60 * 1000; // 30 minutes

    constructor() {
        this.engine = new ScraperEngine(this.baseURL, {
            timeout: 12000,
            maxRetries: 2
        });
    }

    private getCache(key: string) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    private setCache(key: string, data: any) {
        // Prevent memory leaks by limiting cache size
        if (this.cache.size > 100) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    private fixUrl(url: string): string {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return this.baseURL + url;
        return url;
    }

    private getHostName(url: string): string {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return domain.split('.')[0].toUpperCase();
        } catch {
            return "Direct";
        }
    }

    private async ensureSession() {
        if (this.cache.has('session_init')) return;
        try {
            console.log(`[Coflix] Initializing session...`);
            await this.engine.get('/');
            this.cache.set('session_init', { data: true, timestamp: Date.now() });
        } catch (e: any) {
            console.warn(`[Coflix] Session init failed: ${e.message}`);
        }
    }

    /**
     * Search for a movie or series
     */
    async search(title: string, type: 'movie' | 'series', year?: string): Promise<SearchResult[]> {
        await this.ensureSession();
        const normalizedTitle = normalizeTitle(title);
        const cacheKey = `search:${normalizedTitle}:${type}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        console.log(`[Coflix] Searching for ${title} (${type}) -> Query: ${normalizedTitle}`);

        try {
            // Priority 1: Suggestion API (Fast)
            const results: any = await this.engine.get(`/suggest.php?query=${encodeURIComponent(normalizedTitle)}`);
            if (results && Array.isArray(results) && results.length > 0) {
                const mapped = results.map(r => ({
                    title: r.post_title || r.title,
                    url: r.url,
                    type: ((r.url.includes('/series/') || r.post_type === 'series') ? 'series' : 'movie') as 'movie' | 'series'
                }));
                const ranked = rankResults(mapped, title, year);
                if (ranked.length > 0) {
                    const final = ranked.filter(r => r.type === type);
                    if (final.length > 0) {
                        this.setCache(cacheKey, final);
                        return final;
                    }
                }
            }
        } catch (e: any) {
            console.warn(`[Coflix] Suggest API failed, falling back to classic search`);
        }

        // Priority 2: Classic Search Fallback
        try {
            const searchHtml = await this.engine.get(`/?s=${encodeURIComponent(normalizedTitle)}`);
            const $ = cheerio.load(searchHtml);
            const results: SearchResult[] = [];

            $('.result-item').each((_, el) => {
                const link = $(el).find('a').attr('href');
                const pTitle = $(el).find('.title a').text().trim();
                const pYear = $(el).find('.year').text().trim();

                if (link && pTitle) {
                    results.push({
                        title: pTitle,
                        url: link,
                        type: link.includes('/series/') ? 'series' : 'movie',
                        releaseYear: pYear
                    });
                }
            });

            const ranked = rankResults(results, title, year).filter(r => r.type === type);
            this.setCache(cacheKey, ranked);
            return ranked;
        } catch (e: any) {
            console.error(`[Coflix] Search failed: ${e.message}`);
            return [];
        }
    }

    /**
     * Extract players from a page (Movie or Episode)
     */
    async extractPlayers(url: string): Promise<PlayerInfo[]> {
        const cacheKey = `players:${url}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        console.log(`[Coflix] Extracting from ${url}`);
        let html = "";
        try {
            html = await this.engine.get(url);
        } catch (e: any) {
            console.error(`[Coflix] Failed to fetch ${url}: ${e.message}`);
            return [];
        }

        const $ = cheerio.load(html);
        const players: PlayerInfo[] = [];

        // Helper to parse elements
        const parseElement = (el: any, source$: cheerio.CheerioAPI) => {
            const onclick = source$(el).attr('onclick');
            if (onclick && onclick.includes('showVideo')) {
                const match = onclick.match(/showVideo\('([^']+)'/);
                if (match) {
                    try {
                        const decoded = Buffer.from(match[1], 'base64').toString();
                        if (decoded.includes("lecteur1.xtremestream.xyz")) return;

                        const title = source$(el).find('span').text().trim() || "Server";
                        const sub = source$(el).find('p').text().trim();
                        
                        players.push({
                            name: this.getHostName(decoded),
                            url: decoded,
                            lang: sub.toLowerCase().includes("vostfr") ? "VOSTFR" : (sub.toLowerCase().includes("english") ? "VO" : "VF"),
                            quality: (title + sub).toLowerCase().includes("hd") ? "HD" : ""
                        });
                    } catch (e: any) {}
                }
            }
        };

        // 1. Direct li items with showVideo
        $('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $));

        // 2. Iframe Bridge (Deep extraction)
        const allIframes = $("iframe").toArray();
        const bridgeTasks = allIframes.map(async (el) => {
            const src = $(el).attr('src');
            if (!src) return [];
            
            // Allow all iframes to ensure no source is missed
            if (src.includes('youtube.com') || src.includes('youtu.be')) return [];

            if (src.includes('lecteurvideo') || src.includes('bridge') || src.includes('embed.php')) {
                try {
                    const iframePageHtml = await this.engine.get(this.fixUrl(src), { 
                        headers: { 
                            "Referer": "https://coflix.dance/",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
                        }, 
                        timeout: 10000 
                    });
                    const iframePage$ = cheerio.load(iframePageHtml);
                    
                    let playerItems = iframePage$('li[onclick*="showVideo"], a[onclick*="showVideo"], div[onclick*="showVideo"]');
                    
                    if (!playerItems.length) {
                        playerItems = iframePage$('li:has(a[href*="veev.to"]), li:has(a[href*="uqload"]), li:has(a[href*="voe"])');
                    }

                    const extracted: PlayerInfo[] = [];
                    playerItems.each((_, element) => {
                        try {
                            const $element = iframePage$(element);
                            const onClickAttr = $element.attr("onclick") || $element.find('a').attr("onclick") || "";
                            const base64Match = onClickAttr.match(/showVideo\(['"]([^'\"]+)['"]/);

                            if (base64Match && base64Match[1]) {
                                const base64Url = base64Match[1];
                                let decodedUrl = null;
                                try {
                                    decodedUrl = Buffer.from(base64Url, "base64").toString("utf-8");
                                } catch (err: any) {}

                                if (decodedUrl && !decodedUrl.includes("lecteur1.xtremestream.xyz")) {
                                    const quality = $element.find("span").text().trim() || "HD";
                                    let language = "VF";
                                    const info = $element.find("p, span").text().trim().toLowerCase();
                                    if (info.includes("french") || info.includes("vf")) language = "VF";
                                    else if (info.includes("english") || info.includes("vo")) language = "VO";
                                    else if (info.includes("vostfr")) language = "VOSTFR";

                                    extracted.push({
                                        name: this.getHostName(decodedUrl),
                                        url: decodedUrl,
                                        lang: language,
                                        quality: quality
                                    });
                                }
                            } else {
                                const href = $element.attr('href') || $element.find('a').attr('href');
                                if (href && (href.includes('http') || href.includes('//'))) {
                                    const fullUrl = this.fixUrl(href);
                                    extracted.push({
                                        name: this.getHostName(fullUrl),
                                        url: fullUrl,
                                        lang: "VF",
                                        quality: "HD"
                                    });
                                }
                            }
                        } catch (e: any) {}
                    });
                    return extracted;
                } catch(e: any) {
                    console.error(`[Coflix] Iframe fetch error:`, e.message);
                    return [];
                }
            }
            return [];
        });

        const bridgeResults = await Promise.all(bridgeTasks);
        bridgeResults.forEach(res => players.push(...res));

        // Deduplicate
        const seenUrls = new Set();
        const finalPlayers = players.filter(p => {
            if (seenUrls.has(p.url)) return false;
            seenUrls.add(p.url);
            return true;
        });

        this.setCache(cacheKey, finalPlayers);
        return finalPlayers;
    }

    /**
     * Resolve episode page for series
     */
    async resolveEpisode(seriesUrl: string, season: string, episode: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Resolving S${season}E${episode} for ${seriesUrl}`);
        const seriesSlug = seriesUrl.split('/').filter(Boolean).pop();
        
        try {
            const seriesPageHtml = await this.engine.get(seriesUrl);
            const $main = cheerio.load(seriesPageHtml);

            // Priority 1: WP-JSON API (Modern Coflix)
            const apiUrl = `/wp-json/apiflix/v1/series/${seriesSlug}/seasons/${season}/episodes/${episode}`;
            try {
                const apiRes: any = await this.engine.get(apiUrl);
                if (apiRes && apiRes.url) {
                    console.log(`[Coflix] Found episode via WP-JSON API: ${apiRes.url}`);
                    return await this.extractPlayers(apiRes.url);
                }
            } catch (e: any) {}

            // Priority 2: AJAX fallback (Legacy Coflix)
            try {
                const postIdMatch = seriesPageHtml.match(/var\s+post_id\s*=\s*['"](\d+)['"]/i) 
                                 || seriesPageHtml.match(/postid-(\d+)/)
                                 || seriesPageHtml.match(/p=(\d+)/);
                
                const nonceMatch = seriesPageHtml.match(/"nonce"\s*:\s*["']([^"']+)["']/);

                if (postIdMatch) {
                    const postId = postIdMatch[1];
                    const nonce = nonceMatch ? nonceMatch[1] : "";
                    console.log(`[Coflix] Attempting AJAX for post_id: ${postId} (nonce: ${nonce})`);
                    const ajaxRes = await this.engine.post('/wp-admin/admin-ajax.php', 
                        `action=get_episode_player&post_id=${postId}&season=${season}&episode=${episode}&nonce=${nonce}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } }
                    );
                    if (ajaxRes && typeof ajaxRes === 'string' && ajaxRes.includes('iframe')) {
                        const $ = cheerio.load(ajaxRes);
                        const iframeUrl = $('iframe').attr('src');
                        if (iframeUrl) {
                            console.log(`[Coflix] Found episode via AJAX: ${iframeUrl}`);
                            return await this.extractPlayers(this.fixUrl(iframeUrl));
                        }
                    }
                }
            } catch (e: any) {}

            // Priority 3: HTML Fallback (Direct selectors)
            try {
                // Try multiple selector patterns for "The Boys" style pages
                let episodeLink = $main(`.episode:contains("T${season}-E${episode}") a`).attr('href')
                               || $main(`.episode:contains("${season}x${episode}") a`).attr('href')
                               || $main(`[data-season="${season}"]`).find(`[data-episode="${episode}"] a`).attr('href') 
                               || $main(`li[data-episode="${episode}"] a`).attr('href')
                               || $main(`a:contains("Épisode ${episode}")`).attr('href');
                
                if (episodeLink) {
                    console.log(`[Coflix] Found episode via HTML parsing: ${episodeLink}`);
                    return await this.extractPlayers(this.fixUrl(episodeLink));
                }
            } catch (e: any) {}

            // Priority 4: Pattern Match (Deterministic URL)
            const patterns = [
                `https://coflix.dance/episode/${seriesSlug}-${season}x${episode}/`,
                `https://coflix.dance/serie/${seriesSlug}-saison-${season}-episode-${episode}/`,
                `${seriesUrl.replace(/\/$/, '')}-saison-${season}-episode-${episode}/`
            ];

            for (const pattern of patterns) {
                console.log(`[Coflix] Trying deterministic pattern: ${pattern}`);
                const players = await this.extractPlayers(pattern);
                if (players.length > 0) return players;
            }

        } catch (e: any) {
            console.error(`[Coflix] Episode resolution failed for S${season}E${episode}: ${e.message}`);
        }
        return [];
    }
}
