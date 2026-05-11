import dns from 'dns';
import axios from 'axios';

export default async function handler(req, res) {
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

    // Test 2: Direct Axios request to Coflix
    try {
        const start = Date.now();
        const testRes = await axios.get('https://coflix.date/', { timeout: 5000, proxy: false });
        report.tests.coflix_connectivity = { 
            status: 'ok', 
            time: Date.now() - start,
            statusCode: testRes.status,
            cookies: testRes.headers['set-cookie'] ? 'received' : 'none'
        };
    } catch (e) {
        report.tests.coflix_connectivity = { status: 'error', error: e.message };
    }

    res.status(200).json(report);
}
