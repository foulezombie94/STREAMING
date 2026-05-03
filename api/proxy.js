export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // No domain restriction for IPTV support
  const isAllowed = true; 


  try {
    let urlObj;
    try {
        urlObj = new URL(targetUrl);
    } catch (e) {
        return new Response('Invalid target URL', { status: 400 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
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

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
