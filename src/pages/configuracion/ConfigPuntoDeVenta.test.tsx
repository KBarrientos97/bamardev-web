import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigPos } from "../../lib/configPos";

/**
 * Configuración › Punto de venta (16-nov): la vista de los productos, dónde se
 * cobra, íconos, filtros y el orden de las categorías. Cada cambio se guarda al
 * tocarlo y la sesión se entera en el acto; si el servidor no lo guarda, se
 * dice al lado y vuelve a lo de antes.
 */

const fijarConfigPos = vi.fn();

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "RESTAURANTE", fijarConfigPos }),
}));

vi.mock("../../lib/api", () => ({
  api: { configPos: vi.fn(), guardarConfigPos: vi.fn(), getCategorias: vi.fn() },
}));

import { api } from "../../lib/api";
import ConfigPuntoDeVenta from "./ConfigPuntoDeVenta";

const DE_SIEMPRE: ConfigPos = { vista: "TARJETAS", cobro: "APARTE", iconos: true, filtros: true, ordenCategorias: [] };
const CATEGORIAS = [
  { id: 1, nombre: "Pollos", activo: true },
  { id: 2, nombre: "Bebidas", activo: true },
  { id: 3, nombre: "Extras", activo: true },
];

async function abrir() {
  render(
    <MemoryRouter>
      <ConfigPuntoDeVenta />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** Lo que devuelve el PATCH: la configuración entera, con lo pedido. */
function guardaTodo() {
  let enServidor = { ...DE_SIEMPRE };
  vi.mocked(api.guardarConfigPos).mockImplementation(async (cambios) => {
    enServidor = { ...enServidor, ...cambios } as typeof DE_SIEMPRE;
    return enServidor;
  });
}

const opcion = (nombre: RegExp) => screen.getByRole("radio", { name: nombre });
const categoriasEnPantalla = () =>
  within(screen.getByRole("list", { name: "Orden de las categorías" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.replace(/^\d+/, ""));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.configPos).mockResolvedValue({ ...DE_SIEMPRE });
  vi.mocked(api.getCategorias).mockResolvedValue(CATEGORIAS);
  guardaTodo();
});

describe("Configuración › Punto de venta: lo que se ve", () => {
  it("el título, la vuelta a Configuración y lo de siempre elegido", async () => {
    await abrir();
    expect(screen.getByRole("heading", { level: 1, name: "Punto de venta" })).toBeInTheDocument();
    expect(screen.getByText("Cómo se ven los productos y cómo se cobra.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Configuración" })).toHaveAttribute("href", "/configuracion");
    expect(opcion(/^Tarjetas/)).toHaveAttribute("aria-checked", "true");
    expect(opcion(/^Columnas por categoría/)).toHaveAttribute("aria-checked", "false");
    expect(opcion(/^En pantalla aparte/)).toHaveAttribute("aria-checked", "true");
    expect(opcion(/^En la misma pantalla/)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Mostrar íconos de los productos" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Mostrar filtros de categoría" })).toHaveAttribute("aria-checked", "true");
    expect(categoriasEnPantalla()).toEqual(["Pollos", "Bebidas", "Extras"]);
    // Sin orden elegido no hay a qué volver.
    expect(screen.queryByRole("button", { name: "Volver al orden de siempre" })).not.toBeInTheDocument();
  });

  it("cada opción dice qué hace; las columnas y el cobro avisan qué pasa en el celular", async () => {
    await abrir();
    expect(opcion(/^Tarjetas/)).toHaveTextContent("Los productos en tarjetas, con su ícono. La de siempre.");
    expect(opcion(/^Columnas por categoría/)).toHaveTextContent(
      "Una columna por categoría, en lista. Entra más a la vista. En el celular se ven las tarjetas de siempre.",
    );
    expect(opcion(/^En pantalla aparte/)).toHaveTextContent("Cobrar abre la pantalla de cobro. La de siempre.");
    expect(opcion(/^En la misma pantalla/)).toHaveTextContent(
      "El medio de pago, el efectivo y Confirmar quedan al lado de los productos. En computadora y tablet horizontal; en el celular se cobra como siempre.",
    );
    expect(screen.getByText(/El orden vale para los filtros y para las columnas del punto de venta/)).toBeInTheDocument();
  });

  it("mesa o para llevar no es un ajuste: se trabaja como hoy", async () => {
    await abrir();
    expect(screen.queryByText(/mesa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/llevar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/El pedido arranca/)).not.toBeInTheDocument();
  });

  it("abre con lo que tiene guardado el negocio", async () => {
    vi.mocked(api.configPos).mockResolvedValue({ vista: "COLUMNAS", cobro: "EN_VENTA", iconos: false, filtros: false, ordenCategorias: [3, 1] });
    await abrir();
    expect(opcion(/^Columnas por categoría/)).toHaveAttribute("aria-checked", "true");
    expect(opcion(/^En la misma pantalla/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Mostrar íconos de los productos" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Mostrar filtros de categoría" })).toHaveAttribute("aria-checked", "false");
    // Las que no están en el orden elegido, al final.
    expect(categoriasEnPantalla()).toEqual(["Extras", "Pollos", "Bebidas"]);
  });

  it("un backend que todavía no lo tiene: lo de fábrica", async () => {
    vi.mocked(api.configPos).mockResolvedValue({});
    await abrir();
    expect(opcion(/^Tarjetas/)).toHaveAttribute("aria-checked", "true");
    expect(opcion(/^En pantalla aparte/)).toHaveAttribute("aria-checked", "true");
  });

  it("si no carga, lo dice con Reintentar", async () => {
    vi.mocked(api.configPos).mockRejectedValue(new Error("Sin conexión"));
    await abrir();
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    vi.mocked(api.configPos).mockResolvedValue({ ...DE_SIEMPRE });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(opcion(/^Tarjetas/)).toHaveAttribute("aria-checked", "true");
  });

  it("sin categorías lo dice en vez de una lista vacía", async () => {
    vi.mocked(api.getCategorias).mockResolvedValue([]);
    await abrir();
    expect(screen.getByText(/Todavía no hay categorías/)).toBeInTheDocument();
  });
});

