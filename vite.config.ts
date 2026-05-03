import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        details: resolve(__dirname, 'details.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api/proxy': {
        target: 'http://localhost:5173', // Placeholder, handled by bypass
        bypass: async (req, res, _options) => {
          if (req.url?.startsWith('/api/proxy')) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const targetUrl = url.searchParams.get('url');
            const searchTerm = url.searchParams.get('search');
            
            if (!targetUrl) return res.end('Missing url');

            try {
              const response = await fetch(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
              });

              let data = await response.json();
              
              // Appliquer le filtrage si demandé (identique au proxy Vercel)
              if (searchTerm && targetUrl.includes('get_live_streams')) {
                const term = searchTerm.toLowerCase();
                let items = Array.isArray(data) ? data : Object.values(data);
                data = items.filter((item: any) => {
                  if (!item || typeof item !== 'object') return false;
                  const name = (item.name || item.title || "").toLowerCase();
                  return name.includes(term);
                }).slice(0, 50);
              }

              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify(data));
            } catch (err: any) {
              res.end(`Proxy Error: ${err.message}`);
            }
            return false;
          }
        }
      }
    }
  }
})
