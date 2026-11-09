// Punto de entrada del front: estilos globales, sesión (con la caché de la
// API) y rutas.

import "@fontsource-variable/inter";
import "./estilos/tokens.css";
import "./estilos/base.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { crearRutas } from "./rutas.tsx";
import { ProveedorSesion } from "./sesion/Sesion.tsx";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento #raiz en index.html");

createRoot(raiz).render(
  <StrictMode>
    <ProveedorSesion>
      <RouterProvider router={crearRutas()} />
    </ProveedorSesion>
  </StrictMode>,
);
