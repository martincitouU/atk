// Esquemas y constantes compartidos entre la API y el front.
//
// Cada esquema zod describe lo que el front envía (z.input: montos como
// texto) y lo que recibe el servicio tras validar (z.output: montos como
// bigint). El front puede usar los mismos esquemas en sus formularios.

export * from "./basicos.ts";
export * from "./caja.ts";
export * from "./clientes.ts";
export * from "./consultas.ts";
export * from "./constantes.ts";
export * from "./cotizaciones.ts";
export * from "./cuentas.ts";
export * from "./gastos.ts";
export * from "./operaciones.ts";
export * from "./rut.ts";
