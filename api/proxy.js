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

    // SÉCURITÉ : Restriction aux domaines IPTV autorisés ou aux requêtes API/Médias
    const allowedDomains = ['gndk28.xyz', 'iptv', 'stream', 'movie', 'series', 'premium', 'tv', 'live', 'play', 'vod', 'video', 'cdn', 'media', 'net', 'pro', 'top', 'host', 'box']; 
    const targetHost = urlObj.hostname;
    const isWhitelistedDomain = allowedDomains.some(d => targetHost.includes(d));
    
    // Assouplissement : on autorise aussi si l'URL contient des marqueurs IPTV typiques
    const isIptvRequest = targetUrl.includes('player_api.php') || targetUrl.includes('get.php') || targetUrl.includes('.m3u8') || targetUrl.includes('.ts') || targetUrl.includes('xmltv');

    if (!isWhitelistedDomain && !isIptvRequest) {
      return new Response('Access Denied: Domain not whitelisted and not a recognized IPTV request', { status: 403 });
    }

    // Préparation des headers à envoyer à la cible
    const forwardHeaders = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    };

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

    // CACHE MULTI-UTILISATEUR (Pour permettre à 10+ personnes de voir la même chaîne)
    // On cache les segments .ts pendant 2 secondes au niveau du CDN Edge
    if (targetUrl.includes('.ts') || targetUrl.includes('.m4s')) {
      newHeaders.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=5');
    }
    // On cache le manifest .m3u8 très brièvement (1s)
    if (targetUrl.includes('.m3u8')) {
      newHeaders.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=2');
    }

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
        if (trimmed && !trimmed.startsWith('#')) {
          const absoluteSegmentUrl = new URL(trimmed, baseUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteSegmentUrl)}`;
        }

        // 2. Rewrite URLs in tags (e.g., EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
        if (trimmed.startsWith('#') && (trimmed.includes('URI="') || trimmed.includes('URI='))) {
            return line.replace(/URI="?([^",\s]+)"?/g, (match, p1) => {
                if (p1.startsWith('/api/proxy')) return match; // Deja proxifié
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
