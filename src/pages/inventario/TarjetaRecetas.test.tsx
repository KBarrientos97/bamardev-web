import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigRecetas } from "../../types";

/**
 * Configuración › Inventario y stock › «Recetas y costo por plato» (27-nov).
 *
 * El interruptor de todo lo de las recetas, apagado de fábrica. Prendido, suma
 * cuatro ajustes. Cada cambio se guarda al tocarlo (el % al salir del campo) y
 * la sesión se entera en el acto.
 */

const sesion = vi.hoisted(() => ({ fijarRecetas: vi.fn() }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ fijarRecetas: sesion.fijarRecetas }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    configRecetas: vi.fn(),
    cambiarConfigRecetas: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import TarjetaRecetas from "./TarjetaRecetas";

const DE_FABRICA: ConfigRecetas = {
  activas: false,
  avisoPct: 2,
  costoInsumo: "ULTIMA",
  elegirPresa: false,
  puroDoble: true,
  sePuede: true,
};
const PRENDIDAS: ConfigRecetas = { ...DE_FABRICA, activas: true };

/** Lo que tiene guardado el backend: el GET lo lee y el PATCH lo cambia y lo devuelve entero. */
let guardada: ConfigRecetas = DE_FABRICA;

beforeEach(() => {
  vi.clearAllMocks();
  guardada = DE_FABRICA;
  vi.mocked(api.configRecetas).mockImplementation(async () => guardada);
  vi.mocked(api.cambiarConfigRecetas).mockImplementation(async (cambio) => (guardada = { ...guardada, ...cambio }));
});

/** Monta la tarjeta y la abre (cerrada sólo muestra el título y el estado). */
async function abrir() {
  render(
    <MemoryRouter>
      <TarjetaRecetas />
    </MemoryRouter>,
  );
  const cabecera = await screen.findByRole("button", { name: /Recetas y costo por plato/ });
  await waitFor(() => expect(cabecera).toHaveTextContent(/Prendido|Apagado/));
  fireEvent.click(cabecera);
  return cabecera;
}

describe("apagadas (de fábrica)", () => {
  it("la cabecera dice «Apagado», y adentro sólo el interruptor con lo que hace", async () => {
    const cabecera = await abrir();
    expect(cabecera).toHaveTextContent("Apagado");
    const interruptor = screen.getByRole("switch", { name: "Recetas y costo por plato" });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "Cada plato lleva su receta de insumos: el sistema le calcula el costo y la venta descuenta los insumos. Los artículos que ya tenés siguen igual hasta que les armes la receta.",
      ),
    ).toBeInTheDocument();
    // Los ajustes de las recetas no se ven hasta prenderlas.
    expect(screen.queryByRole("group", { name: "Cómo funcionan las recetas" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Avisarme cuando el costo/)).not.toBeInTheDocument();
  });

  it("prenderlas las guarda, avisa a la sesión y muestra los cuatro ajustes", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("switch", { name: "Recetas y costo por plato" }));
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ activas: true }));
    expect(sesion.fijarRecetas).toHaveBeenCalledWith({ activas: true, elegirPresa: false, puroDoble: true });

    const ajustes = await screen.findByRole("group", { name: "Cómo funcionan las recetas" });
    expect(within(ajustes).getByRole("textbox", { name: "Avisarme cuando el costo de un plato cambie" })).toHaveValue("2");
    expect(within(ajustes).getByText("% o más")).toBeInTheDocument();
    expect(within(ajustes).getByRole("radio", { name: "La última compra" })).toHaveAttribute("aria-checked", "true");
    expect(within(ajustes).getByRole("radio", { name: "El promedio de las últimas 3" })).toHaveAttribute("aria-checked", "false");
    expect(within(ajustes).getByRole("switch", { name: "Elegir la presa al vender" })).toHaveAttribute("aria-checked", "false");
    expect(
      within(ajustes).getByText(
        "Al tocar un plato de 1 o 2 presas, el punto de venta pregunta cuál salió (un toque más). Apagado, el plato se agrega directo.",
      ),
    ).toBeInTheDocument();
    expect(within(ajustes).getByRole("radio", { name: "Descuenta doble porción" })).toHaveAttribute("aria-checked", "true");
    expect(within(ajustes).getByRole("radio", { name: "Descuenta la misma porción" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /Recetas y costo por plato/ })).toHaveTextContent("Prendido");
  });
});

