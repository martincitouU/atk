// Primera configuración de una base de producción vacía: la casa, sus
// divisas, la sucursal, las cajas y el primer administrador. Se hace una
// sola vez, con el comando cli/inicializar.ts. Después, el admin crea al
// resto del personal y publica los tipos de cambio desde la app.
//
// En producción NUNCA se carga la semilla de ejemplo: los datos reales
// entran por aquí.

import { eq } from "drizzle-orm";
import { borrarCuenta, crearCuenta, type Auth } from "../auth/auth.ts";
import { caja, casa, casaMoneda, moneda, sucursal, usuario } from "../db/esquema.ts";
import { auditar } from "./auditoria.ts";
import { enTransaccion, exigir, limpiar, type Contexto } from "./contexto.ts";

const MONEDA_BASE = "CLP";

/** Decimales con que se publica el precio. El ARS vale menos de 1 CLP: necesita más. */
const DECIMALES_TASA: Record<string, number> = { ARS: 4 };

export type EntradaInicializacion = {
  casa: { rut: string; razonSocial: string; nombreFantasia?: string | null };
  divisas: string[];
  sucursal: { nombre: string; direccion?: string | null; comuna?: string | null };
  cajas: string[];
  admin: { rut: string; nombre: string; email: string; contrasena: string };
};

export function estaInicializada(ctx: Contexto): boolean {
  return ctx.db.select({ id: casa.id }).from(casa).get() !== undefined;
}

/** Los RUT y el correo llegan validados y normalizados por @atk/shared. */
export async function inicializar(ctx: Contexto, auth: Auth, e: EntradaInicializacion) {
  exigir(!estaInicializada(ctx), "YA_INICIALIZADA", "La casa de cambio ya está configurada");
  const divisas = [...new Set(e.divisas)];
  for (const codigo of divisas) {
    exigir(codigo !== MONEDA_BASE, "MONEDA_INVALIDA", `${MONEDA_BASE} es la moneda base: no se compra ni se vende`);
    const existe = ctx.db.select({ codigo: moneda.codigo }).from(moneda).where(eq(moneda.codigo, codigo)).get();
    exigir(existe, "MONEDA_NO_EXISTE", `La moneda ${codigo} no está en el catálogo`);
  }

  const authUserId = await crearCuenta(auth, { email: e.admin.email, nombre: e.admin.nombre, contrasena: e.admin.contrasena });
  try {
    return enTransaccion(ctx, (tx) => {
      const ahora = ctx.ahora();
      const laCasa = tx
        .insert(casa)
        .values({ id: 1, rut: e.casa.rut, razonSocial: e.casa.razonSocial, nombreFantasia: limpiar(e.casa.nombreFantasia), monedaBase: MONEDA_BASE, creadaEn: ahora })
        .returning()
        .get();
      divisas.forEach((codigo, i) =>
        tx.insert(casaMoneda).values({ monedaCodigo: codigo, decimalesTasa: DECIMALES_TASA[codigo] ?? 2, ordenPizarra: i + 1 }).run(),
      );
      const laSucursal = tx
        .insert(sucursal)
        .values({ nombre: e.sucursal.nombre, direccion: limpiar(e.sucursal.direccion), comuna: limpiar(e.sucursal.comuna) })
        .returning()
        .get();
      const cajas = e.cajas.map((nombre) => tx.insert(caja).values({ sucursalId: laSucursal.id, nombre }).returning().get());
      const admin = tx
        .insert(usuario)
        .values({ authUserId, rut: e.admin.rut, nombre: e.admin.nombre, email: e.admin.email, rol: "ADMIN", sucursalId: null, creadoEn: ahora })
        .returning()
        .get();

      auditar(tx, ctx, {
        tabla: "casa",
        registroId: laCasa.id,
        accion: "CREAR",
        usuarioId: admin.id,
        motivo: "Configuración inicial",
        despues: { casa: laCasa, divisas, sucursal: laSucursal, cajas, admin: { id: admin.id, rut: admin.rut, email: admin.email } },
      });
      return { casa: laCasa, divisas, sucursal: laSucursal, cajas, adminId: admin.id };
    });
  } catch (error) {
    await borrarCuenta(auth, authUserId);
    throw error;
  }
}
