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
    dns.lookup(hostname, options, (err, address, family) => {
        if (err || address === '127.0.0.1' || address === '::1') {
            dns.resolve4(hostname, (err4, addresses) => {
                if (!err4 && addresses && addresses.length > 0) {
                    return callback(null, addresses[0], 4);
                }
                return callback(err || new Error(`ENOTFOUND: ${hostname} is blocked locally`), null, family);
            });
        } else {
            callback(err, address, family);
        }
    });
};

const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

export default async function handler(req, res) {
    // Manual URL parsing to avoid legacy req.query
    const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const testQuery = fullUrl.searchParams.get('test') || 'Star Wars';

    const report = {
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        platform: process.platform,
        dnsServers: dns.getServers(),
        tests: {}
    };


    // Test 1: DNS Resolution
    try {
        const hostname = 'coflix.blue';
        const addresses = await new Promise((resolve, reject) => {
            dns.resolve4(hostname, (err, addr) => err ? reject(err) : resolve(addr));
        });
        report.tests.dns_resolve = { status: 'ok', hostname, addresses };
    } catch (e) {
        report.tests.dns_resolve = { status: 'error', error: e.message };
    }

    // Test 2: Connectivity
    try {
        const start = Date.now();
        const testRes = await axios.get('https://coflix.blue/', { 
            timeout: 5000, 
            proxy: false,
            httpsAgent,
            httpAgent
        });
        report.tests.coflix_connectivity = { 
            status: 'ok', 
            time: Date.now() - start,
            statusCode: testRes.status,
            cookies: testRes.headers['set-cookie'] ? 'received' : 'none'
        };
    } catch (e) {
        report.tests.coflix_connectivity = { status: 'error', error: e.message };
    }

    // Test 3: Search test
    try {
        const query = testQuery;
        const searchUrl = `https://coflix.blue/suggest.php?query=${encodeURIComponent(query)}`;

        const searchRes = await axios.get(searchUrl, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            },
            timeout: 5000,
            proxy: false,
            httpsAgent,
            httpAgent
        });
        report.tests.search_test = { 
            status: 'ok', 
            query,
            resultCount: Array.isArray(searchRes.data) ? searchRes.data.length : 'not_an_array',
            type: typeof searchRes.data
        };
    } catch (e) {
        report.tests.search_test = { status: 'error', error: e.message };
    }

    res.status(200).json(report);
}
