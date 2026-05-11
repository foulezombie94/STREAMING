const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dns = require('dns');
const https = require('https');
const http = require('http');

// Bypass local DNS blocks (like hosts file redirecting to 127.0.0.1)
dns.setServers(['1.1.1.1', '8.8.8.8']);

const customLookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // Try system DNS first
    dns.lookup(hostname, options, (err, address, family) => {
        // If system DNS fails or returns localhost (common for ad-blocking/hosts file), try public DNS
        if (err || address === '127.0.0.1' || address === '::1') {
            dns.resolve4(hostname, (err4, addresses) => {
                if (!err4 && addresses && addresses.length > 0) {
                    return callback(null, addresses[0], 4);
                }
                // CRITICAL FIX: Do not return 127.0.0.1 if it's an external domain.
                // Return a DNS error instead so the application can handle it.
                return callback(err || new Error(`ENOTFOUND: ${hostname} is blocked locally`), null, family);
            });
        } else {
            callback(err, address, family);
        }
    });
};




// Apply custom agents to axios defaults for all routes
axios.defaults.httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
axios.defaults.httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });
axios.defaults.proxy = false; // Disable system proxy to avoid local redirection interference

const app = express();


app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Mount routes
app.use('/api/movix', require('./routes/movix'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/api/coflix', require('./routes/coflix'));

// Diagnostic endpoint for production debugging
app.get('/api/diag', async (req, res) => {
    const report = {
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        platform: process.platform,
        dnsServers: dns.getServers(),
        tests: {}
    };

    // Test 1: DNS Resolution for Coflix
    try {
        const hostname = 'coflix.date';
        const addresses = await new Promise((resolve, reject) => {
            dns.resolve4(hostname, (err, addr) => err ? reject(err) : resolve(addr));
        });
        report.tests.dns_resolve = { status: 'ok', hostname, addresses };
    } catch (e) {
        report.tests.dns_resolve = { status: 'error', error: e.message };
    }

    // Test 2: Direct Axios request to Coflix (with our custom lookup)
    try {
        const start = Date.now();
        const testRes = await axios.get('https://coflix.date/', { timeout: 5000 });
        report.tests.coflix_connectivity = { 
            status: 'ok', 
            time: Date.now() - start,
            statusCode: testRes.status,
            cookies: testRes.headers['set-cookie'] ? 'received' : 'none'
        };
    } catch (e) {
        report.tests.coflix_connectivity = { status: 'error', error: e.message };
    }

    res.json(report);
});

module.exports = app;




