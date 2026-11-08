// Portal de clientes: registro, verificación en el local y lectura de lo propio.
//
//   registrarCliente (el cliente, en línea)  → cuenta PENDIENTE, sin datos visibles
//   verificarCuenta (cajero, carnet en mano)  → VERIFICADA, enlazada a su ficha por RUT
//   rechazarCuenta  (cajero, con motivo)      → RECHAZADA
//
// La cuenta de Better Auth vive en otra conexión, así que crearla no puede
// ir en la misma transacción que la fila de cuenta_cliente: si la fila
// falla, se borra la cuenta recién creada (no quedan cuentas a medias).

import { and, desc, eq, ne, type SQL } from "drizzle-orm";
import { borrarCuenta, crearCuenta, type Auth } from "../auth/auth.ts";
import { cliente, cuentaCliente, operacion, type CuentaCliente } from "../db/esquema.ts";
import { auditar } from "./auditoria.ts";
import { enTransaccion, exigir, limpiar, type Actor, type Contexto, type Datos } from "./contexto.ts";

export type EntradaRegistro = { nombre: string; rut: string; email: string; contrasena: string };

/** Registro en línea. El RUT llega validado y normalizado por @atk/shared. */
export async function registrarCliente(ctx: Contexto, auth: Auth, entrada: EntradaRegistro): Promise<CuentaCliente> {
  const nombre = limpiar(entrada.nombre);
  exigir(nombre, "DATO_FALTANTE", "Indique su nombre");
  const authUserId = await crearCuenta(auth, { email: entrada.email, nombre, contrasena: entrada.contrasena });
  try {
    return enTransaccion(ctx, (tx) =>
      tx.insert(cuentaCliente).values({ authUserId, rut: entrada.rut, nombre, creadaEn: ctx.ahora() }).returning().get(),
    );
  } catch (error) {
    await borrarCuenta(auth, authUserId);
    throw error;
  }
}

function cuentaPendiente(tx: Datos, id: number): CuentaCliente {
  const cuenta = tx.select().from(cuentaCliente).where(eq(cuentaCliente.id, id)).get();
  exigir(cuenta, "CUENTA_NO_EXISTE", `La cuenta ${id} no existe`);
  exigir(cuenta.estado === "PENDIENTE", "CUENTA_YA_REVISADA", `La cuenta ya fue ${cuenta.estado === "VERIFICADA" ? "verificada" : "rechazada"}`);
  return cuenta;
}

/**
 * El cajero revisó el carnet: enlaza la cuenta con la ficha del mismo RUT.
 * La ficha se busca por el RUT declarado, así que no se puede enlazar con
 * la de otra persona (un trigger lo exige también en SQL).
 */
export function verificarCuenta(ctx: Contexto, actor: Actor, id: number): CuentaCliente {
  return enTransaccion(ctx, (tx) => {
    const cuenta = cuentaPendiente(tx, id);
    const ficha = tx
      .select({ id: cliente.id })
      .from(cliente)
      .where(and(eq(cliente.tipoDocumento, "RUT"), eq(cliente.numeroDocumento, cuenta.rut)))
      .get();
    exigir(ficha, "SIN_FICHA", `No hay ficha de cliente con RUT ${cuenta.rut}: regístrela antes de verificar la cuenta`);
    const yaTiene = tx.select({ id: cuentaCliente.id }).from(cuentaCliente).where(eq(cuentaCliente.clienteId, ficha.id)).get();
    exigir(!yaTiene, "FICHA_CON_CUENTA", `El cliente con RUT ${cuenta.rut} ya tiene una cuenta verificada`);

    const verificada = tx
      .update(cuentaCliente)
      .set({ estado: "VERIFICADA", clienteId: ficha.id, revisadaPor: actor.id, revisadaEn: ctx.ahora() })
      .where(eq(cuentaCliente.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "cuenta_cliente", registroId: id, accion: "AUTORIZAR", usuarioId: actor.id, antes: cuenta, despues: verificada });
    return verificada;
  });
}

