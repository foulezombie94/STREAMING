export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    let urlObj;
    try {
        urlObj = new URL(targetUrl);
    } catch (e) {
        return new Response('Invalid target URL', { status: 400 });
    }

    // SÉCURITÉ : Restriction aux domaines IPTV autorisés
    const allowedDomains = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium']; 
    const targetHost = urlObj.hostname;
    const isWhitelisted = allowedDomains.some(d => targetHost.includes(d));

    if (!isWhitelisted) {
      return new Response('Access Denied: Domain not whitelisted', { status: 403 });
    }

    // Préparation des headers à envoyer à la cible
    // On utilise des headers qui imitent une application IPTV réelle
    const forwardHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36 IPTV-Smarters/3.0',
      'Accept': '*/*',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Connection': 'keep-alive',
      'X-Requested-With': 'com.nst.iptvsmarterstvbox',
    };

    // Note: On évite Referer et Origin qui peuvent être bloqués si incorrects
    // Mais on peut les ajouter si l'URL cible semble les attendre
    if (targetUrl.includes('premium') || targetUrl.includes('movie')) {
       forwardHeaders['Referer'] = urlObj.origin + '/';
    }

    // Transmettre le header Range pour le support du seeking (important pour la vidéo)
    const range = request.headers.get('range');
    if (range) {
      forwardHeaders['Range'] = range;
    }

    const response = await fetch(targetUrl, {
      headers: forwardHeaders,
      cache: 'no-store',
      redirect: 'follow',
    });

    // Clone headers but remove blocking ones
    const newHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      // Strip all security headers that block iframe embedding
      if (
        lowerKey === 'x-frame-options' ||
        lowerKey === 'content-security-policy' ||
        lowerKey === 'content-security-policy-report-only' ||
        lowerKey === 'x-content-type-options'
      ) {
        continue;
      }
      newHeaders.set(key, value);
    }

    // Forcer le JSON si c'est une requête API Xtream
    if (targetUrl.includes('player_api.php')) {
      newHeaders.set('Content-Type', 'application/json');
    }

    // Allow embedding from anywhere
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    // FILTRAGE SERVEUR (Pour économiser la data mobile)
    const searchTerm = searchParams.get('search');
    if (searchTerm && targetUrl.includes('action=get_live_streams')) {
      const data = await response.json();
      const term = searchTerm.toLowerCase();
      
      let items = Array.isArray(data) ? data : Object.values(data);
      const filtered = items.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const name = (item.name || item.title || "").toLowerCase();
        return name.includes(term);
      }).slice(0, 50); // Limiter à 50 pour le transfert

      return new Response(JSON.stringify(filtered), {
        status: 200,
        headers: newHeaders,
      });
    }

    // REWRITING M3U8 (For HLS relative paths)
    if (targetUrl.includes('.m3u8')) {
      let m3u8Content = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      
      // Replace relative paths with absolute ones pointing through the proxy
      // We look for lines that don't start with # and aren't already absolute
      const lines = m3u8Content.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        
        // 1. Rewrite segment URLs
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('http')) {
          const absoluteSegmentUrl = new URL(trimmed, baseUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteSegmentUrl)}`;
        }

        // 2. Rewrite URLs in tags (e.g., EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
        if (trimmed.startsWith('#') && (trimmed.includes('URI="') || trimmed.includes('URI='))) {
            return line.replace(/URI="?([^",\s]+)"?/g, (match, p1) => {
                if (p1.startsWith('http') || p1.startsWith('/api/proxy')) return match;
                const absoluteUrl = new URL(p1, baseUrl).href;
                return `URI="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
            });
        }
        
        return line;
      });
      
      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: newHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
