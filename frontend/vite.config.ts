import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiProxyTarget = "http://127.0.0.1:8000";
const bootstrapScript =
  '<script src="/api/v1/bootstrap.js?callback=__spaghettiDeskBootstrap"></script>';

export default defineConfig({
  plugins: [
    react(),
    {
      name: "spaghetti-bootstrap-preload",
      transformIndexHtml(html) {
        return html.replace("</head>", `    ${bootstrapScript}\n  </head>`);
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/healthz": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
