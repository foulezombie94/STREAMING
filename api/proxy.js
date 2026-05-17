import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import axios from 'axios';

// Suppress DEP0169 warnings from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') return;
  console.warn(warning.name + ': ' + warning.message);
});

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


const ALLOWED_DOMAINS = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 'media', 'net', 'pro', 'top', 'host', 'box', 'voe', 'uqload', 'vidoza', 'dood', 'upstream', 'fembed', 'vidsrc', 'embed', 'frembed', 'coflix', 'lecteurvideo', 'emmmmbed', 'upn.one'];

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

        // Use a real browser User-Agent for embeds, and Coflix as Referer/Origin
        const useBrowserUA = targetUrl.includes('embed') || targetUrl.includes('php');
        const isCoflixRelated = targetUrl.includes('lecteurvideo') || targetUrl.includes('coflix');
        const referer = isCoflixRelated ? 'https://coflix.dance/' : (urlObj.origin + '/');
        const origin = isCoflixRelated ? 'https://coflix.dance' : urlObj.origin;

        let cookieHeader = '';
        if (isCoflixRelated) {
            try {
                // Pre-warm: get cookies from main domain
                const warmRes = await axios.get('https://coflix.dance/', { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
                    timeout: 3000
                });
                if (warmRes.headers['set-cookie']) {
                    cookieHeader = warmRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                }
            } catch (e) {
                console.warn(`[Proxy Warmup Failed] ${e.message}`);
            }
        }

        const response = await axios({
            method: 'get',
            url: targetUrl.replace('&ads=true', ''), // Remove ads param
            responseType: 'stream',
            httpsAgent: targetUrl.startsWith('https') ? httpsAgent : undefined,
            httpAgent: targetUrl.startsWith('http') ? httpAgent : undefined,
            headers: {
                'User-Agent': useBrowserUA ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' : 'VLC/3.0.23 LibVLC/3.0.23',
                'Referer': referer,
                'Origin': origin,
                'Cookie': cookieHeader,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
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

        req.on('close', () => {
            if (response && response.data) {
                try { response.data.destroy(); } catch (e) {}
            }
        });

        response.data.pipe(res);
    } catch (error) {
        console.error(`[Proxy Error] ${targetUrl} -> ${error.message}`);
        res.status(502).send(`Proxy error: ${error.message}`);
    }
}
