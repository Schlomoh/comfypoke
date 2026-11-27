import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev` talks to a deployed studio: STUDIO_URL=https://<workspace>--comfypoke-studio.modal.run
export default defineConfig(({ command }) => {
  const studio = process.env.STUDIO_URL;
  if (command === "serve" && !studio)
    console.warn(
      "STUDIO_URL is not set: /api is not proxied, so the app can show stored renders but not reach the studio.",
    );
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      proxy: studio
        ? {
            "/api": {
              target: studio,
              changeOrigin: true,
              // The studio refuses a POST whose Origin is not its own host (studio_api._cross_origin).
              configure: (proxy) =>
                proxy.on("proxyReq", (req) => {
                  if (req.getHeader("origin")) req.setHeader("origin", new URL(studio).origin);
                }),
            },
          }
        : undefined,
    },
  };
});
