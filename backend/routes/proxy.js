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






const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

const ALLOWED_DOMAINS = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 'media', 'net', 'pro', 'top', 'host', 'box', 'voe', 'uqload', 'vidoza', 'dood', 'upstream', 'fembed', 'vidsrc', 'embed', 'frembed', 'coflix', 'lecteurvideo'];

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
        const referer = targetUrl.includes('lecteurvideo') || targetUrl.includes('coflix') ? 'https://coflix.date/' : (urlObj.origin + '/');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            httpsAgent,
            httpAgent,
            headers: {
                'User-Agent': useBrowserUA ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' : 'VLC/3.0.23 LibVLC/3.0.23',
                'Referer': referer,
                'Origin': urlObj.origin
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
        
        response.data.pipe(res);
    } catch (error) {
        console.error(`[Proxy Error] ${targetUrl} -> ${error.message}`);
        res.status(500).send(`Proxy error: ${error.message}`);
    }
});

module.exports = router;



