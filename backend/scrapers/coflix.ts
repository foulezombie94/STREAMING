import * as cheerio from 'cheerio';
import { ScraperEngine } from '../utils/scraper-engine.js';
import { rankResults } from '../utils/similarity.js';
import type { PlayerInfo, SearchResult } from '../utils/types.js';

export class CoflixScraper {
    private engine: ScraperEngine;
    private baseURL = "https://coflix.date";

    constructor() {
        this.engine = new ScraperEngine(this.baseURL, {
            timeout: 12000,
            maxRetries: 2
        });
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

    /**
     * Search for a movie or series
     */
    async search(title: string, type: 'movie' | 'series', year?: string): Promise<SearchResult[]> {
        console.log(`[Coflix] Searching for ${title} (${type})`);

        // 1. Try Suggest API first
        try {
            const suggestData = await this.engine.get(`/suggest.php?query=${encodeURIComponent(title)}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            if (Array.isArray(suggestData)) {
                const results: SearchResult[] = suggestData.map(item => ({
                    title: item.post_title || item.title,
                    url: item.url,
                    type: (item.url.includes('/series/') || item.post_type === 'series') ? 'series' : 'movie'
                }));

                const ranked = rankResults(results, title, year);
                if (ranked.length > 0) return ranked;
            }
        } catch (e: any) {
            console.error(`[Coflix] Suggest API failed: ${e.message}`);
        }

        // 2. Fallback to HTML search
        const html = await this.engine.get(`/?s=${encodeURIComponent(title)}`);
        const $ = cheerio.load(html);
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

        return rankResults(results, title, year);
    }

    /**
     * Extract players from a page (Movie or Episode)
     * Handles both the main page, iframes, and the telecharger bridge
     */
    async extractPlayers(url: string): Promise<PlayerInfo[]> {
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

        // Helper to parse a player element (li or div)
        const parseElement = (el: any, container: any) => {
            const onClick = container(el).attr("onclick") || "";
            const b64 = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            
            if (b64 && b64[1]) {
                try {
                    const decoded = Buffer.from(b64[1], 'base64').toString('utf-8');
                    
                    // Filter: Block xtremestream.xyz as requested
                    if (decoded.includes('xtremestream.xyz')) return;

                    const title = container(el).find("p, .title, span:first-child").first().text().trim();
                    const sub = container(el).find("span, .sub, p:last-child").last().text().trim();
                    
                    players.push({
                        name: this.getHostName(decoded) + (title ? ` (${title})` : ""),
                        url: this.fixUrl(decoded),
                        lang: (title + sub).toLowerCase().includes("vostfr") ? "VOSTFR" : "VF",
                        quality: (title + sub).toLowerCase().includes("hd") ? "HD" : "SD"
                    });
                } catch {}
            }
        };

        // 1. Direct li items with showVideo
        $('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $));

        // 2. Check for the "Telecharger" bridge link (High priority list)
        const teleLink = $('a[href*="telecharger.lecteurvideo.com"]').attr('href');
        if (teleLink) {
            console.log(`[Coflix] Found downloader bridge: ${teleLink}`);
            try {
                const teleHtml = await this.engine.get(this.fixUrl(teleLink), {
                    headers: { 'Referer': url }
                });
                const $tele = cheerio.load(teleHtml);
                $tele('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $tele));
                
                // Also look for direct download/view buttons on tele page
                $tele('a[href*="get_player"], a[href*="view"]').each((_, el) => {
                    const href = $tele(el).attr('href');
                    if (href) {
                        players.push({
                            name: "Direct Source",
                            url: this.fixUrl(href),
                            lang: "VF",
                            quality: "HD"
                        });
                    }
                });
            } catch (e: any) {
                console.error(`[Coflix] Telecharger bridge failed: ${e.message}`);
            }
        }

        // 3. Iframe Bridge (Deep extraction)
        const allIframes = $("iframe").toArray();
        for (const el of allIframes) {
            const src = $(el).attr('src');
            if (!src || src.includes('google') || src.includes('doubleclick') || src.includes('ads') || src.includes('youtube.com') || src.includes('youtu.be')) continue;

            if (src.includes('lecteurvideo') || src.includes('bridge')) {
                try {
                    const bridgeHtml = await this.engine.get(this.fixUrl(src), {
                        headers: { 'Referer': url }
                    });
                    const $if = cheerio.load(bridgeHtml);
                    $if('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, ifEl) => parseElement(ifEl, $if));
                } catch (e: any) {
                    console.error(`[Coflix] Bridge iframe failed: ${e.message}`);
                }
            } else {
                // Direct external player (VOE, Dood, etc.)
                players.push({
                    name: this.getHostName(src),
                    url: this.fixUrl(src),
                    lang: "VF",
                    quality: "HD"
                });
            }
        }

        // De-duplicate by URL
        return Array.from(new Map(players.map(p => [p.url, p])).values());
    }

    /**
     * Resolve series episode using internal API and specific fallback patterns
     */
    async resolveEpisode(seriesUrl: string, season: string, episode: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Resolving S${season}E${episode} for ${seriesUrl}`);
        
        try {
            const html = await this.engine.get(seriesUrl);
            const $ = cheerio.load(html);
            
            // Extract Post ID and Slug for the new API logic
            const postId = $('input#post_id').val() || $('article.post').attr('id')?.replace('post-', '');
            const slugMatch = seriesUrl.match(/\/series\/([^/]+)/);
            const slug = slugMatch ? slugMatch[1] : "";

            // 1. Try WP-JSON API (New priority method)
            if (postId) {
                try {
                    const apiUrl = `/wp-json/apiflix/v1/series/${postId}/${season}`;
                    console.log(`[Coflix] Querying WP-JSON API: ${apiUrl}`);
                    const episodes = await this.engine.get(apiUrl);
                    
                    if (Array.isArray(episodes)) {
                        const targetEp = episodes.find(e => 
                            e.episode_number === episode || 
                            e.title?.toLowerCase().includes(`épisode ${episode}`) ||
                            e.slug?.endsWith(`x${episode}`)
                        );
                        
                        if (targetEp && targetEp.links) {
                            return await this.extractPlayers(this.fixUrl(targetEp.links));
                        }
                    }
                } catch (e: any) {
                    console.error(`[Coflix] WP-JSON API failed: ${e.message}`);
                }
            }

            // 2. Try the legacy AJAX API as second priority
            if (postId) {
                try {
                    const ajaxRes = await this.engine.post('/wp-admin/admin-ajax.php',
                        `action=get_season&post_id=${postId}&season=${season}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    const $ajax = cheerio.load(ajaxRes);
                    let epUrl = "";
                    $ajax('a').each((_, el) => {
                        const text = $ajax(el).text().toLowerCase();
                        const href = $ajax(el).attr('href');
                        if (href && (text === episode || text.includes(`episode ${episode}`))) {
                            epUrl = href;
                        }
                    });
                    if (epUrl) return await this.extractPlayers(this.fixUrl(epUrl));
                } catch (e: any) {
                    console.error(`[Coflix] AJAX API failed: ${e.message}`);
                }
            }

            // 3. Fallback URL Pattern (Statical construction)
            if (slug) {
                const fallbackUrl = `${this.baseURL}/episode/${slug}-${season}x${episode}/`;
                console.log(`[Coflix] Trying fallback URL pattern: ${fallbackUrl}`);
                const players = await this.extractPlayers(fallbackUrl);
                if (players.length > 0) return players;
            }

        } catch (error: any) {
            console.error(`[Coflix] Episode resolution failed: ${error.message}`);
        }

        return [];
    }
}
