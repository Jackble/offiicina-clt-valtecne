import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // In questa app usiamo Vite in "middlewareMode" dentro Express (vedi `server.ts`).
        // In alcuni ambienti il WebSocket HMR può non essere raggiungibile e genera l’errore
        // "[vite] failed to connect to websocket". Non impatta la UI, ma disabilitare HMR
        // evita l’errore in console durante l’uso.
        hmr: false,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
