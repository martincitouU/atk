import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // En desarrollo, /api va a la API real (npm run dev:api, puerto 3000). Mismo
  // origen para el navegador: la cookie y el Origin que exige la API calzan.
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: {
    environment: "jsdom",
    setupFiles: ["test/preparar.ts"],
    // Los tests corren contra los mocks (MSW): las pantallas muestran «Datos de ejemplo»
    env: { VITE_MOCKS: "1" },
  },
});
