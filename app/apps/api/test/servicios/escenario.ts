// Escenario común de los tests de servicios: base migrada con la semilla de
// ejemplo, reloj controlado y ayudas para abrir turnos y operar.

import { cargarSemilla, migrar } from "../../src/db/migrar.ts";
import { registrarIngresoORetiro, saldos } from "../../src/servicios/caja.ts";
import { crearContexto, ErrorNegocio, type Actor, type Contexto } from "../../src/servicios/contexto.ts";
import { confirmarOperacion, crearBorrador, type EntradaOperacion } from "../../src/servicios/operaciones.ts";
import { abrirTurno } from "../../src/servicios/turnos.ts";
import { baseTemporal } from "../ayuda.ts";

// Usuarios de la semilla
export const ADMIN: Actor = { id: 1, rol: "ADMIN" };
export const SUPERVISOR: Actor = { id: 2, rol: "SUPERVISOR" };
export const CAJERO: Actor = { id: 3, rol: "CAJERO" };
export const CAJERA_2: Actor = { id: 4, rol: "CAJERO" };

export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;

export function escenario() {
  const conexion = baseTemporal();
  migrar(conexion.sqlite);
  cargarSemilla(conexion.sqlite, "ejemplo");

  // El reloj parte justo después de la semilla, que publicó la pizarra "ahora"
  let instante = Date.now() + 1000;
  const reloj = {
    ahora: () => new Date(instante),
    avanzar: (ms: number) => {
      instante += ms;
    },
  };
  const ctx = crearContexto(conexion.db, reloj.ahora);

  let ultimoFolio = 1000;
  const folio = () => ({ tipoDte: 41, folioDte: ++ultimoFolio });

  return { ...conexion, ctx, reloj, folio };
}

/** Abre el turno del actor en la caja y registra sus fondos iniciales. */
export function abrirConFondos(ctx: Contexto, actor: Actor, cajaId: number, fondos: Record<string, bigint>) {
  const turno = abrirTurno(ctx, actor, cajaId);
  for (const [monedaCodigo, monto] of Object.entries(fondos)) {
    registrarIngresoORetiro(ctx, actor, { tipo: "INGRESO", monedaCodigo, monto, motivo: "Fondo inicial" });
  }
  return turno;
}

/** Registra y confirma una operación con folio. */
export function operar(ctx: Contexto, actor: Actor, entrada: EntradaOperacion, folio: { tipoDte: number; folioDte: number }) {
  const borrador = crearBorrador(ctx, actor, { ...folio, ...entrada });
  return confirmarOperacion(ctx, actor, borrador.id);
}

export function saldoDe(ctx: Contexto, cajaId: number, monedaCodigo: string): bigint {
  return saldos(ctx.db, cajaId).find((s) => s.monedaCodigo === monedaCodigo)?.saldo ?? 0n;
}

export function costoDe(ctx: Contexto, cajaId: number, monedaCodigo: string): bigint | null {
  return saldos(ctx.db, cajaId).find((s) => s.monedaCodigo === monedaCodigo)?.costoPromedioE6 ?? null;
}

/** Código del ErrorNegocio que lanza `fn` (o una descripción si lanza otra cosa). */
export function codigoDeError(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ErrorNegocio ? error.codigo : `OTRO ERROR: ${(error as Error).message}`;
  }
  return undefined;
}

/** Mensaje del error que lanza `fn`. */
export function mensajeDeError(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
}
