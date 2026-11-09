// Vite: servidor de desarrollo del front y compilación a archivos estáticos.
//
// En desarrollo, Vite atiende en :5173 y reenvía /api a la API (:3000). El
// navegador ve un solo origen, igual que en producción, así que la cookie de
// sesión y la validación de Origin funcionan sin CORS.
// En producción no hay Vite: `vite build` deja todo en dist/ y la API lo sirve.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    // Archivos con hash en el nombre: el navegador los guarda sin miedo
    assetsDir: "assets",
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
