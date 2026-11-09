// Usuarios del personal (RF-14): solo el administrador los crea y gestiona.
//
// La cuenta de Better Auth (correo y contraseña) vive en otra conexión,
// así que no comparte transacción con usuario y auditoría: se crea antes
// y, si lo demás falla, se borra.

import { asc, eq, or } from "drizzle-orm";
import { borrarCuenta, cerrarSesiones, crearCuenta, fijarContrasena, type Auth } from "../auth/auth.ts";
import { sucursal, usuario, type Rol } from "../db/esquema.ts";
import { auditar } from "./auditoria.ts";
import { enTransaccion, exigir, exigirRol, limpiar, type Actor, type Contexto, type Datos } from "./contexto.ts";


export type EntradaUsuario = { rut: string; nombre: string; email: string; rol: Rol; sucursalId?: number | null; contrasena: string };
export type CambiosUsuario = { nombre?: string; rol?: Rol; sucursalId?: number | null; activo?: boolean };

function exigirSucursal(datos: Datos, sucursalId: number | null | undefined) {
  if (sucursalId == null) return;
  const existe = datos.select({ id: sucursal.id }).from(sucursal).where(eq(sucursal.id, sucursalId)).get();
  exigir(existe, "SUCURSAL_NO_EXISTE", `La sucursal ${sucursalId} no existe`);
}

function usuarioPorId(datos: Datos, id: number) {
  const u = datos.select().from(usuario).where(eq(usuario.id, id)).get();
  exigir(u, "USUARIO_NO_EXISTE", `El usuario ${id} no existe`);
  return u;
}

/** Vista sin el id de Better Auth: solo si tiene cuenta para iniciar sesión. */
function vista<T extends { authUserId: string | null }>({ authUserId, ...resto }: T) {
  return { ...resto, tieneCuenta: authUserId !== null };
}

export function listarUsuarios(ctx: Contexto, actor: Actor) {
  exigirRol(actor, ["ADMIN"], "Ver los usuarios");
  return ctx.db.select().from(usuario).orderBy(asc(usuario.nombre)).all().map(vista);
}

/**
 * Solo el nombre de cada persona del personal, para que las pantallas
 * muestren quién registró, confirmó o reversó algo. Incluye a los
 * inactivos: lo que hicieron se sigue mostrando. Sin correo ni RUT, así que
 * lo puede ver cualquiera del personal.
 */
export function nombresDelPersonal(datos: Datos) {
  return datos.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).orderBy(asc(usuario.nombre), asc(usuario.id)).all();
}

/** El RUT y el correo llegan validados y normalizados por @atk/shared. */
export async function crearUsuario(ctx: Contexto, actor: Actor, auth: Auth, entrada: EntradaUsuario) {
  exigirRol(actor, ["ADMIN"], "Crear usuarios");
  const nombre = limpiar(entrada.nombre);
  exigir(nombre, "DATO_FALTANTE", "Indique el nombre");
  const repetido = ctx.db
    .select({ rut: usuario.rut })
    .from(usuario)
    .where(or(eq(usuario.rut, entrada.rut), eq(usuario.email, entrada.email)))
    .get();
  exigir(!repetido, "USUARIO_DUPLICADO", "Ya existe un usuario con ese RUT o correo");
  exigirSucursal(ctx.db, entrada.sucursalId);

  const authUserId = await crearCuenta(auth, { email: entrada.email, nombre, contrasena: entrada.contrasena });
  try {
    return enTransaccion(ctx, (tx) => {
      const nuevo = tx
        .insert(usuario)
        .values({ authUserId, rut: entrada.rut, nombre, email: entrada.email, rol: entrada.rol, sucursalId: entrada.sucursalId ?? null, creadoEn: ctx.ahora() })
        .returning()
        .get();
      auditar(tx, ctx, { tabla: "usuario", registroId: nuevo.id, accion: "CREAR", usuarioId: actor.id, despues: vista(nuevo) });
      return vista(nuevo);
    });
  } catch (error) {
    await borrarCuenta(auth, authUserId);
    throw error;
  }
}

/** Cambia nombre, rol, sucursal o estado. Al desactivar, cierra sus sesiones. */
export async function editarUsuario(ctx: Contexto, actor: Actor, auth: Auth, id: number, cambios: CambiosUsuario) {
  exigirRol(actor, ["ADMIN"], "Editar usuarios");
  exigir(
    id !== actor.id || ((cambios.rol === undefined || cambios.rol === "ADMIN") && cambios.activo !== false),
    "SIN_PERMISO",
    "No puede quitarse el rol de administrador ni desactivarse a sí mismo",
  );
  const nombre = cambios.nombre === undefined ? undefined : limpiar(cambios.nombre);
  exigir(nombre !== null, "DATO_FALTANTE", "Indique el nombre");

  const editado = enTransaccion(ctx, (tx) => {
    const antes = usuarioPorId(tx, id);
    if (Object.values(cambios).every((v) => v === undefined)) return antes; // nada que cambiar
    exigirSucursal(tx, cambios.sucursalId);
    const despues = tx
      .update(usuario)
      .set({ nombre, rol: cambios.rol, sucursalId: cambios.sucursalId, activo: cambios.activo })
      .where(eq(usuario.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "usuario", registroId: id, accion: "EDITAR", usuarioId: actor.id, antes: vista(antes), despues: vista(despues) });
    return despues;
  });
  if (cambios.activo === false && editado.authUserId) await cerrarSesiones(auth, editado.authUserId);
  return vista(editado);
}

/** El admin pone una contraseña nueva (olvido o sospecha). Cierra las sesiones abiertas. */
export async function restablecerContrasena(ctx: Contexto, actor: Actor, auth: Auth, id: number, contrasena: string) {
  exigirRol(actor, ["ADMIN"], "Restablecer contraseñas");
  const elUsuario = usuarioPorId(ctx.db, id);
  exigir(elUsuario.authUserId, "SIN_CUENTA", "El usuario no tiene cuenta para iniciar sesión");
  await fijarContrasena(auth, elUsuario.authUserId, contrasena);
  // La contraseña ya cambió en Better Auth; aquí queda constancia (sin la contraseña)
  enTransaccion(ctx, (tx) =>
    auditar(tx, ctx, { tabla: "usuario", registroId: id, accion: "EDITAR", usuarioId: actor.id, motivo: "Contraseña restablecida por un administrador" }),
  );
}

