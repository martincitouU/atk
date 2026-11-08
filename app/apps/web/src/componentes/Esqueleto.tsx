/**
 * Lo que se ve mientras llega el código de una pantalla: el letrero y dos
 * paneles en gris, del tamaño de lo que viene (sin spinner). Con el riel ya
 * dibujado, el cambio de sección no salta.
 */
export function EsqueletoPantalla() {
  return (
    <div className="esqueleto-pantalla" aria-busy="true">
      <span className="oculto">Cargando la pantalla…</span>
      <span className="esqueleto esqueleto-letrero" aria-hidden="true" />
      <div className="esqueleto-paneles" aria-hidden="true">
        <span className="esqueleto" />
        <span className="esqueleto" />
      </div>
    </div>
  );
}

/** La espera de /entrar: la columna del letrero y el formulario, centrada. */
export function EsqueletoEntrar() {
  return (
    <div className="esqueleto-entrar" aria-busy="true">
      <span className="oculto">Cargando…</span>
      <span className="esqueleto esqueleto-letrero" aria-hidden="true" />
      <span className="esqueleto esqueleto-formulario" aria-hidden="true" />
    </div>
  );
}
