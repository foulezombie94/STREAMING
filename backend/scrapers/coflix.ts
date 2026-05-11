import * as cheerio from 'cheerio';
import { ScraperEngine } from '../utils/scraper-engine.js';
import { rankResults, normalizeTitle } from '../utils/similarity.js';
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
        const normalized = normalizeTitle(title);
        console.log(`[Coflix] Searching for ${normalized} (${type})`);

        try {
            const suggestData = await this.engine.get(`/suggest.php?query=${encodeURIComponent(normalized)}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            if (Array.isArray(suggestData)) {
                const results: SearchResult[] = suggestData.map(item => ({
                    title: item.post_title || item.title,
                    url: item.url,
                    type: (item.url.includes('/serie/') || item.post_type === 'series') ? 'series' : 'movie',
                    releaseYear: item.year
                }));

                const ranked = rankResults(results, title, year);
                if (ranked.length > 0) return ranked;
            }
        } catch (e: any) {
            console.error(`[Coflix] Search API failed: ${e.message}`);
        }

        // Fallback to HTML search
        try {
            const html = await this.engine.get(`/?s=${encodeURIComponent(normalized)}`);
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
                        type: link.includes('/serie/') ? 'series' : 'movie',
                        releaseYear: pYear
                    });
                }
            });

            return rankResults(results, title, year);
        } catch {
            return [];
        }
    }

    /**
     * Extract players from a page (Movie or Episode)
     */
    async extractPlayers(url: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Extracting from ${url}`);
        let html = "";
        try {
            html = await this.engine.get(url);
        } catch { return []; }

        const $ = cheerio.load(html);
        const players: PlayerInfo[] = [];

        const parseElement = (el: any, container: any) => {
            const onClick = container(el).attr("onclick") || "";
            const b64 = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            
            if (b64 && b64[1]) {
                try {
                    const decoded = Buffer.from(b64[1], 'base64').toString('utf-8');
                    if (decoded.includes('youtube.com') || decoded.includes('youtu.be')) return;

                    const title = container(el).find("p, .title, span:first-child").first().text().trim();
                    const sub = container(el).find("span, .sub, p:last-child").last().text().trim();
                    const info = (title + " " + sub).toLowerCase();
                    
                    let lang = "VF";
                    if (info.includes("vostfr")) lang = "VOSTFR";
                    else if (info.includes("english") || info.includes("vo")) lang = "VO";

                    players.push({
                        name: this.getHostName(decoded) + (title ? ` (${title})` : ""),
                        url: this.fixUrl(decoded),
                        lang: lang as any,
                        quality: info.includes("hd") ? "HD" : "SD"
                    });
                } catch {}
            }
        };

        // 1. Direct items
        $('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $));

        // 2. Downloader Bridge
        const teleLink = $('a[href*="telecharger.lecteurvideo.com"]').attr('href');
        if (teleLink) {
            try {
                const teleHtml = await this.engine.get(this.fixUrl(teleLink), { headers: { 'Referer': url } });
                const $tele = cheerio.load(teleHtml);
                $tele('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, el) => parseElement(el, $tele));
            } catch {}
        }

        // 3. Iframes
        const iframes = $("iframe, article iframe, main iframe").toArray();
        for (const el of iframes) {
            const src = $(el).attr('src');
            if (!src || src.includes('google') || src.includes('youtube') || src.includes('ads')) continue;

            if (src.includes('lecteurvideo') || src.includes('bridge')) {
                try {
                    const bHtml = await this.engine.get(this.fixUrl(src), { headers: { 'Referer': url } });
                    const $if = cheerio.load(bHtml);
                    $if('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((_, ifEl) => parseElement(ifEl, $if));
                } catch {}
            } else {
                players.push({
                    name: this.getHostName(src),
                    url: this.fixUrl(src),
                    lang: "VF",
                    quality: "HD"
                });
            }
        }

        return Array.from(new Map(players.map(p => [p.url, p])).values());
    }

    /**
     * Resolve series episode using modern WP-JSON API
     */
    async resolveEpisode(seriesUrl: string, season: string, episode: string): Promise<PlayerInfo[]> {
        console.log(`[Coflix] Resolving S${season}E${episode}`);
        try {
            const html = await this.engine.get(seriesUrl);
            const $ = cheerio.load(html);
            const postId = $('input#post_id').val() || $('article.post').attr('id')?.replace('post-', '');

            if (postId) {
                // Try the modern JSON API from legacy code
                try {
                    const apiData = await this.engine.get(`/wp-json/apiflix/v1/series/${postId}/${season}`);
                    if (apiData && Array.isArray(apiData.episodes)) {
                        const ep = apiData.episodes.find((e: any) => parseInt(e.number) === parseInt(episode));
                        if (ep && ep.links) return this.extractPlayers(this.fixUrl(ep.links));
                    }
                } catch {}

                // Fallback to AJAX
                try {
                    const ajaxRes = await this.engine.post('/wp-admin/admin-ajax.php',
                        `action=get_season&post_id=${postId}&season=${season}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    const $ajax = cheerio.load(ajaxRes);
                    let epUrl = "";
                    $ajax('a').each((_, el) => {
                        const t = $(el).text().toLowerCase();
                        if (t === episode || t.includes(`episode ${episode}`)) epUrl = $(el).attr('href') || "";
                    });
                    if (epUrl) return this.extractPlayers(this.fixUrl(epUrl));
                } catch {}
            }
        } catch {}

        return [];
    }
}