describe("prendidas: cada ajuste se guarda al tocarlo", () => {
  beforeEach(() => {
    guardada = PRENDIDAS;
  });

  it("el % se guarda al salir del campo, con coma también", async () => {
    await abrir();
    const campo = screen.getByRole("textbox", { name: "Avisarme cuando el costo de un plato cambie" });
    fireEvent.change(campo, { target: { value: "3,5" } });
    expect(api.cambiarConfigRecetas).not.toHaveBeenCalled();
    fireEvent.blur(campo);
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ avisoPct: 3.5 }));
  });

  it("el mismo % no se vuelve a mandar; uno fuera de 0 a 100 avisa y vuelve a lo guardado", async () => {
    await abrir();
    const campo = screen.getByRole("textbox", { name: "Avisarme cuando el costo de un plato cambie" });
    fireEvent.change(campo, { target: { value: "2" } });
    fireEvent.blur(campo);
    // Vacío vuelve a lo guardado, sin error.
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.blur(campo);
    expect(campo).toHaveValue("2");
    expect(screen.queryByText("El aviso va de 0 a 100 %.")).not.toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "150" } });
    fireEvent.blur(campo);
    expect(await screen.findByText("El aviso va de 0 a 100 %.")).toBeInTheDocument();
    expect(campo).toHaveValue("2");
    expect(api.cambiarConfigRecetas).not.toHaveBeenCalled();
  });

  it("el costo de cada insumo: el promedio de las últimas 3", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "El promedio de las últimas 3" }));
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ costoInsumo: "PROMEDIO3" }));
    expect(await screen.findByRole("radio", { name: "El promedio de las últimas 3" })).toHaveAttribute("aria-checked", "true");
    // Tocar el que ya está elegido no manda nada.
    vi.mocked(api.cambiarConfigRecetas).mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "El promedio de las últimas 3" }));
    expect(api.cambiarConfigRecetas).not.toHaveBeenCalled();
  });

  it("elegir la presa al vender llega a la sesión (lo lee el punto de venta)", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("switch", { name: "Elegir la presa al vender" }));
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ elegirPresa: true }));
    expect(sesion.fijarRecetas).toHaveBeenLastCalledWith({ activas: true, elegirPresa: true, puroDoble: true });
  });

  it("«puro» que descuenta la misma porción", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Descuenta la misma porción" }));
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ puroDoble: false }));
    expect(sesion.fijarRecetas).toHaveBeenLastCalledWith({ activas: true, elegirPresa: false, puroDoble: false });
  });

  it("apagarlas avisa que no se borra nada y la sesión se entera", async () => {
    await abrir();
    expect(screen.getByText(/Apagarlas no borra nada: quedan guardadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Recetas y costo por plato" }));
    await waitFor(() => expect(api.cambiarConfigRecetas).toHaveBeenCalledWith({ activas: false }));
    expect(sesion.fijarRecetas).toHaveBeenLastCalledWith({ activas: false, elegirPresa: false, puroDoble: true });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Cómo funcionan las recetas" })).not.toBeInTheDocument());
  });

  it("si el backend lo rechaza, dice por qué y no cambia nada", async () => {
    vi.mocked(api.cambiarConfigRecetas).mockRejectedValue(new Error("No se pudo guardar el ajuste"));
    await abrir();
    const campo = screen.getByRole("textbox", { name: "Avisarme cuando el costo de un plato cambie" });
    fireEvent.change(campo, { target: { value: "5" } });
    await act(async () => fireEvent.blur(campo));
    expect(await screen.findByText("No se pudo guardar el ajuste")).toBeInTheDocument();
    expect(campo).toHaveValue("2");
    expect(sesion.fijarRecetas).not.toHaveBeenCalled();
  });
});

it("un backend anterior, sin el ajuste (404), no dibuja la tarjeta: la pantalla queda como antes", async () => {
  vi.mocked(api.configRecetas).mockRejectedValue(Object.assign(new Error("Cannot GET /recetas-plato/config"), { status: 404 }));
  render(
    <MemoryRouter>
      <TarjetaRecetas />
    </MemoryRouter>,
  );
  await waitFor(() => expect(api.configRecetas).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByRole("button", { name: /Recetas y costo por plato/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Cannot GET/)).not.toBeInTheDocument();
});

it("otro error al cargar sí se dice, con «Reintentar»", async () => {
  vi.mocked(api.configRecetas).mockRejectedValueOnce(new Error("Sin conexión"));
  await abrirSinEstado();
  expect(screen.getByText("Sin conexión")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("switch", { name: "Recetas y costo por plato" })).toBeInTheDocument();
});

/** Como `abrir`, para cuando la cabecera no llega a tener estado (falló la carga). */
async function abrirSinEstado() {
  render(
    <MemoryRouter>
      <TarjetaRecetas />
    </MemoryRouter>,
  );
  await waitFor(() => expect(api.configRecetas).toHaveBeenCalled());
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Recetas y costo por plato/ }));
}

it("fuera del restaurante (si la pantalla se abriera) dice que es sólo para restaurantes", async () => {
  guardada = { ...DE_FABRICA, sePuede: false };
  await abrir();
  expect(screen.getByText("Las recetas por plato son sólo para restaurantes.")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});
