// Fechas para mostrar, siempre en la zona horaria de la casa (parámetro
// zona_horaria: America/Coyhaique), no en la del computador del usuario.
//
// Coyhaique está en UTC−3 todo el año desde 2025. Un navegador antiguo puede
// no conocer esa zona: entonces se usa el desfase fijo −03:00, que es igual.

export const ZONA_CASA = "America/Coyhaique";

function formateador(opciones: Intl.DateTimeFormatOptions, zona: string, idioma = "es-CL") {
  try {
    return new Intl.DateTimeFormat(idioma, { ...opciones, timeZone: zona });
  } catch {
    return new Intl.DateTimeFormat(idioma, { ...opciones, timeZone: "-03:00" });
  }
}

const HORA: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/** "2026-11-08T18:30:00.000Z" → "15:30" */
export function formatearHora(iso: string, zona = ZONA_CASA): string {
  return formateador(HORA, zona).format(new Date(iso));
}

/** "2026-11-08T18:30:00.000Z" → "8 nov 2026, 15:30" */
export function formatearFechaHora(iso: string, zona = ZONA_CASA): string {
  return formateador({ day: "numeric", month: "short", year: "numeric", ...HORA }, zona).format(new Date(iso));
}

/**
 * Fecha sin hora ("2026-11-08", ya en la zona de la casa) → "8 nov 2026".
 * Se formatea en UTC para que no se corra un día según el computador.
 */
export function formatearDia(dia: string): string {
  return formateador({ day: "numeric", month: "short", year: "numeric" }, "UTC").format(new Date(`${dia}T00:00:00Z`));
}

/** Hoy en la zona de la casa, como "AAAA-MM-DD" (para filtros y campos de fecha). */
export function hoy(zona = ZONA_CASA, ahora = new Date()): string {
  // en-CA escribe las fechas como AAAA-MM-DD
  return formateador({ year: "numeric", month: "2-digit", day: "2-digit" }, zona, "en-CA").format(ahora);
}

/** El primer día del mes de una fecha: "2026-11-08" → "2026-11-01". */
export const inicioDelMes = (dia: string): string => `${dia.slice(0, 8)}01`;

/** "2026-11-30" → "2026-12-01", sin depender de la zona del computador. */
export function diaSiguiente(dia: string): string {
  const [anio = 0, mes = 1, numero = 1] = dia.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, numero + 1)).toISOString().slice(0, 10);
}

/**
 * El instante en que empieza un día en la zona de la casa, para los filtros
 * de la API que piden fecha y hora: "2026-11-08" → "2026-11-08T00:00:00-03:00".
 * Un filtro "hasta el 8" se envía como el inicio del 9 (la API lo excluye).
 */
export function inicioDelDia(dia: string, zona = ZONA_CASA): string {
  return instanteDeHora(dia, "00:00", zona);
}

/**
 * Una hora de un día en la zona de la casa, como instante para la API:
 * ("2026-11-08", "14:05") → "2026-11-08T14:05:00-03:00". Sirve para la hora
 * real de una operación registrada después (registro diferido).
 */
export function instanteDeHora(dia: string, hora: string, zona = ZONA_CASA): string {
  return `${dia}T${hora}:00${desfaseDe(dia, zona)}`;
}

/** El desfase de la zona ese día ("-03:00"), leído a mediodía UTC, lejos de un cambio de hora. */
function desfaseDe(dia: string, zona: string): string {
  const partes = formateador({ timeZoneName: "longOffset" }, zona, "en-US").formatToParts(new Date(`${dia}T12:00:00Z`));
  const nombre = partes.find((p) => p.type === "timeZoneName")?.value ?? "";
  return /GMT([+-]\d{2}:\d{2})/.exec(nombre)?.[1] ?? (nombre === "GMT" ? "+00:00" : "-03:00");
}
