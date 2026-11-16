/**
 * El código de una divisa con su punto de color fijo (--usd, --ars, --eur).
 * Una divisa sin color propio lleva el gris neutro.
 */
export function Divisa({ codigo }: { codigo: string }) {
  return (
    <span className="divisa">
      <i aria-hidden="true" style={{ background: `var(--${codigo.toLowerCase()}, var(--neutro))` }} />
      {codigo}
    </span>
  );
}
