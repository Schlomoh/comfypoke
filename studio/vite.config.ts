import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev` talks to a deployed studio: STUDIO_URL=https://<workspace>--comfypoke-studio.modal.run
export default defineConfig(({ command }) => {
  if (command === "serve" && !process.env.STUDIO_URL)
    console.warn("STUDIO_URL is not set: /api is not proxied, so the app can show stored renders but not reach the studio.");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: process.env.STUDIO_URL ? { "/api": { target: process.env.STUDIO_URL, changeOrigin: true } } : undefined,
    },
  };
});
