import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import axios from 'axios';

// Bypass local DNS blocks
dns.setServers(['1.1.1.1', '8.8.8.8']);

const customLookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // If it's a local address, use standard lookup
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return dns.lookup(hostname, options, callback);
    }

    // For everything else, FORCE public DNS (ignore hosts file)
    dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
            return callback(null, addresses[0], 4);
        }
        // Fallback to standard lookup only if resolve4 fails, 
        // but double check it's not returning 127.0.0.1
        dns.lookup(hostname, options, (err2, address, family) => {
            if (!err2 && address !== '127.0.0.1' && address !== '::1') {
                return callback(null, address, family);
            }
            callback(err || err2 || new Error(`ENOTFOUND: ${hostname} is blocked or unreachable`), null, family);
        });
    });
};


const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

const ALLOWED_DOMAINS = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 'media', 'net', 'pro', 'top', 'host', 'box', 'voe', 'uqload', 'vidoza', 'dood', 'upstream', 'fembed', 'vidsrc', 'embed', 'frembed', 'coflix'];

export default async function handler(req, res) {
    // Vercel Node.js runtime uses (req, res)
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    try {
        const urlObj = new URL(targetUrl);
        const targetHost = urlObj.hostname;
        
        // Security check
        const isWhitelisted = ALLOWED_DOMAINS.some(d => targetHost.includes(d));
        const isIptvRequest = targetUrl.includes('player_api.php') || targetUrl.includes('get.php') || targetUrl.includes('.m3u8');

        if (!isWhitelisted && !isIptvRequest) {
            return res.status(403).send('Access Denied');
        }

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpsAgent: targetUrl.startsWith('https') ? httpsAgent : undefined,
            httpAgent: targetUrl.startsWith('http') ? httpAgent : undefined,
            headers: {
                'User-Agent': 'VLC/3.0.23 LibVLC/3.0.23',
                'Referer': urlObj.origin + '/',
                'Origin': urlObj.origin
            },
            timeout: 15000,
            maxRedirects: 5,
            proxy: false
        });

        // Strip security headers
        const headers = { ...response.headers };
        const strip = ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'x-content-type-options'];
        strip.forEach(h => delete headers[h]);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        
        Object.keys(headers).forEach(key => res.setHeader(key, headers[key]));

        response.data.pipe(res);
    } catch (error) {
        console.error(`[Proxy Error] ${targetUrl} -> ${error.message}`);
        res.status(502).send(`Proxy error: ${error.message}`);
    }
}
