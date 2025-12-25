import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';




export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

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
      'process.env.BACKEND_PORT': JSON.stringify(backendPort),
      'process.env.FRONTEND_PORT': JSON.stringify(frontendPort),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
