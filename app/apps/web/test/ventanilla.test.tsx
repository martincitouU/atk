import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rutas } from "../src/app.tsx";
import { crearEstado, publicarCotizacion } from "../src/mocks/estado.ts";
import { Ventanilla } from "../src/pantallas/Ventanilla/Ventanilla.tsx";
import { estadoPrueba, RELOJ_PRUEBA, usarEstado } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";
import { texto } from "./texto.ts";

function montar() {
  render(
    <Proveedores>
      <MemoryRouter>
        <Ventanilla />
      </MemoryRouter>
    </Proveedores>,
  );
  return userEvent.setup();
}

/** Espera la pizarra: «952,00» está también en el libro (la venta de las 10:42), así que se busca dentro del letrero. */
async function esperarPizarra() {
  const pizarra = await screen.findByRole("region", { name: /pizarra/i });
  await within(pizarra).findByText("952,00");
  return pizarra;
}

const libro = () => screen.getByRole("grid", { name: "Libro del día" });

/** La app entera (riel incluido), para ir de la Ventanilla a Clientes y volver. */
function montarApp() {
  const router = createMemoryRouter(rutas, { initialEntries: ["/ventanilla"] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return { router, u: userEvent.setup() };
}

const CLAVE_REGISTRO = "atk.ventanilla.registro";

// El reloj del navegador, a la hora del comp (solo Date: los timers siguen reales para userEvent y MSW).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RELOJ_PRUEBA);
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("Ventanilla", () => {
  it("registra una venta solo con teclado y aparece confirmada en el libro", async () => {
    const u = montar();
    await esperarPizarra();
    await u.keyboard("v1450");
    await u.click(screen.getByLabelText(/folio/i));
    await u.keyboard("18234");
    await u.keyboard("{Enter}");
    const fila = await screen.findByRole("row", { name: /450,00/ });
    expect(within(fila).getByText(/confirmada/i)).toBeInTheDocument();
    expect(within(fila).getByText("18234")).toBeInTheDocument();
    expect(await screen.findByText(texto(/Venta confirmada · US\$ 450,00 · \$428\.400 · folio 18234/))).toBeInTheDocument();
    // Confirmada, el registro queda vacío y no se guarda nada para volver
    expect(sessionStorage.getItem("atk.ventanilla.registro")).toBeNull();
  });

  it("la placa muestra la vista previa y el libro sus totales del día", async () => {
    const u = montar();
    await esperarPizarra();
    await u.keyboard("v1450");
    const placa = screen.getByRole("group", { name: "Vista previa" });
    expect(await within(placa).findByText("$428.400")).toBeInTheDocument();
    expect(within(placa).getByText("Cliente paga")).toBeInTheDocument();
    expect(within(placa).getByText("$3.825")).toBeInTheDocument();

    expect(await screen.findByText("$1.215.000")).toBeInTheDocument(); // compras del comp
    expect(screen.getByText("$337.900")).toBeInTheDocument(); // ventas del comp
    expect(await screen.findByText("$3.482.150")).toBeInTheDocument(); // caja en pesos
  });

  it("un error de negocio se muestra tal cual y no borra lo escrito; corregir no duplica el borrador", async () => {
    const u = montar();
    await esperarPizarra();
    await within(libro()).findAllByRole("row", { name: /confirmada|reversada|borrador/i });
    await u.keyboard("v1450{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ingrese el tipo y folio del documento tributario antes de confirmar");
    expect(screen.getByText(/Quedó en el libro como borrador de las 10:44/)).toBeInTheDocument();
    expect(screen.getByLabelText("Monto en dólares")).toHaveValue("450");

    await u.click(screen.getByLabelText(/folio/i));
    await u.keyboard("18234{Enter}");
    const fila = await screen.findByRole("row", { name: /450,00.*confirmada/i });
    expect(fila).toBeInTheDocument();
    expect(within(libro()).getAllByRole("row")).toHaveLength(1 + 7); // cabecera + 6 de la semilla + la nueva
  });

  it("PIZARRA_CAMBIO: el mensaje del servicio y «Recalcular» confirman con la tasa nueva", async () => {
    const u = montar();
    await esperarPizarra();
    await u.keyboard("v1450");
    await u.type(screen.getByLabelText(/folio/i), "18234");
    await u.click(screen.getByLabelText("Monto en dólares"));
    await u.keyboard("b");
    expect(await screen.findByText(texto(/Borrador guardado en el libro · US\$ 450,00/))).toBeInTheDocument();
    expect(sessionStorage.getItem("atk.ventanilla.registro")).toBeNull();

    // Otra caja publica una cotización nueva del USD
    publicarCotizacion(estadoPrueba, { monedaCodigo: "USD", referenciaE6: "945000000", tipoMargen: "MONTO_FIJO", margenCompraE6: "8500000", margenVentaE6: "8500000" });

    await u.click(await screen.findByRole("button", { name: "Confirmar el borrador de las 10:44" }));
    expect(screen.getByRole("heading", { name: "Borrador de las 10:44" })).toBeInTheDocument();
    await u.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La pizarra de USD cambió desde que se registró el borrador (952,00 → 953,50): edítelo para recalcular",
    );
    await u.click(screen.getByRole("button", { name: "Recalcular" }));
    const fila = await screen.findByRole("row", { name: /450,00.*953,50.*confirmada/i });
    expect(fila).toBeInTheDocument();
  });

  it("desde US$ 5.000 pide la ficha: busca al cliente, exige propósito y confirma", async () => {
    const u = montar();
    await esperarPizarra();
    await u.keyboard("c16000");
    expect(await screen.findByText("Desde US$ 5.000 la UAF exige la ficha del cliente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear ficha" })).toHaveAttribute("href", "/clientes?nuevo=1");
    await u.selectOptions(screen.getByLabelText("Medio de pago"), "TRANSFERENCIA"); // los pesos no salen de la caja
    await u.type(screen.getByLabelText(/folio/i), "18300");

    await u.type(screen.getByLabelText("Buscar cliente"), "Pedro");
    await u.click(await screen.findByRole("button", { name: /Pedro Soto Muñoz/ }));
    expect(screen.getByText(/Ficha incompleta: falta oficio o profesión/)).toBeInTheDocument();
    const pedro = estadoPrueba.clientes.find((c) => c.nombre === "Pedro Soto Muñoz");
    expect(screen.getByRole("link", { name: "Completar la ficha" })).toHaveAttribute("href", `/clientes?id=${pedro?.id}`);
    await u.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La ficha del cliente está incompleta: falta oficio o profesión");

    await u.click(screen.getByRole("button", { name: "Cambiar" }));
    await u.type(screen.getByLabelText("Buscar cliente"), "Mariela");
    await u.click(await screen.findByRole("button", { name: /Mariela Contreras Vidal/ }));
    await u.type(screen.getByLabelText("Propósito de la operación"), "Venta de una camioneta");
    await u.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("row", { name: /6\.000,00.*confirmada/i })).toBeInTheDocument();
  });

  it("lo que se registra sobrevive a ir a «Crear ficha» y volver; Esc lo borra", async () => {
    const { router, u } = montarApp();
    await esperarPizarra();
    await u.keyboard("v16000");
    await u.selectOptions(screen.getByLabelText("Medio de pago"), "TRANSFERENCIA");
    await u.type(screen.getByLabelText(/folio/i), "18300");
    await u.click(await screen.findByRole("link", { name: "Crear ficha" }));
    expect(router.state.location.pathname).toBe("/clientes");
    await screen.findByRole("region", { name: "Nueva ficha" });

    await u.click(screen.getByRole("link", { name: /Ventanilla/ }));
    await esperarPizarra();
    expect(within(screen.getByRole("group", { name: "Tipo de operación" })).getByRole("button", { name: /Venta/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: /USD/ })).toBeChecked();
    expect(screen.getByLabelText("Monto en dólares")).toHaveValue("6.000");
    expect(screen.getByLabelText(/folio/i)).toHaveValue("18300");
    expect(screen.getByLabelText("Medio de pago")).toHaveValue("TRANSFERENCIA");
    expect(await screen.findByText("Desde US$ 5.000 la UAF exige la ficha del cliente")).toBeInTheDocument();

    // Esc limpia el registro y lo guardado
    await u.click(screen.getByRole("heading", { name: "Nueva operación" }));
    await u.keyboard("{Escape}");
    expect(screen.getByLabelText("Monto en dólares")).toHaveValue("");
    expect(screen.getByLabelText(/folio/i)).toHaveValue("");
    expect(sessionStorage.getItem(CLAVE_REGISTRO)).toBeNull();
  });

  it("un borrador retomado sigue siendo el mismo al volver de otra sección: se confirma sin duplicarlo", async () => {
    const { u } = montarApp();
    await esperarPizarra();
    await u.click(await screen.findByRole("button", { name: "Confirmar el borrador de las 09:40" }));
    expect(screen.getByRole("heading", { name: "Borrador de las 09:40" })).toBeInTheDocument();

    await u.keyboard("{F4}");
    await screen.findByRole("heading", { level: 1, name: "Clientes" });
    await u.keyboard("{F1}");
    await esperarPizarra();
    expect(screen.getByRole("heading", { name: "Borrador de las 09:40" })).toBeInTheDocument();

    await u.type(screen.getByLabelText(/folio/i), "18235{Enter}");
    // Se confirmó ese mismo borrador (el de US$ 80,00), no uno nuevo
    expect(await screen.findByText(texto(/Compra confirmada · US\$ 80,00 · \$74\.800 · folio 18235/))).toBeInTheDocument();
    expect(within(libro()).queryByText("Borrador")).not.toBeInTheDocument();
    expect(within(libro()).getAllByRole("row")).toHaveLength(1 + 6); // cabecera + las 6 de la semilla: ninguna nueva
    expect(sessionStorage.getItem(CLAVE_REGISTRO)).toBeNull();
  });

  it("lo guardado que no pasa la validación se ignora: el registro parte vacío", async () => {
    sessionStorage.setItem(CLAVE_REGISTRO, JSON.stringify({ tipo: "VENTA", moneda: "USD", monto: "45x", medioPago: "EFECTIVO", folio: "", cliente: null, proposito: "", pendiente: null }));
    montar();
    await esperarPizarra();
    expect(within(screen.getByRole("group", { name: "Tipo de operación" })).getByRole("button", { name: /Compra/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Monto en dólares")).toHaveValue("");
  });

  it("R reversa la fila elegida en un panel aparte, que exige el motivo", async () => {
    const u = montar();
    await esperarPizarra();
    await u.click(await screen.findByRole("row", { name: /10:42/ }));
    await u.keyboard("r");
    const panel = await screen.findByRole("complementary", { name: "Reversar la venta de las 10:42" });
    const reversar = within(panel).getByRole("button", { name: "Reversar" });
    expect(reversar).toBeDisabled();
    expect(within(panel).getByLabelText("Motivo del reverso")).toHaveFocus();
    await u.keyboard("Cliente se arrepintió");
    expect(reversar).toBeEnabled();
    await u.click(reversar);

    const fila = await screen.findByRole("row", { name: /10:42.*reversada/i });
    expect(within(fila).getByText("Cliente se arrepintió")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("↑/↓ en el libro eligen la fila; R sobre un borrador no abre el reverso", async () => {
    const u = montar();
    await esperarPizarra();
    await within(libro()).findAllByRole("row", { name: /confirmada/i });
    libro().focus();
    await u.keyboard("{End}");
    expect(screen.getByRole("row", { name: /09:40/ })).toHaveAttribute("aria-selected", "true");
    await u.keyboard("{ArrowUp}");
    expect(screen.getByRole("row", { name: /09:57/ })).toHaveAttribute("aria-selected", "true");
    // las flechas en el libro no tocan la divisa del registro
    expect(screen.getByRole("radio", { name: /USD/ })).toBeChecked();
    await u.keyboard("{ArrowDown}r");
    expect(await screen.findByText("Un borrador no se reversa: se confirma o se deja.")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("la cinta hace lo mismo que las teclas: Venta, el monto y Confirmar registran la operación", async () => {
    const { u } = montarApp();
    await esperarPizarra();
    const cinta = screen.getByRole("toolbar", { name: "Comandos" });
    await u.click(within(cinta).getByRole("button", { name: /^Venta/ }));
    expect(within(screen.getByRole("group", { name: "Tipo de operación" })).getByRole("button", { name: /Venta/ })).toHaveAttribute("aria-pressed", "true");
    await u.keyboard("1450");
    await u.click(screen.getByLabelText(/folio/i));
    await u.keyboard("18234");
    await u.click(within(cinta).getByRole("button", { name: /^Confirmar/ }));
    expect(await screen.findByText(texto(/Venta confirmada · US\$ 450,00/))).toBeInTheDocument();
  });

  it("la tasa que cambió queda encendida hasta que se mira", async () => {
    const u = montar();
    const pizarra = await esperarPizarra();
    const usd = within(pizarra).getByRole("button", { name: /USD/ });
    expect(usd).toHaveAttribute("aria-pressed", "false");
    expect(usd).toHaveTextContent(/Cambió hace 2 min · venta antes 949,00/i);
    usd.focus();
    await u.keyboard("{Enter}");
    expect(usd).toHaveAttribute("aria-pressed", "true");
    // Enter sobre la fila no confirma nada en el registro
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // ARS y EUR no cambiaron: no son botones
    expect(within(pizarra).queryByRole("button", { name: /ARS/ })).not.toBeInTheDocument();
  });

  it("una cotización vencida se marca y no deja confirmar en esa divisa", async () => {
    let ahora = RELOJ_PRUEBA;
    usarEstado(crearEstado(() => ahora));
    ahora = new Date(RELOJ_PRUEBA.getTime() + 13 * 60 * 60_000);
    vi.setSystemTime(ahora);
    const u = montar();
    const pizarra = await screen.findByRole("region", { name: /pizarra/i });
    expect(await within(pizarra).findAllByText(texto(/vencida · actualice la pizarra/i))).toHaveLength(3);
    await u.keyboard("v1450");
    expect(await screen.findByText(/La cotización de USD está vencida/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("Actualizar pizarra publica la referencia y los márgenes de una divisa", async () => {
    const u = montar();
    const pizarra = await esperarPizarra();
    await u.click(within(pizarra).getByRole("button", { name: "Actualizar pizarra" }));
    const dialogo = await screen.findByRole("dialog", { name: "Actualizar pizarra" });
    const eur = within(dialogo).getByRole("group", { name: /EUR/ });
    expect(within(eur).getByLabelText("Referencia")).toHaveValue("1032");
    expect(within(eur).getByLabelText("Margen en")).toHaveValue("MONTO_FIJO");
    const venta = within(eur).getByLabelText("Margen venta ($)");
    await u.clear(venta);
    await u.type(venta, "18");
    expect(within(eur).getByText("1.050,00")).toBeInTheDocument(); // quedará: 1.032 + 18
    await u.click(within(dialogo).getByRole("button", { name: "Publicar" }));
    expect(await within(pizarra).findByText("1.050,00")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
