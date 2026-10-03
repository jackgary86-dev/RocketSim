import { defineConfig } from 'vite';

// Relative base so the build also loads from file:// (Electron desktop wrapper).
export default defineConfig({ base: './' });
