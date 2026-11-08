import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Los estilos globales van antes que App: el CSS de cada pantalla (que App
// importa) queda después y gana los empates de especificidad.
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/marco.css";
import { App } from "./app.tsx";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento #raiz en index.html");

// Con VITE_MOCKS=1 (en `vite` o en un build para `vite preview`), MSW
// contesta /api/* con los datos de ejemplo, sin API. Sin esa variable, /api
// va a la API real: en `vite`, por el proxy de vite.config.ts.
if (import.meta.env.VITE_MOCKS === "1") {
  const { worker } = await import("./mocks/navegador.ts");
  await worker.start({ onUnhandledRequest: "bypass" });
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
