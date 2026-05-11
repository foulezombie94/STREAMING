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

    // Localhost always uses standard lookup
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return dns.lookup(hostname, options, callback);
    }

    // 1. Try resolving via public DNS (bypasses hosts file)
    dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
            return callback(null, addresses[0], 4);
        }
        
        // 2. Fallback to standard lookup but check for loopback hijacking
        dns.lookup(hostname, options, (err2, address, family) => {
            if (err2) {
                return callback(err2);
            }
            if (!address || address === '127.0.0.1' || address === '::1') {
                return callback(new Error(`DNS_BLOCK: ${hostname} resolved to loopback or nothing`));
            }
            callback(null, address, family || 4);
        });
    });
};



const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;

const httpsAgent = isVercel ? undefined : new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = isVercel ? undefined : new http.Agent({ lookup: customLookup, keepAlive: true });


const ALLOWED_DOMAINS = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 'media', 'net', 'pro', 'top', 'host', 'box', 'voe', 'uqload', 'vidoza', 'dood', 'upstream', 'fembed', 'vidsrc', 'embed', 'frembed', 'coflix', 'lecteurvideo'];

export default async function handler(req, res) {
    // Manual URL parsing to avoid legacy req.query
    const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const targetUrl = fullUrl.searchParams.get('url');

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

        // Use a real browser User-Agent for embeds, and Coflix as Referer
        const useBrowserUA = targetUrl.includes('embed') || targetUrl.includes('php');
        const referer = targetUrl.includes('lecteurvideo') || targetUrl.includes('coflix') ? 'https://coflix.date/' : (urlObj.origin + '/');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpsAgent: targetUrl.startsWith('https') ? httpsAgent : undefined,
            httpAgent: targetUrl.startsWith('http') ? httpAgent : undefined,
            headers: {
                'User-Agent': useBrowserUA ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' : 'VLC/3.0.23 LibVLC/3.0.23',
                'Referer': referer,
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
