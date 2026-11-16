// La base local de npm run dev: la semilla de ejemplo, cuentas para iniciar
// sesión con cada rol y una jornada a medias, para que las vistas muestren
// datos. SOLO DESARROLLO: la usa cli/desarrollo.ts y no entra a la imagen.
//
// Todo pasa por los servicios, con sus reglas y su auditoría, igual que en
// producción. Un test (test/cli/base-desarrollo.test.ts) avisa si una regla
// nueva deja de aceptar esta jornada.

import { eq } from "drizzle-orm";
import { crearAuth, crearCuenta } from "../auth/auth.ts";
import { abrirBase } from "../db/conexion.ts";
import { categoriaGasto, usuario } from "../db/esquema.ts";
import { cargarSemilla, migrar } from "../db/migrar.ts";
import { registrarIngresoORetiro } from "../servicios/caja.ts";
import { crearContexto, type Actor, type Contexto } from "../servicios/contexto.ts";
import { registrarCliente, verificarCuenta } from "../servicios/cuentas.ts";
import { registrarGasto } from "../servicios/gastos.ts";
import { confirmarOperacion, crearBorrador, reversarOperacion, type EntradaOperacion } from "../servicios/operaciones.ts";
import { leerParametros } from "../servicios/parametros.ts";
import { abrirTurno } from "../servicios/turnos.ts";

// El personal de la semilla
const SUPERVISOR: Actor = { id: 2, rol: "SUPERVISOR" };
const CAJERO: Actor = { id: 3, rol: "CAJERO" };
const CAJERA_2: Actor = { id: 4, rol: "CAJERO" };

export type OpcionesBaseDesarrollo = {
  rutaBase: string;
  secreto: string;
  /** Donde el navegador abre el front; Better Auth valida el Origin con ella */
  urlPublica: string;
  /** La de todas las cuentas de prueba */
  contrasena: string;
};

export async function prepararBaseDeDesarrollo({ rutaBase, secreto, urlPublica, contrasena }: OpcionesBaseDesarrollo) {
  const { sqlite, db } = abrirBase(rutaBase);
  try {
    migrar(sqlite);
    cargarSemilla(sqlite, "ejemplo");

    const auth = crearAuth({
      rutaBase,
      secreto,
      urlPublica,
      inactividadMinutos: leerParametros(db).sesionInactividadMinutos,
      limitarIntentos: false,
    });

    // El personal de la semilla, con cuenta para iniciar sesión
    for (const persona of db.select().from(usuario).all()) {
      const authUserId = await crearCuenta(auth, { email: persona.email, nombre: persona.nombre, contrasena });
      db.update(usuario).set({ authUserId }).where(eq(usuario.id, persona.id)).run();
    }

    // Dos clientes del portal: uno pendiente y otro ya verificado por el cajero
    const ctx = crearContexto(db);
    await registrarCliente(ctx, auth, { nombre: "Ana Pérez", rut: "15555567-K", email: "ana@demo.cl", contrasena });
    const verificada = await registrarCliente(ctx, auth, {
      nombre: "Cliente Incompleto de Prueba",
      rut: "12345678-5", // el RUT de su ficha en la semilla
      email: "cliente@demo.cl",
      contrasena,
    });
    verificarCuenta(ctx, CAJERO, verificada.id);

    cargarJornada(ctx);
  } finally {
    sqlite.close();
  }
}

/**
 * Una jornada a medias: dos turnos abiertos con su fondo, operaciones
 * confirmadas (una del cliente del portal, una reversada), un borrador sin
 * confirmar y un gasto. Montos en la unidad mínima: US$ 250 = 25_000n.
 */
function cargarJornada(ctx: Contexto) {
  let folio = 1000;
  const operar = (actor: Actor, entrada: EntradaOperacion) =>
    confirmarOperacion(ctx, actor, crearBorrador(ctx, actor, { tipoDte: 41, folioDte: ++folio, ...entrada }).id);

  const abrirConFondos = (actor: Actor, cajaId: number, fondos: Record<string, bigint>) => {
    abrirTurno(ctx, actor, cajaId);
    for (const [monedaCodigo, monto] of Object.entries(fondos)) {
      registrarIngresoORetiro(ctx, actor, { tipo: "INGRESO", monedaCodigo, monto, motivo: "Fondo inicial" });
    }
  };

  // Caja 1: el cajero
  abrirConFondos(CAJERO, 1, { CLP: 3_000_000n, USD: 1_000_000n, EUR: 200_000n, BRL: 300_000n, ARS: 50_000_000n });
  operar(CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 25_000n });
  operar(CAJERO, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 50_000n });
  operar(CAJERO, { tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 15_000n, medioPago: "TARJETA" });
  operar(CAJERO, { tipo: "COMPRA", monedaCodigo: "BRL", montoDivisa: 40_000n });
  operar(CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 30_000n, clienteId: 2 }); // la ve cliente@demo.cl
  // Desde US$ 5.000 la UAF exige cliente con ficha completa y propósito
  operar(CAJERO, {
    tipo: "VENTA",
    monedaCodigo: "USD",
    montoDivisa: 600_000n,
    medioPago: "TRANSFERENCIA",
    clienteId: 1,
    proposito: "Viaje de negocios",
  });
  operar(CAJERO, { tipo: "COMPRA", monedaCodigo: "ARS", montoDivisa: 10_000_000n });
  const arrepentida = operar(CAJERO, { tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 5_000n });
  reversarOperacion(ctx, SUPERVISOR, arrepentida.id, "El cliente se arrepintió antes de recibir el dinero");
  crearBorrador(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n });

  const insumos = ctx.db.select({ id: categoriaGasto.id }).from(categoriaGasto).where(eq(categoriaGasto.nombre, "Insumos y oficina")).get();
  if (!insumos) throw new Error("Falta la categoría de gasto «Insumos y oficina» (viene en 0001)");
  registrarGasto(ctx, CAJERO, { categoriaId: insumos.id, descripcion: "Resmas de papel y tóner", monto: 12_500n, medioPago: "EFECTIVO" });

  // Caja 2: la cajera 2
  abrirConFondos(CAJERA_2, 2, { CLP: 1_000_000n, USD: 200_000n });
  operar(CAJERA_2, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 10_000n });
}
