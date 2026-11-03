import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import fs from 'node:fs';
import pathModule from 'node:path';

const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));

function customFaviconPlugin() {
  return {
    name: 'custom-favicon-server',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const rawUrl = req.url || '';
        const urlPath = rawUrl.split('?')[0];

        // 1. Simpan favicon dari frontend ke file fisik di disk
        if (req.method === 'POST' && (urlPath === '/api/save-favicon' || urlPath === '/3d-anatomy/api/save-favicon')) {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.base64) {
                const matches = data.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                const raw = matches ? matches[2] : data.base64;
                const buffer = Buffer.from(raw, 'base64');
                const outPublic = pathModule.resolve(process.cwd(), 'public/custom-favicon.png');
                const out3dDir = pathModule.resolve(process.cwd(), 'public/3d-anatomy/custom-favicon.png');
                fs.writeFileSync(outPublic, buffer);
                try { fs.writeFileSync(out3dDir, buffer); } catch(e) {}
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, timestamp: Date.now() }));
                return;
              }
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
              return;
            }
          });
          return;
        }

        // 2. Reset favicon (hapus file kustom)
        if (req.method === 'POST' && (urlPath === '/api/reset-favicon' || urlPath === '/3d-anatomy/api/reset-favicon')) {
          const outPublic = pathModule.resolve(process.cwd(), 'public/custom-favicon.png');
          const out3dDir = pathModule.resolve(process.cwd(), 'public/3d-anatomy/custom-favicon.png');
          if (fs.existsSync(outPublic)) fs.unlinkSync(outPublic);
          if (fs.existsSync(out3dDir)) fs.unlinkSync(out3dDir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // 3. Sajikan custom-favicon.png langsung sebagai file gambar dengan header anti-cache agresif
        if (urlPath === '/3d-anatomy/custom-favicon.png' || urlPath === '/custom-favicon.png') {
          const customPath = pathModule.resolve(process.cwd(), 'public/custom-favicon.png');
          const defaultPath = pathModule.resolve(process.cwd(), 'public/favicon.png');
          const fileToServe = fs.existsSync(customPath) ? customPath : defaultPath;
          if (fs.existsSync(fileToServe)) {
            const img = fs.readFileSync(fileToServe);
            res.writeHead(200, {
              'Content-Type': 'image/png',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
            res.end(img);
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  // Tambahkan base path agar sesuai dengan nama subfolder di hosting
  base: '/3d-anatomy/',
  
  root: path('./web'),
  publicDir: path('./public'),
  plugins:[react(), customFaviconPlugin()],
  resolve:{alias:{'@':path('./')}},
  css:{postcss:{plugins:[tailwindcss()]}},
  server:{watch:{usePolling:true}},
  build:{outDir:path('./dist'),emptyOutDir:true}
});
