// Sin HTTPS, lo que se escribe (contraseñas, RUT) viaja sin cifrar. Hasta
// tener dominio y certificado, la app lo advierte para que nadie use datos
// reales (CLAUDE.md › Decisiones pendientes).

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function conexionSinCifrar(ubicacion: Pick<Location, "protocol" | "hostname"> = window.location): boolean {
  return ubicacion.protocol === "http:" && !LOCALES.has(ubicacion.hostname);
}
