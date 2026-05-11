import * as cheerio from 'cheerio';
import { ScraperEngine } from '../utils/scraper-engine.js';
import { rankResults } from '../utils/similarity.js';
import { PlayerInfo, SearchResult } from '../utils/types.js';

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
     */
    async extractPlayers(url: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Extracting from ${url}`);
        const html = await this.engine.get(url);
        const $ = cheerio.load(html);
        const players: PlayerInfo[] = [];

        // Method 1: Base64 Decoding (showVideo)
        $('li[onclick*="showVideo"]').each((_, el) => {
            const onClick = $(el).attr("onclick") || "";
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            if (base64Match && base64Match[1]) {
                try {
                    const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                    const info = $(el).find("p").text().trim();
                    players.push({
                        name: this.getHostName(decoded),
                        url: this.fixUrl(decoded),
                        lang: info.toLowerCase().includes("vostfr") ? "VOSTFR" : "VF",
                        quality: "HD"
                    });
                } catch { }
            }
        });

        // Method 2: Deep Iframe Extraction
        // Targeted selector based on architecture guide
        const targetIframe = $("main div div div article div:nth-child(2) div:nth-child(1) aside div div iframe");
        const allIframes = targetIframe.length ? targetIframe.toArray() : $("iframe").toArray();

        const iframePromises = allIframes.map(async (el) => {
            const src = $(el).attr('src');
            if (!src || src.includes('google') || src.includes('doubleclick')) return [];

            // If it's the internal bridge player
            if (src.includes('lecteurvideo')) {
                try {
                    const bridgeHtml = await this.engine.get(this.fixUrl(src), {
                        headers: { 'Referer': url }
                    });
                    const $if = cheerio.load(bridgeHtml);
                    const subPlayers: PlayerInfo[] = [];

                    $if('li[onclick*="showVideo"]').each((_, ifEl) => {
                        const onClick = $if(ifEl).attr('onclick') || "";
                        const b64 = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
                        if (b64 && b64[1]) {
                            const decoded = Buffer.from(b64[1], 'base64').toString('utf-8');
                            const info = $if(ifEl).find("p").text().trim();
                            subPlayers.push({
                                name: this.getHostName(decoded),
                                url: this.fixUrl(decoded),
                                lang: info.toLowerCase().includes("vostfr") ? "VOSTFR" : "VF",
                                quality: $if(ifEl).find("span").text().trim() || "HD"
                            });
                        }
                    });
                    return subPlayers;
                } catch (e: any) {
                    console.error(`[Coflix] Bridge extraction failed: ${e.message}`);
                }
            }

            // Direct external player
            return [{
                name: this.getHostName(src),
                url: this.fixUrl(src),
                lang: "VF",
                quality: "HD"
            }];
        });

        const results = await Promise.all(iframePromises);
        results.forEach(res => players.push(...res));

        // De-duplicate
        return Array.from(new Map(players.map(p => [p.url, p])).values());
    }

    /**
     * Resolve series episode using internal API
     */
    async resolveEpisode(seriesUrl: string, season: string, episode: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Resolving S${season}E${episode} for ${seriesUrl}`);

        const html = await this.engine.get(seriesUrl);
        const $ = cheerio.load(html);

        // Extract Internal IDs for API calls
        const postId = $('input#post_id').val() || $('article.post').attr('id')?.replace('post-', '');

        if (postId) {
            try {
                // Query hidden API for season data
                const apiRes = await this.engine.post('/wp-admin/admin-ajax.php',
                    `action=get_season&post_id=${postId}&season=${season}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );

                const $api = cheerio.load(apiRes);
                let epUrl = "";

                $api('a').each((_, el) => {
                    const text = $(el).text().toLowerCase();
                    const href = $(el).attr('href');
                    if (href && (text === episode || text.includes(`episode ${episode}`))) {
                        epUrl = href;
                    }
                });

                if (epUrl) return this.extractPlayers(this.fixUrl(epUrl));
            } catch (e: any) {
                console.error(`[Coflix] Internal API navigation failed: ${e.message}`);
            }
        }

        // Fallback: Pattern matching on links
        let fallbackUrl = "";
        $(`a`).each((_, el) => {
            const href = $(el).attr('href') || "";
            if (href.includes(`-saison-${season}-episode-${episode}`)) {
                fallbackUrl = this.fixUrl(href);
            }
        });

        if (fallbackUrl) return this.extractPlayers(fallbackUrl);

        return [];
    }
}
