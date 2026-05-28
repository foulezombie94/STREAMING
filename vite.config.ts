import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

function inlineCSSPlugin() {
  return {
    name: 'inline-css',
    enforce: 'post' as const,
    generateBundle(options: any, bundle: any) {
      const cssAssets = Object.keys(bundle).filter(name => name.endsWith('.css'));
      const htmlAssets = Object.keys(bundle).filter(name => name.endsWith('.html'));
      
      let cssContent = '';
      for (const cssName of cssAssets) {
        const asset = bundle[cssName];
        if (asset.type === 'asset') {
          cssContent += asset.source;
          delete bundle[cssName]; // Ne pas générer de fichier .css externe
        }
      }

      if (cssContent) {
        for (const htmlName of htmlAssets) {
          const htmlAsset = bundle[htmlName];
          if (htmlAsset.type === 'asset') {
            let html = htmlAsset.source as string;
            // Supprimer les balises <link rel="stylesheet"> générées par Vite
            html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
            // Injecter le CSS minifié dans la balise <style> du <head>
            html = html.replace('</head>', `<style>${cssContent}</style></head>`);
            htmlAsset.source = html;
          }
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [inlineCSSPlugin()],
  build: {
    cssCodeSplit: false,
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