export function rechazarCuenta(ctx: Contexto, actor: Actor, id: number, motivo: string): CuentaCliente {
  const elMotivo = limpiar(motivo);
  exigir(elMotivo, "FALTA_MOTIVO", "Indique el motivo del rechazo");
  return enTransaccion(ctx, (tx) => {
    const cuenta = cuentaPendiente(tx, id);
    const rechazada = tx
      .update(cuentaCliente)
      .set({ estado: "RECHAZADA", motivoRechazo: elMotivo, revisadaPor: actor.id, revisadaEn: ctx.ahora() })
      .where(eq(cuentaCliente.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "cuenta_cliente", registroId: id, accion: "EDITAR", usuarioId: actor.id, motivo: elMotivo, antes: cuenta, despues: rechazada });
    return rechazada;
  });
}

/** Para el personal: las cuentas por revisar (o en otro estado), de la más reciente a la más antigua. */
export function listarCuentasCliente(datos: Datos, filtros: { estado?: CuentaCliente["estado"]; limite?: number } = {}) {
  const condiciones: SQL[] = [];
  if (filtros.estado) condiciones.push(eq(cuentaCliente.estado, filtros.estado));
  return datos
    .select()
    .from(cuentaCliente)
    .where(and(...condiciones))
    .orderBy(desc(cuentaCliente.creadaEn), desc(cuentaCliente.id))
    .limit(filtros.limite ?? 100)
    .all();
}

// ---------------------------------------------------------------------
// Lo que ve el cliente: solo lo suyo y solo con la cuenta verificada
// ---------------------------------------------------------------------

function fichaVerificada(cuenta: CuentaCliente): number {
  exigir(
    cuenta.estado === "VERIFICADA" && cuenta.clienteId !== null,
    "CUENTA_NO_VERIFICADA",
    cuenta.estado === "RECHAZADA"
      ? "Su cuenta fue rechazada. Acérquese al local si cree que es un error."
      : "Su cuenta aún no está verificada. Acérquese al local con su carnet para activarla.",
  );
  return cuenta.clienteId;
}

/**
 * Operaciones del cliente, confirmadas o reversadas (los borradores no le
 * conciernen). Sin datos internos de la casa: ni márgenes, ni costos, ni
 * quién atendió.
 */
export function operacionesDeCuenta(datos: Datos, cuenta: CuentaCliente) {
  const clienteId = fichaVerificada(cuenta);
  return datos
    .select({
      id: operacion.id,
      tipo: operacion.tipo,
      monedaCodigo: operacion.monedaCodigo,
      montoDivisa: operacion.montoDivisa,
      tasaAplicadaE6: operacion.tasaAplicadaE6,
      montoBase: operacion.montoBase,
      medioPago: operacion.medioPago,
      estado: operacion.estado,
      tipoDte: operacion.tipoDte,
      folioDte: operacion.folioDte,
      realizadaEn: operacion.realizadaEn,
    })
    .from(operacion)
    .where(and(eq(operacion.clienteId, clienteId), ne(operacion.estado, "BORRADOR")))
    .orderBy(desc(operacion.realizadaEn), desc(operacion.id))
    .limit(500)
    .all();
}

/** La ficha del cliente, para que revise sus datos. */
export function fichaDeCuenta(datos: Datos, cuenta: CuentaCliente) {
  const clienteId = fichaVerificada(cuenta);
  return datos
    .select({
      nombre: cliente.nombre,
      tipoDocumento: cliente.tipoDocumento,
      numeroDocumento: cliente.numeroDocumento,
      nacionalidad: cliente.nacionalidad,
      oficio: cliente.oficio,
      paisResidencia: cliente.paisResidencia,
      domicilio: cliente.domicilio,
      telefono: cliente.telefono,
      email: cliente.email,
    })
    .from(cliente)
    .where(eq(cliente.id, clienteId))
    .get();
}
