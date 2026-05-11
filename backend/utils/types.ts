export interface PlayerInfo {
    name: string;
    url: string;
    lang: string;
    quality: string;
    score?: number;
}

export interface SearchResult {
    title: string;
    url: string;
    type: 'movie' | 'series';
    releaseYear?: string;
    score?: number;
}

export interface ScraperConfig {
    baseURL: string;
    timeout?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
}
