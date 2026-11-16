import { WarningOctagonIcon } from "@phosphor-icons/react";

/**
 * El error de un campo, junto a él: ícono y texto, no solo el borde rojo. El
 * `id` es el que el campo nombra en `aria-describedby`.
 */
export function ErrorCampo({ id, mensaje }: { id: string; mensaje: string | undefined }) {
  if (!mensaje) return null;
  return (
    <p className="error-campo" id={id}>
      <WarningOctagonIcon size={15} weight="bold" aria-hidden="true" />
      {mensaje}
    </p>
  );
}
