import { setupWorker } from "msw/browser";
import { crearEstado } from "./estado.ts";
import { handlers } from "./handlers.ts";

/** El estado de los mocks en el navegador: vive hasta recargar la página. */
export const estadoGlobal = crearEstado();

export const worker = setupWorker(...handlers(estadoGlobal));
