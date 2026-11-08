// Registro inmutable de lo que pasa (RF-15). Cada servicio audita dentro de
// la misma transacción que el cambio: si el cambio se deshace, su registro
// también.

import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { auditoria, type ACCIONES_AUDITORIA } from "../db/esquema.ts";
import { exigirRol, type Actor, type Contexto, type Datos } from "./contexto.ts";

export type Accion = (typeof ACCIONES_AUDITORIA)[number];

/** JSON no tiene bigint: los montos quedan como texto exacto; las fechas, en ISO. */
function aJsonPlano(valor: unknown): unknown {
  if (valor === undefined || valor === null) return null;
  return JSON.parse(JSON.stringify(valor, (_clave, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));
}

export function auditar(
  datos: Datos,
  ctx: Contexto,
  evento: {
    tabla: string;
    registroId: string | number;
    accion: Accion;
    usuarioId: number;
    motivo?: string | null;
    antes?: unknown;
    despues?: unknown;
  },
): void {
  datos
    .insert(auditoria)
    .values({
      tabla: evento.tabla,
      registroId: String(evento.registroId),
      accion: evento.accion,
      motivo: evento.motivo ?? null,
      datosAntes: aJsonPlano(evento.antes),
      datosDespues: aJsonPlano(evento.despues),
      usuarioId: evento.usuarioId,
      registradoEn: ctx.ahora(),
    })
    .run();
}

export type FiltrosAuditoria = {
  desde?: Date;
  hasta?: Date;
  tabla?: string;
  registroId?: string;
  usuarioId?: number;
  accion?: Accion;
  limite?: number;
};

/** Consulta del administrador (RF-15), de lo más reciente a lo más antiguo. */
export function consultarAuditoria(ctx: Contexto, actor: Actor, filtros: FiltrosAuditoria = {}) {
  exigirRol(actor, ["ADMIN"], "Consultar la auditoría");
  const condiciones: SQL[] = [];
  if (filtros.desde) condiciones.push(gte(auditoria.registradoEn, filtros.desde));
  if (filtros.hasta) condiciones.push(lt(auditoria.registradoEn, filtros.hasta));
  if (filtros.tabla) condiciones.push(eq(auditoria.tabla, filtros.tabla));
  if (filtros.registroId) condiciones.push(eq(auditoria.registroId, filtros.registroId));
  if (filtros.usuarioId !== undefined) condiciones.push(eq(auditoria.usuarioId, filtros.usuarioId));
  if (filtros.accion) condiciones.push(eq(auditoria.accion, filtros.accion));

  return ctx.db
    .select()
    .from(auditoria)
    .where(and(...condiciones))
    .orderBy(desc(auditoria.id))
    .limit(Math.min(filtros.limite ?? 200, 1000))
    .all();
}
