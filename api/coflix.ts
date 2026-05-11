import { IncomingMessage, ServerResponse } from 'http';
import url from 'url';

// Silence DEP0169 (url.parse) deprecation warning from dependencies like Axios
const originalParse = url.parse;
// @ts-ignore
url.parse = function (urlString: string, ...args: any[]) {
    // @ts-ignore
    return originalParse.call(url, urlString, ...args);
};

import ScraperRegistry from '../backend/utils/scraper-registry.js';

// Define Vercel-like types to avoid missing dependency errors
interface VercelRequest extends IncomingMessage {
    query: { [key: string]: string | string[] };
    body: any;
}
interface VercelResponse extends ServerResponse {
    status: (code: number) => VercelResponse;
    json: (body: any) => VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Mock status and json for standard ServerResponse if not present
        if (!res.status) {
            res.status = (code: number) => {
                res.statusCode = code;
                return res;
            };
        }
        if (!res.json) {
            res.json = (body: any) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(body));
                return res;
            };
        }

        res.setHeader('Access-Control-Allow-Origin', '*');

        const { path, title } = req.query;

        if (!path || !title) {
            return res.status(400).json({ success: false, error: "Missing path or title" });
        }

        const registry = new ScraperRegistry();
        const pathStr = Array.isArray(path) ? path[0] : path;
        const titleStr = Array.isArray(title) ? title[0] : title;

        const parts = pathStr.split('/').filter(Boolean);
        const type = parts[0] as 'movie' | 'series';
        const tmdbId = parts[1];

        console.log(`[API] Processing ${type} request for: ${titleStr} (${pathStr})`);

        const sources = await registry.getSources(type, titleStr, pathStr);

        return res.json({ 
            success: true, 
            tmdbId, 
            sources,
            meta: {
                found: sources.length > 0,
                type,
                path: pathStr
            }
        });

    } catch (error: any) {
        console.error("[Coflix API Error]", error);
        // Ensure res.json is available in catch block too
        const json = res.json ? res.json.bind(res) : (body: any) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
        
        return json({ 
            success: false, 
            error: error.message,
            debug: "Check backend logs for more details."
        });
    }
}
