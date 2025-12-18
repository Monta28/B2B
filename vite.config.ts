import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Ports configurables via .env
    const frontendPort = parseInt(env.FRONTEND_PORT || '4000', 10);
    const backendPort = parseInt(env.BACKEND_PORT || '4001', 10);

    return {
      server: {
        port: frontendPort,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: `http://localhost:${backendPort}`,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.BACKEND_PORT': JSON.stringify(backendPort),
        'process.env.FRONTEND_PORT': JSON.stringify(frontendPort),
        'import.meta.env.VITE_BACKEND_PORT': JSON.stringify(backendPort),
        'import.meta.env.VITE_FRONTEND_PORT': JSON.stringify(frontendPort),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
