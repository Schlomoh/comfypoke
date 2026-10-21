import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev` talks to a deployed studio: STUDIO_URL=https://<workspace>--comfypoke-studio.modal.run
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: process.env.STUDIO_URL ? { "/api": { target: process.env.STUDIO_URL, changeOrigin: true } } : undefined,
  },
});
