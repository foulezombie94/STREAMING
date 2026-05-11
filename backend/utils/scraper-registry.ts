import { PlayerInfo } from './types';
import { CoflixScraper } from '../scrapers/coflix';

export class ScraperRegistry {
    private coflix: CoflixScraper;

    constructor() {
        this.coflix = new CoflixScraper();
    }

    /**
     * Unified method to get sources for a movie or episode
     */
    async getSources(type: 'movie' | 'series', title: string, path: string, year?: string): Promise<PlayerInfo[]> {
        console.log(`[ScraperRegistry] Resolving sources for: ${title} (${type})`);
        
        const parts = path.split('/').filter(Boolean);
        const season = parts[2];
        const episode = parts[3];

        try {
            const results = await this.coflix.search(title, type, year);
            if (results.length === 0) return [];

            if (type === 'series' && season && episode) {
                return await this.coflix.resolveEpisode(results[0].url, season, episode);
            } else {
                return await this.coflix.extractPlayers(results[0].url);
            }
        } catch (error: any) {
            console.error(`[ScraperRegistry] Extraction failed: ${error.message}`);
            return [];
        }
    }
}
