import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { ErrorNegocio } from "./api/cliente.ts";
import { ConPermiso } from "./componentes/ConPermiso.tsx";
import { ConSesion } from "./componentes/ConSesion.tsx";
import { EsqueletoEntrar } from "./componentes/Esqueleto.tsx";
import { Marco } from "./componentes/Marco.tsx";

// Cada pantalla es su propio chunk: el marco (riel, sesión, consultas) llega
// primero y la pantalla, cuando se abre. El Suspense de las del marco está en
// <Marco/>, alrededor del <Outlet/>, para que el riel no parpadee; al cambiar
// de sección, React Router navega dentro de una transición y la pantalla
// anterior queda a la vista hasta que la nueva está lista.
const Login = lazy(() => import("./pantallas/Login.tsx").then((m) => ({ default: m.Login })));
const Ventanilla = lazy(() => import("./pantallas/Ventanilla/Ventanilla.tsx").then((m) => ({ default: m.Ventanilla })));
const Cierre = lazy(() => import("./pantallas/Cierre/Cierre.tsx").then((m) => ({ default: m.Cierre })));
const Jornada = lazy(() => import("./pantallas/Jornada.tsx").then((m) => ({ default: m.Jornada })));
const Clientes = lazy(() => import("./pantallas/Clientes.tsx").then((m) => ({ default: m.Clientes })));
const Configuracion = lazy(() => import("./pantallas/Configuracion.tsx").then((m) => ({ default: m.Configuracion })));
const Usuarios = lazy(() => import("./pantallas/Usuarios.tsx").then((m) => ({ default: m.Usuarios })));
const Auditoria = lazy(() => import("./pantallas/Auditoria.tsx").then((m) => ({ default: m.Auditoria })));

export const rutas: RouteObject[] = [
  {
    path: "/entrar",
    element: (
      <Suspense fallback={<EsqueletoEntrar />}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: "/",
    // Sin sesión, todo lo de adentro lleva a /entrar; la inactividad, también.
    element: (
      <ConSesion>
        <Marco />
      </ConSesion>
    ),
    children: [
      { index: true, element: <Navigate to="/ventanilla" replace /> },
      { path: "ventanilla", element: <Ventanilla /> },
      { path: "cierre", element: <Cierre /> },
      {
        path: "jornada",
        element: (
          <ConPermiso accion="verJornada">
            <Jornada />
          </ConPermiso>
        ),
      },
      { path: "clientes", element: <Clientes /> },
      { path: "configuracion", element: <Configuracion /> },
      {
        path: "usuarios",
        element: (
          <ConPermiso accion="administrar">
            <Usuarios />
          </ConPermiso>
        ),
      },
      {
        path: "auditoria",
        element: (
          <ConPermiso accion="administrar">
            <Auditoria />
          </ConPermiso>
        ),
      },
      { path: "*", element: <Navigate to="/ventanilla" replace /> },
    ],
  },
];

// Un error de negocio (SIN_SESION, BAJO_MINIMO, COTIZACION_VENCIDA…) es una
// respuesta, no un tropiezo: reintentarlo da lo mismo. El resto, una vez.
const consultas = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ErrorNegocio) && n < 1, refetchOnWindowFocus: true },
  },
});

export function App() {
  const [router] = useState(() => createBrowserRouter(rutas));
  return (
    <QueryClientProvider client={consultas}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
