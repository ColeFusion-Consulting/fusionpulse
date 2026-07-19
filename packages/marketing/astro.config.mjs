import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://fusionpulse.colefusion.com',
  output: 'static',
  integrations: [],
  vite: {
    plugins: [tailwindcss()],
  },
});
