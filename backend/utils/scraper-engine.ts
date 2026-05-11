import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as http from 'http';
import * as https from 'https';

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15"
];

export class ScraperEngine {
    private client: AxiosInstance;
    private maxRetries: number;
    private cookies: string[] = [];

    constructor(baseURL: string, config: { timeout?: number; maxRetries?: number } = {}) {
        this.maxRetries = config.maxRetries || 3;
        
        this.client = axios.create({
            baseURL,
            timeout: config.timeout || 12000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'max-age=0',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
        });
    }

    private getRandomUA(): string {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    private updateCookies(setCookieHeader?: string[]) {
        if (!setCookieHeader) return;
        setCookieHeader.forEach(cookie => {
            const cookieBase = cookie.split(';')[0];
            const cookieName = cookieBase.split('=')[0];
            // Remove old version of the same cookie
            this.cookies = this.cookies.filter(c => !c.startsWith(cookieName + '='));
            this.cookies.push(cookieBase);
        });
    }

    /**
     * Request with Exponential Backoff, UA Rotation and Cookie Management
     */
    async request<T = any>(url: string, options: AxiosRequestConfig = {}): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const headers: any = {
                    'User-Agent': this.getRandomUA(),
                    ...options.headers
                };

                if (this.cookies.length > 0) {
                    headers['Cookie'] = this.cookies.join('; ');
                }

                // Adjust Sec-Fetch-Site based on URL
                if (options.headers?.Referer) {
                    try {
                        const refHost = new URL(options.headers.Referer).hostname;
                        const targetHost = new URL(url.startsWith('http') ? url : (this.client.defaults.baseURL || '') + url).hostname;
                        headers['Sec-Fetch-Site'] = refHost === targetHost ? 'same-origin' : 'cross-site';
                    } catch {
                        headers['Sec-Fetch-Site'] = 'cross-site';
                    }
                }

                const response = await this.client.request({
                    ...options,
                    url,
                    headers
                });

                // Capture cookies for future requests
                this.updateCookies(response.headers['set-cookie']);

                return response.data;
            } catch (error: any) {
                lastError = error;
                
                // If it's a 403, it might be due to missing cookies or blocked UA
                // Don't retry on 404
                if (error.response && error.response.status === 404) {
                    throw error;
                }

                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`[ScraperEngine] Attempt ${attempt + 1} failed for ${url} (Status: ${error.response?.status || 'Error'}). Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Helper for GET requests
     */
    async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return this.request<T>(url, { ...config, method: 'GET' });
    }

    /**
     * Helper for POST requests
     */
    async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        return this.request<T>(url, { ...config, method: 'POST', data });
    }
}
