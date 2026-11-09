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
