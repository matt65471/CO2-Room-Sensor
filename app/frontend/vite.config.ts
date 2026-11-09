import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the Node backend, so the browser only ever talks to one address
    proxy: { '/api': 'http://localhost:3001' },
  },
});
