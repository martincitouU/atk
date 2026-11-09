// Punto de entrada del front: estilos globales, caché de la API, sesión y rutas.

import "@fontsource-variable/inter";
import "./estilos/tokens.css";
import "./estilos/base.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { crearRutas } from "./rutas.tsx";
import { ProveedorSesion } from "./sesion/Sesion.tsx";

const consultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Un dato se considera al día por 30 s; después se vuelve a pedir al mostrarlo
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento #raiz en index.html");

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <ProveedorSesion>
        <RouterProvider router={crearRutas()} />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
