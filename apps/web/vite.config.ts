import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: Vite on 5173 proxies /api to the backend. Prod: the backend serves dist/
// same-origin, so there is no proxy and no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3048' },
  },
});
