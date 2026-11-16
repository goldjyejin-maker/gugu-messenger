import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : GitHub Pages / Cloudflare Pages 어느 쪽에 올려도 동작
export default defineConfig({ base: './', plugins: [react()] });
