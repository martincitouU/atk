import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { crearEstado, type Estado } from "../src/mocks/estado.ts";
import { handlers } from "../src/mocks/handlers.ts";

/** 10:44 en Coyhaique (UTC−3): la hora del comp. Con este reloj, la semilla queda igual que en el comp. */
export const RELOJ_PRUEBA = new Date("2026-11-08T13:44:00.000Z");

/**
 * Un solo servidor MSW para todos los tests. Antes de cada test se monta una
 * semilla nueva con el reloj fijo; un test que necesite otro reloj u otro
 * estado llama a `usarEstado`, que tapa los handlers por defecto.
 */
export const servidor = setupServer();
export let estadoPrueba: Estado;

export function usarEstado(estado: Estado): Estado {
  servidor.use(...handlers(estado));
  return estado;
}

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  estadoPrueba = usarEstado(crearEstado(() => RELOJ_PRUEBA));
});
// Sin `globals: true`, Testing Library no limpia solo entre tests.
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
});
afterAll(() => servidor.close());
