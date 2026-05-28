const os = require('os');
const cluster = require('cluster');
const axios = require('axios');

// Config Dashboard URLs
const DASHBOARD_BASE = process.env.DASHBOARD_URL_BASE || 'http://localhost:25567';
const TELEMETRY_URL = `${DASHBOARD_BASE}/api/telemetry`;
const BLOCKED_IPS_URL = `${DASHBOARD_BASE}/api/blocked-ips`;

// Local firewall cache
const localBlockedIps = new Set();

// Local aggregates for telemetry reporting window (5 seconds)
let intervalRequests = 0;
let intervalLatencySum = 0;
let statusCodesCount = {};
let intervalEndpoints = {};
const ipRequestsMap = new Map();
const ipIntervalRequests = new Map(); // Track requests in the current 5s reporting window
const activeAlerts = [];

// Sliding window config for spam detection (10 seconds)
const SPAM_WINDOW_MS = 10000;
const SPAM_CRITICAL_LIMIT = 100; // requests per 10s
const SPAM_WARNING_LIMIT = 50;  // requests per 10s

// Prevent spamming the dashboard alerts panel with repeated alerts for the same IP
const alertedIPs = new Map(); // ip -> { lastAlertTime, lastStatus }

// Robust IP extraction and normalization helper
function getClientIp(req) {
  let rawIp = req.headers['cf-connecting-ip'] || 
              req.headers['x-real-ip'] || 
              req.headers['x-forwarded-for'] || 
              req.socket.remoteAddress || 
              '127.0.0.1';
           
  // If X-Forwarded-For contains a list of proxies, extract the first (client) IP
  if (typeof rawIp === 'string' && rawIp.includes(',')) {
    rawIp = rawIp.split(',')[0].trim();
  }
  
  let ip = rawIp;
  // Clean IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 -> 127.0.0.1)
  if (typeof rawIp === 'string' && rawIp.startsWith('::ffff:')) {
    ip = rawIp.substring(7);
  }
  
  // Normalize localhost IPv6 to IPv4 so local blocking handles both ::1 and 127.0.0.1 consistently
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  
  return ip;
}

// 1. Fetch Blocklist periodically (every 10 seconds)
async function syncBlocklist() {
  try {
    const response = await axios.get(BLOCKED_IPS_URL, { timeout: 2000 });
    if (Array.isArray(response.data)) {
      localBlockedIps.clear();
      response.data.forEach(ip => localBlockedIps.add(ip));
    }
  } catch (error) {
    // Silent catch if dashboard is offline
  }
}
syncBlocklist();
setInterval(syncBlocklist, 10000);

// Periodically clean up inactive IPs to prevent memory leaks (every 30s)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestsMap.entries()) {
    if (now - data.lastSeen > 60000) { // Inactive for 1 minute
      ipRequestsMap.delete(ip);
      ipIntervalRequests.delete(ip);
      alertedIPs.delete(ip);
    }
  }
}, 30000);

// Express middleware to capture response speed and enforce the firewall
function telemetryMiddleware(req, res, next) {
  const start = process.hrtime();
  const cleanIp = getClientIp(req);
  const now = Date.now();

  // 2. Enforce Firewall (Block IP check)
  if (localBlockedIps.has(cleanIp)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Votre adresse IP a été bloquée par le pare-feu du système Sentry (Spam / Abus).'
    });
  }

  // 3. IP frequency check (spam detection)
  if (!ipRequestsMap.has(cleanIp)) {
    ipRequestsMap.set(cleanIp, { timestamps: [], lastSeen: now, status: 'normal' });
  }
  const ipData = ipRequestsMap.get(cleanIp);
  ipData.timestamps.push(now);
  ipData.lastSeen = now;

  // Track request counts in current 5-second telemetry interval
  ipIntervalRequests.set(cleanIp, (ipIntervalRequests.get(cleanIp) || 0) + 1);

  // Filter timestamps to the sliding window (last 10s)
  ipData.timestamps = ipData.timestamps.filter(t => now - t < SPAM_WINDOW_MS);
  
  const recentRequestCount = ipData.timestamps.length;
  let currentStatus = 'normal';

  if (recentRequestCount >= SPAM_CRITICAL_LIMIT) {
    currentStatus = 'spamming';
  } else if (recentRequestCount >= SPAM_WARNING_LIMIT) {
    currentStatus = 'suspicious';
  }
  
  ipData.status = currentStatus;

  // Generate spam/rate-limit alerts
  const prevAlert = alertedIPs.get(cleanIp);
  const shouldAlert = !prevAlert || 
                     prevAlert.lastStatus !== currentStatus || 
                     (currentStatus !== 'normal' && now - prevAlert.lastAlertTime > 15000); // Remind every 15s

  if (shouldAlert && currentStatus !== 'normal') {
    const level = currentStatus === 'spamming' ? 'critical' : 'warning';
    const workerLabel = cluster.isWorker ? `[Worker ${cluster.worker.id}]` : '';
    const message = level === 'critical'
      ? `${workerLabel} Alerte SPAM: L'IP ${cleanIp} a envoyé ${recentRequestCount} requêtes en 10 secondes !`
      : `${workerLabel} Suspicion de spam: L'IP ${cleanIp} effectue ${recentRequestCount} requêtes en 10 secondes.`;
    
    activeAlerts.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      category: 'spam'
    });

    alertedIPs.set(cleanIp, { lastAlertTime: now, lastStatus: currentStatus });
  }

  // 4. Track latency and status codes on response finish
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert nanoseconds to milliseconds

    intervalRequests++;
    intervalLatencySum += durationMs;

    const status = res.statusCode;
    statusCodesCount[status] = (statusCodesCount[status] || 0) + 1;

    // Track endpoint metrics (group by route prefix, e.g., /api/movix, /api/proxy)
    const urlPath = (req.originalUrl || req.url).split('?')[0];
    const pathSegments = urlPath.split('/');
    const routeKey = pathSegments.slice(0, 3).join('/') || '/'; // e.g. /api/movix

    if (!intervalEndpoints[routeKey]) {
      intervalEndpoints[routeKey] = { requests: 0, latencySum: 0, errors: 0 };
    }
    intervalEndpoints[routeKey].requests++;
    intervalEndpoints[routeKey].latencySum += durationMs;

    // System Alert for Server Errors (5xx)
    if (status >= 500) {
      intervalEndpoints[routeKey].errors++;
      const workerLabel = cluster.isWorker ? `[Worker ${cluster.worker.id}] ` : '';
      activeAlerts.push({
        timestamp: new Date().toISOString(),
        level: 'critical',
        message: `${workerLabel}Erreur Serveur HTTP ${status} sur ${req.method} ${urlPath}`,
        category: 'error'
      });
    }
  });

  next();
}

