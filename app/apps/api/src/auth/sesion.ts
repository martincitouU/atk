// De la cookie de sesión a quién es: personal (con su Actor) o cliente.
//
//   cookie → Better Auth (¿sesión vigente? ¿de qué cuenta?)
//          → usuario activo con ese auth_user_id   → personal { id, rol }
//          → si no, cuenta_cliente con ese id       → cliente (cualquier estado)
//
// Un usuario del personal desactivado no obtiene nada. Cada consulta
// renueva la sesión: así vence por inactividad.

import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { Db } from "../db/conexion.ts";
import { cuentaCliente, usuario } from "../db/esquema.ts";
import type { ObtenerSesion } from "../http/acceso.ts";
import type { Auth } from "./auth.ts";

export function sesionDesdeCookie(auth: Auth, db: Db): ObtenerSesion {
  return async (request, reply) => {
    const { headers, response: sesion } = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    // Si Better Auth renovó la sesión, manda la cookie con el nuevo vencimiento
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) reply.header("set-cookie", cookies);
    if (!sesion) return null;

    const delPersonal = db
      .select({ id: usuario.id, rol: usuario.rol, activo: usuario.activo })
      .from(usuario)
      .where(eq(usuario.authUserId, sesion.user.id))
      .get();
    if (delPersonal) return delPersonal.activo ? { tipo: "personal", actor: { id: delPersonal.id, rol: delPersonal.rol } } : null;

    const cuenta = db.select().from(cuentaCliente).where(eq(cuentaCliente.authUserId, sesion.user.id)).get();
    return cuenta ? { tipo: "cliente", cuenta } : null;
  };
}
