// ESQUELETO (F1): franja que recuerda que los datos son de ejemplo.
// Se elimina en F2 junto con ejemplo/datos.ts.

import css from "./AvisoEsqueleto.module.css";

export function AvisoEsqueleto() {
  return (
    <p className={css.aviso}>
      Esqueleto: datos de ejemplo, todavía sin conexión a la API. Los botones de guardar no hacen nada.
    </p>
  );
}
