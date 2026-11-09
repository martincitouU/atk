// Orbes de color difuminados de fondo (DESIGN.md › Floating Decorative Orb).
// Pura decoración: solo en el login, el registro y el portal. Las vistas de
// trabajo se quedan en blanco. Se detienen si el sistema pide menos movimiento.

import css from "./Orbes.module.css";

export function Orbes() {
  return (
    <div className={css.orbes} aria-hidden>
      <span className={`${css.orbe} ${css.violeta}`} />
      <span className={`${css.orbe} ${css.naranja}`} />
      <span className={`${css.orbe} ${css.rosa}`} />
      <span className={`${css.orbe} ${css.cian}`} />
      <span className={`${css.orbe} ${css.menta}`} />
      <span className={`${css.orbe} ${css.coral}`} />
    </div>
  );
}
