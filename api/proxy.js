export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow trusted streaming domains
  const allowed = [
    'player.videasy.net',
    'multiembed.mov',
    'moviesapi.club',
    'vidfast.pro',
    'vidsrc-embed.ru',
    'vidsrc-embed.su',
    'vidsrcme.su',
    'vsrc.su',
    'vidsrc.me',
    'vidsrc.to',
    'vidsrc.cc',
    'vidsrc.xyz',
    'superembed.cc',
    'cloudnestra.com',
  ];
  
  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const isAllowed = allowed.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d));
  if (!isAllowed) {
    return new Response('Domain not allowed: ' + urlObj.hostname, { status: 403 });
  }

  // 1. MÉTHODE "MISE EN ÉCHEC" : Blocage des scripts de pub/tracking connus
  const scriptsToBlock = [
    'popads.js', 'onclickads.js', 'disable-devtool.min.js', 
    'console-ban', 'block-console', 'devtools-detect',
    'shein.com', 'aliexpress.com', 'alicdn.com',
    'doubleclick.net', 'googlesyndication.com',
    'adservice.google.com', 'popads.net', 'popcash.net'
  ];

  if (scriptsToBlock.some(s => targetUrl.toLowerCase().includes(s))) {
    return new Response('Blocked by Movieverse Shield', { status: 404 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://vidsrc.me/',
        'Origin': 'https://vidsrc.me',
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

    // Allow embedding from anywhere
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    const contentType = response.headers.get('content-type') || '';

    // If it's HTML, rewrite internal URLs and inject shield code
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // 2. MÉTHODE "INJECTION CSS NETTOYEUR"
      const cleanCSS = `
<style>
  /* On cache les overlays de pub, les bannières et les popups détectés */
  [class*="popup"], [id*="popup"], .ads-layer, .overlay-ads, 
  .video-ad-overlay, .player-ad, [class*="vast-"],
  #popads, .popunder, .ad-banner, .ali-ads, .shein-ads {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    z-index: -1 !important;
  }
</style>`;

      // 3. MÉTHODE "NEUTRALISATION JS" : On désamorce window.open
      const neutralJS = `
<script>
  (function() {
    window.open = function() { console.log("[Shield] Pop-up bloquée !"); return null; };
    window.alert = function() { return true; };
    // Désactive les tentatives de détection de console
    window.onresize = null;
    console.clear = function() {};
  })();
</script>`;

      // Inject just after <head> or at beginning
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${cleanCSS}${neutralJS}`);
      } else {
        html = cleanCSS + neutralJS + html;
      }
      
      // Get the base URL for resolving relative URLs  
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const proxyBase = '/api/proxy?url=';

      // Rewrite absolute URLs to allowed domains to go through proxy
      for (const domain of allowed) {
        // https:// URLs
        html = html.replace(
          new RegExp(`(["'(])https?://${domain.replace('.', '\\.')}`, 'g'),
          `$1${proxyBase}https://${domain}`
        );
      }

      // Add base tag so relative URLs resolve correctly
      if (!html.includes('<base')) {
        html = html.replace('<head>', `<head><base href="${baseUrl}/">`);
      }

      newHeaders.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(html, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // For non-HTML content, just pass through
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
