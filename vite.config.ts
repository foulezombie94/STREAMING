import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Inline le CSS directement dans le HTML (évite une requête render-blocking),
 * mais UNIQUEMENT le CSS réellement référencé par chaque page.
 * Avant : tout le CSS de l'app (~80 Ko) était injecté dans chaque page,
 * y compris les pages légales qui n'en utilisent pas une ligne.
 */
function inlineCSSPlugin() {
  return {
    name: 'inline-css',
    enforce: 'post' as const,
    generateBundle(_options: any, bundle: any) {
      const usedCss = new Set<string>();

      for (const htmlName of Object.keys(bundle).filter(n => n.endsWith('.html'))) {
        const htmlAsset = bundle[htmlName];
        if (htmlAsset.type !== 'asset') continue;
        let html = htmlAsset.source as string;
        let inlined = '';

        html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, (tag) => {
          const href = tag.match(/href=["']\/?([^"']+)["']/)?.[1];
          const asset = href ? bundle[href] : undefined;
          if (!asset || asset.type !== 'asset') return tag; // feuille externe : on garde le <link>
          inlined += asset.source;
          usedCss.add(href!);
          return '';
        });

        if (inlined) {
          html = html.replace('</head>', () => `<style>${inlined}</style></head>`);
        }
        htmlAsset.source = html;
      }

      // Ne pas publier les .css déjà inlinés
      for (const name of usedCss) delete bundle[name];
    }
  };
}

export default defineConfig({
  plugins: [inlineCSSPlugin()],
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        details: resolve(__dirname, 'details.html'),
        project: resolve(__dirname, 'project.html'),
        contact: resolve(__dirname, 'contact.html'),
        cgu: resolve(__dirname, 'cgu.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        dmca: resolve(__dirname, 'dmca.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:25566',
        changeOrigin: true
      },
      '/proxy': {
        target: 'http://localhost:25566',
        changeOrigin: true
      }
    }
  }
})
