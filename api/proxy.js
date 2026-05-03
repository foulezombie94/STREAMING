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

    // If it's HTML, rewrite internal URLs to go through our proxy
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // Get the base URL for resolving relative URLs  
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const proxyBase = '/api/proxy?url=';

      // Rewrite absolute URLs to vidsrc/cloudnestra domains to go through proxy
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
        // If no <head> tag, add at beginning
        if (!html.includes('<base')) {
          html = `<base href="${baseUrl}/">` + html;
        }
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
