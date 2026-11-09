// El RUT viaja normalizado ("15555567-K", sin puntos). Para mostrarlo se
// agregan los puntos de miles, como en el carnet.

/** "15555567-K" → "15.555.567-K". Si no tiene la forma de un RUT, queda igual. */
export function formatearRut(rut: string): string {
  const coincide = /^(\d{1,9})-([\dkK])$/.exec(rut.replace(/\./g, ""));
  if (!coincide) return rut;
  const [, cuerpo = "", dv = ""] = coincide;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv.toUpperCase()}`;
}
