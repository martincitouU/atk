// Piezas que comparten las rutas.

import { idEnTexto } from "@atk/shared";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

const conId = z.object({ id: idEnTexto });

/** El :id de la URL como número (400 si no lo es). */
export const idDe = (request: FastifyRequest) => conId.parse(request.params).id;
