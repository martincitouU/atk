// De la cookie de sesión al Actor que reciben los servicios.
//
//   cookie → Better Auth (¿sesión vigente? ¿de qué cuenta?)
//          → usuario con ese auth_user_id y activo → { id, rol }
//
// Una cuenta sin usuario del personal activo no obtiene actor: no puede
// llamar a ningún servicio (es el caso de un cliente o de alguien
// desactivado). Cada consulta renueva la sesión: así vence por inactividad.

import { and, eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { Db } from "../db/conexion.ts";
import { usuario } from "../db/esquema.ts";
import type { ObtenerActor } from "../http/actor.ts";
import type { Auth } from "./auth.ts";

export function actorDesdeSesion(auth: Auth, db: Db): ObtenerActor {
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
      .select({ id: usuario.id, rol: usuario.rol })
      .from(usuario)
      .where(and(eq(usuario.authUserId, sesion.user.id), eq(usuario.activo, true)))
      .get();
    return delPersonal ?? null;
  };
}
