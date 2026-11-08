// Cuentas: registro de clientes, usuarios del personal y contraseñas.

import { z } from "zod";
import { id } from "./basicos.ts";
import { ESTADOS_CUENTA_CLIENTE, ROLES } from "./constantes.ts";
import { normalizarRut, rutValido } from "./rut.ts";

/** RUT válido → forma normalizada "12345678-5". */
export const rut = z
  .string()
  .refine(rutValido, "RUT inválido: revise el número y el dígito verificador")
  .transform(normalizarRut);

export const email = z.string().trim().toLowerCase().pipe(z.email("Correo inválido").max(254));

/** El mínimo lo exige también Better Auth; el máximo evita hashes de textos enormes. */
export const contrasena = z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128);

const nombre = z.string().trim().min(1, "Indique el nombre").max(120);

/** Un cliente se registra solo en el portal. */
export const registroCliente = z.strictObject({ nombre, rut, email, contrasena });

/** El admin crea un usuario del personal. */
export const entradaUsuario = z.strictObject({
  rut,
  nombre,
  email,
  rol: z.enum(ROLES),
  /** null = todas las sucursales */
  sucursalId: id.nullish(),
  contrasena,
});

/** El admin edita un usuario. El correo y el RUT no cambian. */
export const cambiosUsuario = z
  .strictObject({ nombre, rol: z.enum(ROLES), sucursalId: id.nullable(), activo: z.boolean() })
  .partial();

export const entradaContrasena = z.strictObject({ contrasena });

export const entradaRechazoCuenta = z.strictObject({
  motivo: z.string().trim().min(1, "Indique el motivo del rechazo").max(500),
});

export const filtrosCuentasCliente = z.strictObject({
  estado: z.enum(ESTADOS_CUENTA_CLIENTE).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});


/** Datos del comando inicializar: la casa, dónde atiende y su primer administrador. */
export const entradaInicializacion = z.strictObject({
  casa: z.strictObject({
    rut,
    razonSocial: nombre,
    nombreFantasia: z.string().trim().max(120).nullish(),
  }),
  /** Divisas que opera, en el orden de la pizarra (la moneda base no va) */
  divisas: z.array(z.string().regex(/^[A-Z]{3}$/, "Código de moneda de tres letras")).min(1, "Indique al menos una divisa"),
  sucursal: z.strictObject({
    nombre,
    direccion: z.string().trim().max(200).nullish(),
    comuna: z.string().trim().max(80).nullish(),
  }),
  cajas: z.array(nombre).min(1, "Indique al menos una caja"),
  admin: z.strictObject({ rut, nombre, email, contrasena }),
});
