import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { rutas } from "../src/app.tsx";
import { estadoPrueba } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";
import { texto } from "./texto.ts";

function montar(entrada: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [entrada] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return { router, u: userEvent.setup() };
}

const tabla = () => screen.getByRole("table", { name: "Fichas" });
const filaDe = (nombre: string) => within(tabla()).getByRole("row", { name: new RegExp(nombre) });

describe("Clientes", () => {
  it("lista las fichas y marca con texto lo que le falta a la incompleta", async () => {
    const { u } = montar("/clientes");
    // La API busca solo con texto: sin búsqueda, la tabla invita a buscar
    expect(await screen.findByText("Escriba un nombre o un documento para buscar la ficha.")).toBeInTheDocument();
    await u.type(screen.getByRole("searchbox", { name: "Buscar cliente" }), "e");
    await within(await screen.findByRole("table", { name: "Fichas" })).findByText("Pedro Soto Muñoz");

    const pedro = filaDe("Pedro Soto Muñoz");
    expect(within(pedro).getByText("Falta para la UAF")).toBeInTheDocument();
    expect(within(pedro).getByText(texto(/^oficio o profesión · país de residencia · domicilio · contacto/))).toBeInTheDocument();
    expect(within(pedro).getByText("22.222.222-2")).toBeInTheDocument();
    expect(within(filaDe("Mariela Contreras Vidal")).getByText("Completa")).toBeInTheDocument();
    expect(screen.getByText(texto("4 clientes · 1 con la ficha incompleta"))).toBeInTheDocument();
    // La cabecera avisa que son datos de ejemplo, como las otras pantallas
    expect(screen.getByText(texto("Fichas para la UAF · datos de ejemplo"))).toBeInTheDocument();
  });

  it("busca por nombre o documento", async () => {
    const { u } = montar("/clientes");
    await u.type(await screen.findByRole("searchbox", { name: "Buscar cliente" }), "e");
    await screen.findByText("Hannah Weber");
    await u.clear(screen.getByRole("searchbox", { name: "Buscar cliente" }));
    await u.type(screen.getByRole("searchbox", { name: "Buscar cliente" }), "AAB1");
    await waitFor(() => expect(within(tabla()).queryByText("Hannah Weber")).not.toBeInTheDocument());
    expect(within(tabla()).getByText("Julián Ferreyra")).toBeInTheDocument();

    await u.clear(screen.getByRole("searchbox", { name: "Buscar cliente" }));
    await u.type(screen.getByRole("searchbox", { name: "Buscar cliente" }), "nadie así");
    expect(await screen.findByText("Ningún cliente coincide con «nadie así».")).toBeInTheDocument();
  });

  it("?nuevo=1 abre la ficha nueva; el RUT inválido se rechaza junto al campo y, corregido, se crea", async () => {
    const { router, u } = montar("/clientes?nuevo=1");
    const ficha = await screen.findByRole("region", { name: "Nueva ficha" });

    // Vacía, cada dato de la UAF dice que falta (con texto, no solo color)
    expect(within(ficha).getAllByText("Falta para la UAF")).toHaveLength(5);

    // Sin nombre ni documento no se envía
    await u.click(within(ficha).getByRole("button", { name: "Crear ficha" }));
    expect(within(ficha).getByText("Indique el número de documento")).toBeInTheDocument();
    expect(within(ficha).getByText("Indique el nombre del cliente")).toBeInTheDocument();

    await u.type(within(ficha).getByLabelText("Número de documento"), "12.345.678-9");
    await u.type(within(ficha).getByLabelText("Nombre completo"), "Ana Ruiz Toledo");
    await u.type(within(ficha).getByLabelText("Nacionalidad"), "cl");
    await u.type(within(ficha).getByLabelText("País de residencia"), "CL");
    await u.type(within(ficha).getByLabelText("Oficio o profesión"), "Profesora");
    await u.type(within(ficha).getByLabelText("Domicilio"), "Prat 340, Coyhaique");
    await u.type(within(ficha).getByLabelText("Teléfono"), "+56 9 7000 1122");
    expect(within(ficha).queryByText("Falta para la UAF")).not.toBeInTheDocument();
    expect(within(ficha).getByLabelText("Nacionalidad")).toHaveAccessibleDescription("Chile");

    await u.click(within(ficha).getByRole("button", { name: "Crear ficha" }));
    // El mensaje del mock (el mismo algoritmo del servicio), tal cual y junto al número
    const documento = within(ficha).getByLabelText("Número de documento");
    expect(await within(ficha).findByText("El RUT 12.345.678-9 no es válido")).toBeInTheDocument();
    expect(documento).toHaveAttribute("aria-invalid", "true");
    expect(documento).toHaveFocus();

    await u.clear(documento);
    await u.type(documento, "12.345.678-5");
    await u.click(within(ficha).getByRole("button", { name: "Crear ficha" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ficha creada: Ana Ruiz Toledo.");
    expect(screen.getByRole("link", { name: /Volver a la Ventanilla/ })).toHaveAttribute("href", "/ventanilla");
    // La ficha creada queda abierta y en la URL
    const ana = estadoPrueba.clientes.find((c) => c.nombre === "Ana Ruiz Toledo");
    expect(router.state.location.search).toBe(`?id=${ana?.id}`);
    expect(await screen.findByRole("region", { name: "Ana Ruiz Toledo" })).toBeInTheDocument();
    expect(await within(tabla()).findByText("Completa")).toBeInTheDocument();
    expect(within(filaDe("Ana Ruiz Toledo")).getByText("Completa")).toBeInTheDocument();
    expect(estadoPrueba.clientes.find((c) => c.nombre === "Ana Ruiz Toledo")).toMatchObject({
      numeroDocumento: "12345678-5",
      nacionalidad: "CL",
      email: null,
    });
  });

  it("completa la ficha de Pedro Soto y deja de faltar para la UAF", async () => {
    const { u } = montar("/clientes");
    await u.type(await screen.findByRole("searchbox", { name: "Buscar cliente" }), "Pedro");
    await u.click(await screen.findByRole("button", { name: "Pedro Soto Muñoz" }));
    const ficha = screen.getByRole("region", { name: "Pedro Soto Muñoz" });
    expect(within(ficha).getByLabelText("Nacionalidad")).toHaveValue("CL");
    expect(within(ficha).getByText("Faltan 4 datos para la UAF")).toBeInTheDocument();

    await u.type(within(ficha).getByLabelText("Oficio o profesión"), "Transportista");
    await u.type(within(ficha).getByLabelText("País de residencia"), "CL");
    await u.type(within(ficha).getByLabelText("Domicilio"), "Simpson 120, Coyhaique");
    await u.type(within(ficha).getByLabelText("Email"), "psoto@ejemplo.com");
    await u.click(within(ficha).getByRole("button", { name: "Guardar ficha" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ficha guardada: Pedro Soto Muñoz.");
    expect(screen.queryByRole("link", { name: /Volver a la Ventanilla/ })).not.toBeInTheDocument();
    expect(await within(filaDe("Pedro Soto Muñoz")).findByText("Completa")).toBeInTheDocument();
  });

  it("?id= abre la ficha de ese cliente (el «Completar la ficha» de la Ventanilla) y, guardada, ofrece volver", async () => {
    const pedro = estadoPrueba.clientes.find((c) => c.nombre === "Pedro Soto Muñoz");
    const { router, u } = montar(`/clientes?id=${pedro?.id}`);
    const ficha = await screen.findByRole("region", { name: "Pedro Soto Muñoz" });
    expect(within(ficha).getByText("Faltan 4 datos para la UAF")).toBeInTheDocument();
    expect(within(tabla()).getByRole("button", { name: "Pedro Soto Muñoz" })).toHaveAttribute("aria-current", "true");

    await u.type(within(ficha).getByLabelText("Oficio o profesión"), "Transportista");
    await u.click(within(ficha).getByRole("button", { name: "Guardar ficha" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ficha guardada: Pedro Soto Muñoz.");
    expect(screen.getByRole("link", { name: /Volver a la Ventanilla/ })).toHaveAttribute("href", "/ventanilla");

    await u.click(within(screen.getByRole("region", { name: "Pedro Soto Muñoz" })).getByRole("button", { name: "Cerrar la ficha" }));
    expect(router.state.location.search).toBe("");
    expect(screen.getByRole("region", { name: "Ficha del cliente" })).toBeInTheDocument();
  });

  it("?id= de un cliente que no existe muestra el mensaje del servidor", async () => {
    montar("/clientes?id=999");
    expect(await screen.findByRole("alert")).toHaveTextContent("El cliente 999 no existe");
  });
});

describe("Configuración", () => {
  it("muestra divisas, denominaciones y parámetros en solo lectura, con el aviso fijo", async () => {
    montar("/configuracion");
    expect(await screen.findByText("La configuración se cambia, por ahora, con el equipo de ATK.")).toBeInTheDocument();

    const divisas = await screen.findByRole("table", { name: "Divisas" });
    const usd = await within(divisas).findByRole("row", { name: /USD/ });
    expect(within(usd).getByText("Dólar")).toBeInTheDocument();
    expect(await within(usd).findByText("US$ 1,00")).toBeInTheDocument();
    const ars = within(divisas).getByRole("row", { name: /ARS/ });
    expect(within(ars).getByText("4")).toBeInTheDocument(); // decimales de la tasa
    expect(within(divisas).getByText(/Moneda base:/)).toHaveTextContent("Moneda base: CLP · Peso chileno ($), sin decimales.");

    const billetesUsd = screen.getByRole("list", { name: "Billetes de Dólar" });
    expect(within(billetesUsd).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["100", "50", "20", "10", "5", "1"]);
    expect(within(screen.getByRole("list", { name: "Billetes de Peso chileno" })).getByText("20.000")).toBeInTheDocument();

    expect(await screen.findByText("desde US$ 5.000")).toBeInTheDocument();
    expect(screen.getByText("tras 15 min sin actividad")).toBeInTheDocument();
    expect(screen.getByText("720 min (12 h)")).toBeInTheDocument();
    expect(screen.getByText("America/Coyhaique")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