describe("cada cambio se guarda al tocarlo", () => {
  it("la vista en columnas: viaja sola y la sesión se entera", async () => {
    await abrir();
    await act(async () => {
      fireEvent.click(opcion(/^Columnas por categoría/));
    });
    expect(api.guardarConfigPos).toHaveBeenCalledTimes(1);
    expect(api.guardarConfigPos).toHaveBeenCalledWith({ vista: "COLUMNAS" });
    expect(fijarConfigPos).toHaveBeenCalledWith({ ...DE_SIEMPRE, vista: "COLUMNAS" });
    expect(opcion(/^Columnas por categoría/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });

  it("tocar lo que ya está elegido no manda nada", async () => {
    await abrir();
    fireEvent.click(opcion(/^Tarjetas/));
    fireEvent.click(opcion(/^En pantalla aparte/));
    expect(api.guardarConfigPos).not.toHaveBeenCalled();
  });

  it("el cobro en la misma pantalla", async () => {
    await abrir();
    await act(async () => {
      fireEvent.click(opcion(/^En la misma pantalla/));
    });
    expect(api.guardarConfigPos).toHaveBeenCalledWith({ cobro: "EN_VENTA" });
    expect(fijarConfigPos).toHaveBeenLastCalledWith(expect.objectContaining({ cobro: "EN_VENTA" }));
  });

  it("los dos interruptores", async () => {
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Mostrar íconos de los productos" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ iconos: false });
    expect(screen.getByRole("switch", { name: "Mostrar íconos de los productos" })).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Mostrar filtros de categoría" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ filtros: false });
    expect(fijarConfigPos).toHaveBeenLastCalledWith({ ...DE_SIEMPRE, iconos: false, filtros: false });
  });

  it("el orden con las flechas, y «Volver al orden de siempre» manda la lista vacía", async () => {
    await abrir();
    expect(screen.getByRole("button", { name: "Subir la categoría Pollos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar la categoría Extras" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bajar la categoría Pollos" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ ordenCategorias: [2, 1, 3] });
    expect(categoriasEnPantalla()).toEqual(["Bebidas", "Pollos", "Extras"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Subir la categoría Extras" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ ordenCategorias: [2, 3, 1] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver al orden de siempre" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ ordenCategorias: [] });
    expect(categoriasEnPantalla()).toEqual(["Pollos", "Bebidas", "Extras"]);
    expect(screen.queryByRole("button", { name: "Volver al orden de siempre" })).not.toBeInTheDocument();
  });

  it("dos toques seguidos: se ven al instante y viajan de a uno, el segundo cuando vuelve el primero", async () => {
    let soltar: () => void = () => {};
    vi.mocked(api.guardarConfigPos).mockImplementationOnce(
      (cambios) => new Promise((ok) => (soltar = () => ok({ ...DE_SIEMPRE, ...cambios }))),
    );
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Bajar la categoría Pollos" }));
    fireEvent.click(screen.getByRole("button", { name: "Bajar la categoría Pollos" }));
    // El orden ya se ve movido dos lugares, y mientras tanto dice que guarda.
    expect(categoriasEnPantalla()).toEqual(["Bebidas", "Extras", "Pollos"]);
    expect(screen.getByRole("status")).toHaveTextContent("Guardando…");
    expect(api.guardarConfigPos).toHaveBeenCalledTimes(1);
    await act(async () => {
      soltar();
    });
    expect(api.guardarConfigPos).toHaveBeenCalledTimes(2);
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ ordenCategorias: [2, 3, 1] });
    expect(categoriasEnPantalla()).toEqual(["Bebidas", "Extras", "Pollos"]);
    expect(fijarConfigPos).toHaveBeenLastCalledWith({ ...DE_SIEMPRE, ordenCategorias: [2, 3, 1] });
  });
});

describe("si no se guarda", () => {
  it("lo dice al lado de lo que se tocó y vuelve a lo que había", async () => {
    vi.mocked(api.guardarConfigPos).mockRejectedValue(new Error("No tenés permiso para cambiar la configuración"));
    await abrir();
    await act(async () => {
      fireEvent.click(opcion(/^Columnas por categoría/));
    });
    const tarjeta = screen.getByRole("radiogroup", { name: "Vista de productos" }).closest("section")!;
    expect(within(tarjeta).getByText("No tenés permiso para cambiar la configuración")).toBeInTheDocument();
    expect(opcion(/^Tarjetas/)).toHaveAttribute("aria-checked", "true");
    expect(opcion(/^Columnas por categoría/)).toHaveAttribute("aria-checked", "false");
    expect(fijarConfigPos).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toHaveTextContent("Guardado");
  });

  it("un interruptor vuelve a como estaba", async () => {
    vi.mocked(api.guardarConfigPos).mockRejectedValue(new Error("Sin conexión"));
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Mostrar filtros de categoría" }));
    });
    expect(screen.getByRole("switch", { name: "Mostrar filtros de categoría" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
  });

  it("el orden vuelve al último guardado, y el próximo cambio borra el aviso", async () => {
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bajar la categoría Pollos" }));
    });
    vi.mocked(api.guardarConfigPos).mockRejectedValueOnce(new Error("Sin conexión"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bajar la categoría Pollos" }));
    });
    expect(categoriasEnPantalla()).toEqual(["Bebidas", "Pollos", "Extras"]);
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Subir la categoría Pollos" }));
    });
    expect(screen.queryByText("Sin conexión")).not.toBeInTheDocument();
    expect(categoriasEnPantalla()).toEqual(["Pollos", "Bebidas", "Extras"]);
  });
});
