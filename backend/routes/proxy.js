const express = require('express');
const router = express.Router();
const axios = require('axios');
const dns = require('dns');
const https = require('https');
const http = require('http');

// Configure custom DNS servers (Cloudflare and Google)
dns.setServers(['1.1.1.1', '8.8.8.8']);

/**
 * Custom lookup function that uses dns.resolve4 (bypassing system hosts file)
 */
const customLookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // 1. Check if it's an IP already
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
        return callback(null, hostname, 4);
    }

    // 2. Localhost bypass
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return dns.lookup(hostname, options, callback);
    }

    // 3. Try standard DNS first (it's the most reliable)
    dns.lookup(hostname, options, (err, address, family) => {
        if (!err && address && address !== '127.0.0.1' && address !== '::1') {
            return callback(null, address, family || 4);
        }

        // 4. If standard fails or is blocked (127.0.0.1), try public DNS
        dns.resolve4(hostname, (err2, addresses) => {
            if (!err2 && addresses && addresses.length > 0 && addresses[0]) {
                return callback(null, addresses[0], 4);
            }

            // 5. If everything failed, return the original error or a clear NOT FOUND
            return callback(err || err2 || new Error(`ENOTFOUND: Could not resolve ${hostname}`));
        });
    });
};






const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

const ALLOWED_DOMAINS = [
    'gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 
    'media', 'net', 'pro', 'top', 'host', 'box', 'voe', 'uqload', 'vidoza', 'dood', 'upstream', 'fembed', 
    'vidsrc', 'embed', 'frembed', 'coflix', 'lecteurvideo', 'upn.one', 'xtremestream', 'emmmmbed', 'lulustream', 
    'vidmoly', 'mixdrop', 'evoload', 'sendvid', 'sibnet', 'ok.ru', 'streamtape', 'vidoza', 'moly', 'vid', 'load', 'play',
    'stream', 'cloud', 'file', 'storage', 'link', 'click', 'site', 'xyz', 'one', 'to', 're', 'ws', 'li', 'me', 'sh', 'io'
];

router.get('/', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    try {
        const urlObj = new URL(targetUrl);
        const targetHost = urlObj.hostname;
        
        const isWhitelisted = ALLOWED_DOMAINS.some(d => targetHost.includes(d));
        const isIptvRequest = targetUrl.includes('player_api.php') || targetUrl.includes('get.php') || targetUrl.includes('.m3u8');

        if (!isWhitelisted && !isIptvRequest) {
            return res.status(403).send('Access Denied');
        }

        const useBrowserUA = targetUrl.includes('embed') || targetUrl.includes('php');
        const isCoflixRelated = targetUrl.includes('lecteurvideo') || targetUrl.includes('coflix');
        const referer = isCoflixRelated ? 'https://coflix.date/' : (urlObj.origin + '/');
        const origin = isCoflixRelated ? 'https://coflix.date' : urlObj.origin;

        let cookieHeader = '';
        if (isCoflixRelated) {
            try {
                // Pre-warm: get cookies from main domain
                const warmRes = await axios.get('https://coflix.date/', { 
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
            httpsAgent,
            httpAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': referer,
                'Origin': origin,
                'Cookie': cookieHeader,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'iframe',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site'
            },
            timeout: 15000,
            maxRedirects: 5,
            proxy: false
        });



        // Strip security headers that block embedding
        const headers = { ...response.headers };
        const strip = [
            'x-frame-options',
            'content-security-policy',
            'content-security-policy-report-only',
            'x-content-type-options'
        ];
        
        strip.forEach(h => delete headers[h]);

        // Add CORS headers
        res.set(headers);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        
        const contentType = response.headers['content-type'] || '';
        
        if (contentType.includes('text/html')) {
            let body = '';
            response.data.on('data', chunk => body += chunk);
            response.data.on('end', () => {
                // Inject <base> tag to fix relative URLs (like /dl, /assets, etc.)
                const baseTag = `<base href="${urlObj.origin}${urlObj.pathname}">`;
                let processedBody = body;
                
                if (body.includes('<head>')) {
                    processedBody = body.replace('<head>', `<head>${baseTag}`);
                } else if (body.includes('<html>')) {
                    processedBody = body.replace('<html>', `<html><head>${baseTag}</head>`);
                } else {
                    processedBody = baseTag + body;
                }

                // Rewrite any absolute paths that point to root
                processedBody = processedBody.replace(/src="\//g, `src="${urlObj.origin}/`);
                processedBody = processedBody.replace(/href="\//g, `href="${urlObj.origin}/`);

                res.send(processedBody);
            });
        } else {
            response.data.pipe(res);
        }
    } catch (error) {
        console.error(`[Proxy Error] ${targetUrl} -> ${error.message}`);
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

module.exports = router;