// Telemetry report interval (runs every 5 seconds)
setInterval(async () => {
  const timestamp = new Date().toISOString();
  
  // Compute performance metrics
  const avgLatency = intervalRequests > 0 ? (intervalLatencySum / intervalRequests) : 0;
  const stats = {
    requestCount: intervalRequests,
    averageLatency: avgLatency,
    statusCodes: { ...statusCodesCount }
  };

  // Extract endpoints and copy
  const endpointsReport = { ...intervalEndpoints };

  // Reset aggregates
  intervalRequests = 0;
  intervalLatencySum = 0;
  statusCodesCount = {};
  intervalEndpoints = {};

  // Compute CPU load from system averages
  const cpus = os.cpus();
  const numCpus = cpus.length || 1;
  const loadAvg = os.loadavg()[0];
  const cpuLoad = Math.min(100, Math.round((loadAvg / numCpus) * 100));

  // Compute memory usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const processMem = process.memoryUsage().rss;

  const system = {
    cpuLoad,
    memoryUsage: {
      total: totalMem,
      free: freeMem,
      process: processMem
    },
    workerId: cluster.isWorker ? cluster.worker.id : 'master'
  };

  // Build active IP stats
  const ipStats = {};
  const now = Date.now();
  for (const [ip, count] of ipIntervalRequests.entries()) {
    const ipData = ipRequestsMap.get(ip);
    ipStats[ip] = {
      intervalCount: count, // Report how many requests were processed by this worker in this 5s tick
      lastSeen: new Date(ipData.lastSeen).toISOString(),
      status: ipData.status,
      requestsPerSecond: ipData.timestamps.length / (SPAM_WINDOW_MS / 1000)
    };
  }

  // Clear interval IP counts for the next window
  ipIntervalRequests.clear();

  // System resource alerts
  const memoryUsedPercent = ((totalMem - freeMem) / totalMem) * 100;
  const workerLabel = cluster.isWorker ? `[Worker ${cluster.worker.id}]` : '';
  
  if (cpuLoad > 90) {
    activeAlerts.push({
      timestamp,
      level: 'critical',
      message: `${workerLabel} Surcharge processeur critique: CPU à ${cpuLoad}% !`,
      category: 'system'
    });
  } else if (cpuLoad > 75) {
    activeAlerts.push({
      timestamp,
      level: 'warning',
      message: `${workerLabel} Charge processeur élevée: CPU à ${cpuLoad}%.`,
      category: 'system'
    });
  }

  if (memoryUsedPercent > 92) {
    activeAlerts.push({
      timestamp,
      level: 'critical',
      message: `${workerLabel} Saturation de la RAM: ${memoryUsedPercent.toFixed(1)}% utilisé !`,
      category: 'system'
    });
  } else if (memoryUsedPercent > 80) {
    activeAlerts.push({
      timestamp,
      level: 'warning',
      message: `${workerLabel} Utilisation RAM élevée: ${memoryUsedPercent.toFixed(1)}% utilisé.`,
      category: 'system'
    });
  }

  // Extract alerts list
  const alertsToSend = [...activeAlerts];
  activeAlerts.length = 0;

  // Compile payload
  const payload = {
    timestamp,
    stats,
    system,
    ipStats,
    endpoints: endpointsReport,
    alerts: alertsToSend
  };

  try {
    const res = await axios.post(TELEMETRY_URL, payload, { timeout: 2000 });
    // Proactive blocklist sync from response if dashboard returns it
    if (res.data && Array.isArray(res.data.blockedIps)) {
      localBlockedIps.clear();
      res.data.blockedIps.forEach(ip => localBlockedIps.add(ip));
    }
  } catch (error) {
    // Silent catch so main web application performance is not affected by dashboard status
  }
}, 5000);

module.exports = {
  telemetryMiddleware
};
