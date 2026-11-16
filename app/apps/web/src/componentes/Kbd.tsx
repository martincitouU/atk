import type { ComponentProps } from "react";

/** Una tecla del teclado, como la imprime la caja registradora. */
export function Kbd(props: ComponentProps<"kbd">) {
  return <kbd {...props} />;
}
