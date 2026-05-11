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

    constructor(baseURL: string, config: { timeout?: number; maxRetries?: number } = {}) {
        this.maxRetries = config.maxRetries || 3;
        
        this.client = axios.create({
            baseURL,
            timeout: config.timeout || 10000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive'
            }
        });
    }

    private getRandomUA(): string {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    /**
     * Request with Exponential Backoff and UA Rotation
     */
    async request<T = any>(url: string, options: AxiosRequestConfig = {}): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.client.request({
                    ...options,
                    url,
                    headers: {
                        'User-Agent': this.getRandomUA(),
                        ...options.headers
                    }
                });
                return response.data;
            } catch (error: any) {
                lastError = error;
                
                // Don't retry on 404 or certain errors
                if (error.response && [404, 401, 403].includes(error.response.status) && attempt > 0) {
                    throw error;
                }

                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`[ScraperEngine] Attempt ${attempt + 1} failed for ${url}. Retrying in ${delay}ms...`);
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
