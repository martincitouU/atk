// RUT chileno: validación del dígito verificador y forma única de guardarlo.

/** RUT con dígito verificador correcto ("12.345.678-5" o "12345678-5"). */
export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/\./g, "").trim().toUpperCase();
  const partes = /^(\d{1,8})-([\dK])$/.exec(limpio);
  if (!partes) return false;
  const [, cuerpo = "", dv] = partes;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** Forma en que se guarda: sin puntos, con guion y K mayúscula ("12345678-5"). */
export function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").trim().toUpperCase();
}
