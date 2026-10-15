import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['LOCAL_API_URL', 'API_URL', 'ORIGIN_SECRET']);
  const target = process.env.LOCAL_API_URL ?? process.env.API_URL ?? env.LOCAL_API_URL ?? env.API_URL ?? 'http://127.0.0.1:3000';
  const originSecret = process.env.ORIGIN_SECRET ?? env.ORIGIN_SECRET;
  const proxy = {
    target,
    changeOrigin: false,
    headers: originSecret ? { 'x-origin-secret': originSecret } : {},
    configure(server: import('http-proxy').Server) {
      server.on('proxyReq', (proxyRequest, request) => {
        proxyRequest.setHeader('x-real-ip', request.socket.remoteAddress ?? '127.0.0.1');
      });
    },
  };
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': proxy, '/auth': proxy },
    },
  };
});
