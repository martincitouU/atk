// Turnos de caja y cierre con arqueo (RF-06). Un turno es de una persona en
// una caja: todo lo que mueve dinero ocurre dentro de un turno abierto.

import { and, asc, eq } from "drizzle-orm";
import { arqueo, caja, moneda, operacion, saldoCaja, turno, usuario, type Turno } from "../db/esquema.ts";
import { formatearMonto } from "../dominio/dinero.ts";
import { auditar } from "./auditoria.ts";
import { enTransaccion, esSupervisor, exigir, type Actor, type Contexto, type Datos } from "./contexto.ts";

export function turnoAbiertoDe(datos: Datos, usuarioId: number): Turno | null {
  return datos.select().from(turno).where(and(eq(turno.usuarioId, usuarioId), eq(turno.estado, "ABIERTO"))).get() ?? null;
}

export function abrirTurno(ctx: Contexto, actor: Actor, cajaId: number): Turno {
  return enTransaccion(ctx, (tx) => {
    const laCaja = tx.select().from(caja).where(eq(caja.id, cajaId)).get();
    exigir(laCaja?.activa, "CAJA_NO_DISPONIBLE", `La caja ${cajaId} no existe o está inactiva`);
    exigir(!turnoAbiertoDe(tx, actor.id), "YA_TIENE_TURNO", "Ya tiene un turno abierto: ciérrelo antes de abrir otro");

    const ocupada = tx
      .select({ nombre: usuario.nombre })
      .from(turno)
      .innerJoin(usuario, eq(usuario.id, turno.usuarioId))
      .where(and(eq(turno.cajaId, cajaId), eq(turno.estado, "ABIERTO")))
      .get();
    exigir(!ocupada, "CAJA_OCUPADA", `La caja ${laCaja.nombre} ya tiene un turno abierto de ${ocupada?.nombre}`);

    const nuevo = tx.insert(turno).values({ cajaId, usuarioId: actor.id, abiertoEn: ctx.ahora() }).returning().get();
    auditar(tx, ctx, { tabla: "turno", registroId: nuevo.id, accion: "ABRIR", usuarioId: actor.id, despues: nuevo });
    return nuevo;
  });
}

/**
 * Cierra el turno con el conteo físico de cada moneda (RF-06) y devuelve,
 * por moneda, el saldo del sistema, el contado y la diferencia. Toda
 * moneda con saldo debe contarse: olvidar una no puede pasar por "cero".
 */
export function cerrarTurno(ctx: Contexto, actor: Actor, turnoId: number, conteo: Record<string, bigint>) {
  return enTransaccion(ctx, (tx) => {
    const elTurno = tx.select().from(turno).where(eq(turno.id, turnoId)).get();
    exigir(elTurno, "TURNO_NO_EXISTE", `El turno ${turnoId} no existe`);
    exigir(elTurno.estado === "ABIERTO", "TURNO_CERRADO", "El turno ya está cerrado");
    exigir(
      elTurno.usuarioId === actor.id || esSupervisor(actor),
      "SIN_PERMISO",
      "Solo quien abrió el turno, un supervisor o un administrador puede cerrarlo",
    );

    const borradores = tx
      .select({ id: operacion.id })
      .from(operacion)
      .where(and(eq(operacion.turnoId, turnoId), eq(operacion.estado, "BORRADOR")))
      .all();
    exigir(
      borradores.length === 0,
      "BORRADORES_PENDIENTES",
      `El turno tiene ${borradores.length} operación(es) en borrador: confírmelas o elimínelas antes de cerrar`,
    );

    const saldos = tx
      .select({ monedaCodigo: saldoCaja.monedaCodigo, saldo: saldoCaja.saldo, decimales: moneda.decimales })
      .from(saldoCaja)
      .innerJoin(moneda, eq(moneda.codigo, saldoCaja.monedaCodigo))
      .where(eq(saldoCaja.cajaId, elTurno.cajaId))
      .all();
    const sinContar = saldos.filter((s) => s.saldo !== 0n && conteo[s.monedaCodigo] === undefined).map((s) => s.monedaCodigo);
    exigir(sinContar.length === 0, "FALTA_CONTEO", `Falta el conteo de: ${sinContar.join(", ")}`);

    const negativos = Object.entries(conteo).filter(([, contado]) => contado < 0n).map(([codigo]) => codigo);
    exigir(negativos.length === 0, "CONTEO_INVALIDO", `El conteo no puede ser negativo: ${negativos.join(", ")}`);

    const ahora = ctx.ahora();
    const monedas = new Set([...saldos.map((s) => s.monedaCodigo), ...Object.keys(conteo)]);
    for (const codigo of [...monedas].sort()) {
      const saldoSistema = saldos.find((s) => s.monedaCodigo === codigo)?.saldo ?? 0n;
      tx.insert(arqueo)
        .values({ turnoId, monedaCodigo: codigo, saldoSistema, saldoContado: conteo[codigo] ?? 0n, registradoEn: ahora })
        .run();
    }

    const cerrado = tx
      .update(turno)
      .set({ estado: "CERRADO", cerradoEn: ahora, cerradoPor: actor.id })
      .where(eq(turno.id, turnoId))
      .returning()
      .get();
    const resultado = arqueoDeTurno(tx, turnoId);

    auditar(tx, ctx, {
      tabla: "turno",
      registroId: turnoId,
      accion: "CERRAR",
      usuarioId: actor.id,
      antes: elTurno,
      despues: {
        ...cerrado,
        arqueo: resultado.map((a) => ({
          moneda: a.monedaCodigo,
          sistema: formatearMonto(a.saldoSistema, a.decimales),
          contado: formatearMonto(a.saldoContado, a.decimales),
          diferencia: formatearMonto(a.diferencia, a.decimales),
        })),
      },
    });
    return { turno: cerrado, arqueo: resultado };
  });
}

/** Arqueo de un turno: por moneda, saldo del sistema, contado y diferencia. */
export function arqueoDeTurno(datos: Datos, turnoId: number) {
  return datos
    .select({
      monedaCodigo: arqueo.monedaCodigo,
      decimales: moneda.decimales,
      saldoSistema: arqueo.saldoSistema,
      saldoContado: arqueo.saldoContado,
      diferencia: arqueo.diferencia,
    })
    .from(arqueo)
    .innerJoin(moneda, eq(moneda.codigo, arqueo.monedaCodigo))
    .where(eq(arqueo.turnoId, turnoId))
    .orderBy(asc(arqueo.monedaCodigo))
    .all()
    .map((a) => ({ ...a, diferencia: a.diferencia ?? a.saldoContado - a.saldoSistema }));
}

/** Turnos abiertos ahora, con caja y cajero (para supervisores). */
export function turnosAbiertos(datos: Datos) {
  return datos
    .select({ turno, cajaNombre: caja.nombre, usuarioNombre: usuario.nombre })
    .from(turno)
    .innerJoin(caja, eq(caja.id, turno.cajaId))
    .innerJoin(usuario, eq(usuario.id, turno.usuarioId))
    .where(eq(turno.estado, "ABIERTO"))
    .orderBy(asc(caja.nombre))
    .all();
}
