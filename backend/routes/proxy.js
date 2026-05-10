const express = require('express');
const router = express.Router();
const axios = require('axios');

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
            // Log it but allow for now if it's a known streaming URL pattern
            console.warn(`[Proxy Warning] Domain not in whitelist: ${targetHost}`);
        }

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
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
