// Fechas locales de la casa de cambio. En la base todo es UTC; "el día" de
// un reporte o del resumen de la jornada se corta en la zona horaria de la
// casa (parámetro zona_horaria), considerando los cambios de horario.

const formatoFecha = (zona: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });

/** Fecha local "YYYY-MM-DD" de un instante. */
export function fechaLocal(instante: Date, zona: string): string {
  return formatoFecha(zona).format(instante);
}

/** Cuánto adelanta (ms) la hora local respecto de UTC en ese instante. */
function desfase(instante: number, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instante));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second"));
  return comoUtc - (instante - (instante % 1000));
}

export function validarFecha(fecha: string): void {
  const [a, m, d] = fecha.split("-").map(Number);
  const real = new Date(Date.UTC(a ?? NaN, (m ?? NaN) - 1, d ?? NaN));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || real.toISOString().slice(0, 10) !== fecha) {
    throw new RangeError(`"${fecha}" no es una fecha válida (AAAA-MM-DD)`);
  }
}

/**
 * Primer instante del día local `fecha`. Si ese día empieza con un salto
 * de horario (por ejemplo, de 00:00 a 01:00), devuelve el primer instante
 * que de verdad existe.
 */
export function inicioDelDia(fecha: string, zona: string): Date {
  validarFecha(fecha);
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const medianoche = Date.UTC(a, m - 1, d);

  // Candidatos: medianoche con el desfase de antes y de después de un
  // posible cambio de horario. Gana el más temprano que cae en `fecha`.
  const primero = medianoche - desfase(medianoche, zona);
  const segundo = medianoche - desfase(primero, zona);
  const candidatos = [primero, segundo].filter((t) => fechaLocal(new Date(t), zona) === fecha);
  const inicio = Math.min(...candidatos);
  if (!Number.isFinite(inicio)) throw new RangeError(`No se pudo calcular el inicio de ${fecha} en ${zona}`);
  return new Date(inicio);
}

/** Día siguiente a una fecha "YYYY-MM-DD". */
export function diaSiguiente(fecha: string): string {
  validarFecha(fecha);
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** [desde, hasta) del día local `fecha`, en instantes UTC. */
export function rangoDelDia(fecha: string, zona: string): { desde: Date; hasta: Date } {
  return { desde: inicioDelDia(fecha, zona), hasta: inicioDelDia(diaSiguiente(fecha), zona) };
}
