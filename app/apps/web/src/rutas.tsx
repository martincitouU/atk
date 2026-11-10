// Mapa de la app: qué vista corresponde a cada dirección y quién puede verla.
//
//   /ingresar, /registro     público (si ya hay sesión, a su inicio)
//   /mi/...                  portal del cliente
//   /...                     personal; /administracion solo para ADMIN

import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from "react-router";
import { MarcoCliente, MarcoPersonal, MarcoPublico, SoloRoles } from "./marcos/Marcos.tsx";
import { MiCuenta } from "./vistas/cliente/MiCuenta.tsx";
import { NoEncontrada } from "./vistas/NoEncontrada.tsx";
import { Perfil } from "./vistas/Perfil.tsx";
import { Administracion, Auditoria, Fidelizacion, Usuarios } from "./vistas/personal/Administracion.tsx";
import { Caja, Gastos, TurnoYCaja } from "./vistas/personal/Caja.tsx";
import { Clientes, CuentasWeb, DetalleCliente, EditarCliente, Fichas, NuevoCliente } from "./vistas/personal/Clientes.tsx";
import { DetalleOperacion } from "./vistas/personal/DetalleOperacion.tsx";
import { Inicio } from "./vistas/personal/Inicio.tsx";
import { EditarOperacion, NuevaOperacion } from "./vistas/personal/NuevaOperacion.tsx";
import { Operaciones } from "./vistas/personal/Operaciones.tsx";
import { Pizarra } from "./vistas/personal/Pizarra.tsx";
import { Ingresar } from "./vistas/publico/Ingresar.tsx";
import { Registro } from "./vistas/publico/Registro.tsx";

export const rutas: RouteObject[] = [
  {
    element: <MarcoPublico />,
    children: [
      { path: "/ingresar", element: <Ingresar /> },
      { path: "/registro", element: <Registro /> },
    ],
  },
  {
    path: "/mi",
    element: <MarcoCliente />,
    children: [
      { index: true, element: <MiCuenta /> },
      { path: "perfil", element: <Perfil /> },
    ],
  },
  {
    path: "/",
    element: <MarcoPersonal />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "operaciones", element: <Operaciones /> },
      { path: "operaciones/nueva", element: <NuevaOperacion /> },
      { path: "operaciones/:id", element: <DetalleOperacion /> },
      { path: "operaciones/:id/editar", element: <EditarOperacion /> },
      {
        path: "caja",
        element: <Caja />,
        children: [
          { index: true, element: <TurnoYCaja /> },
          { path: "gastos", element: <Gastos /> },
        ],
      },
      { path: "pizarra", element: <Pizarra /> },
      {
        path: "clientes",
        element: <Clientes />,
        children: [
          { index: true, element: <Fichas /> },
          { path: "cuentas", element: <CuentasWeb /> },
        ],
      },
      { path: "clientes/nuevo", element: <NuevoCliente /> },
      { path: "clientes/:id", element: <DetalleCliente /> },
      { path: "clientes/:id/editar", element: <EditarCliente /> },
      {
        path: "administracion",
        element: <SoloRoles roles={["ADMIN"]} />,
        children: [
          {
            element: <Administracion />,
            children: [
              { index: true, element: <Navigate to="usuarios" replace /> },
              { path: "usuarios", element: <Usuarios /> },
              { path: "fidelizacion", element: <Fidelizacion /> },
              { path: "auditoria", element: <Auditoria /> },
            ],
          },
        ],
      },
      { path: "perfil", element: <Perfil /> },
    ],
  },
  { path: "*", element: <NoEncontrada /> },
];

export const crearRutas = () => createBrowserRouter(rutas);

/** Para los tests: las mismas rutas, en memoria y partiendo de `inicio`. */
export const crearRutasDePrueba = (inicio: string) => createMemoryRouter(rutas, { initialEntries: [inicio] });
