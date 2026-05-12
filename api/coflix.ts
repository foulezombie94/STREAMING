import { IncomingMessage, ServerResponse } from 'http';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Suppress DEP0169 warnings from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning: any) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') return;
  console.warn(warning.name + ': ' + warning.message);
});

const COFLIX_BASE_URL = "https://coflix.date";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": COFLIX_BASE_URL + "/",
    "X-Requested-With": "XMLHttpRequest"
};

interface VercelRequest extends IncomingMessage {
    query: { [key: string]: string | string[] };
}
interface VercelResponse extends ServerResponse {
    status: (code: number) => VercelResponse;
    json: (body: any) => VercelResponse;
}

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

        console.log(`[Coflix Prod] ${type} - ${titleStr} (${tmdbId}) [Year: ${yearStr || '?'}] S${season}E${episode}`);

        // 1. Session Init (Get Cookies)
        let cookies = "";
        try {
            const initRes = await axios.get(COFLIX_BASE_URL + "/", { headers: HEADERS, timeout: 3000 });
            const setCookie = initRes.headers['set-cookie'];
            if (setCookie) cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        } catch (e) {}

        // 2. Search
        const normalized = titleStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const searchUrl = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(normalized)}`;
        const searchRes = await axios.get(searchUrl, { 
            headers: { ...HEADERS, "Cookie": cookies }, 
            timeout: 5000 
        });

        const results = Array.isArray(searchRes.data) ? searchRes.data : [];
        if (results.length === 0) return res.json({ success: true, sources: [] });

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
        
        let pageUrl = target.url;

        // 3. If Series, resolve episode URL
        if (type === 'series' && season && episode) {
            const seriesId = target.ID;
            const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
            try {
                const apiRes = await axios.get(apiPath, { headers: HEADERS, timeout: 4000 });
                if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                    const targetEp = apiRes.data.episodes.find((ep: any) => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        pageUrl = targetEp.links;
                    }
                }
            } catch (err) {}
            
            // Fallback for episode pageUrl if still pointing to series
            if (pageUrl === target.url) {
                const slug = pageUrl.split('/').filter(Boolean).pop();
                pageUrl = `${COFLIX_BASE_URL}/episode/${slug}-${season}x${episode}/`;
            }
        }

        // 4. Extract Players
        console.log(`[Coflix Prod] Extracting from: ${pageUrl}`);
        const pageRes = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(pageRes.data);
        const players: any[] = [];

        // Handle Base64 players (showVideo)
        $('li[onclick*="showVideo"]').each((_, el) => {
            const onclick = $(el).attr('onclick') || "";
            const match = onclick.match(/showVideo\(['"]([^'"]+)['"]/);
            if (match && match[1]) {
                try {
                    const url = Buffer.from(match[1], 'base64').toString('utf8');
                    if (url.includes('xtremestream')) return;
                    
                    const name = new URL(url.startsWith('//') ? 'https:'+url : url).hostname.replace('www.', '').split('.')[0].toUpperCase();
                    const sub = $(el).find('p').text().toLowerCase();
                    
                    players.push({
                        name,
                        url: url.startsWith('//') ? 'https:'+url : url,
                        lang: sub.includes("vostfr") ? "VOSTFR" : (sub.includes("vo") ? "VO" : "VF")
                    });
                } catch (e) {}
            }
        });

        // Handle direct data-url
        $('[data-url], [data-link]').each((_, el) => {
            const url = $(el).attr('data-url') || $(el).attr('data-link');
            if (url && url.includes('http')) {
                players.push({
                    name: new URL(url).hostname.replace('www.', '').split('.')[0].toUpperCase(),
                    url,
                    lang: "VF"
                });
            }
        });

        return res.json({ success: true, sources: players.slice(0, 10) });

    } catch (error: any) {
        console.error("[Coflix Prod Error]", error.message);
        return res.status(200).json({ success: false, error: error.message });
    }
}

