import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://fusionpulse.colefusion.net',
  output: 'static',
  integrations: [],
  vite: {
    plugins: [tailwindcss()],
  },
});
