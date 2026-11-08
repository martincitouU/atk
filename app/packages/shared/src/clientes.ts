// Fichas de clientes (RF-17) y categorías de fidelización (RF-18).

import { z } from "zod";
import { escalaE6, id } from "./basicos.ts";
import { TIPOS_DOCUMENTO } from "./constantes.ts";

const opcional = (max: number) => z.string().max(max).nullish();
/** Código ISO 3166-1 de 2 letras (CL, AR); el servicio lo pasa a mayúsculas */
const pais = z.string().regex(/^[A-Za-z]{2}$/, "Código de país de 2 letras, por ejemplo CL").nullish();

const campos = {
  tipoDocumento: z.enum(TIPOS_DOCUMENTO),
  /** Si es RUT, el servicio valida el dígito verificador y quita los puntos */
  numeroDocumento: z.string().trim().min(1, "Indique el número de documento").max(30),
  nombre: z.string().trim().min(1, "Indique el nombre").max(120),
  nacionalidad: pais,
  oficio: opcional(120),
  paisResidencia: pais,
  domicilio: opcional(200),
  telefono: opcional(40),
  email: opcional(254),
  relacionPermanente: z.boolean().optional(),
  categoriaId: id.nullish(),
};

export const entradaCliente = z.strictObject(campos);
export const cambiosCliente = z.strictObject(campos).partial();

export const filtrosClientes = z.strictObject({
  /** Busca en nombre y número de documento */
  q: z.string().trim().min(1, "Escriba al menos un carácter").max(60),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});

export const entradaCategoriaCliente = z.strictObject({
  nombre: z.string().trim().min(1).max(60),
  /** Cuánto se reduce el margen, en % ×10^6: 30 % → "30000000" */
  descuentoMargenPctE6: escalaE6,
});
