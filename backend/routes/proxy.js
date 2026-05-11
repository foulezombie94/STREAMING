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

router.get('/*', async (req, res) => {
    const targetUrl = req.query.url || req.params[0];
    if (!targetUrl) return res.status(400).send('Missing URL');

    try {
        const urlObj = new URL(targetUrl);
        const targetHost = urlObj.hostname;
        
        // Security check
        const isWhitelisted = ALLOWED_DOMAINS.some(d => targetHost.includes(d));
        if (!isWhitelisted) {
            console.warn(`[Proxy Warning] Domain not in whitelist: ${targetHost}`);
        }

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpsAgent: targetUrl.startsWith('https') ? httpsAgent : undefined,
            httpAgent: targetUrl.startsWith('http') ? httpAgent : undefined,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': urlObj.origin + '/',
                'Origin': urlObj.origin
            },
            timeout: 15000,
            maxRedirects: 5
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
        
        response.data.pipe(res);
    } catch (error) {
        console.error(`[Proxy Error] ${targetUrl} -> ${error.message}`);
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

module.exports = router;



