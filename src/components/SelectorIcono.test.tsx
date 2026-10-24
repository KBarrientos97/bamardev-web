import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIAS_ICONO } from "../lib/iconosArticulo";
import SelectorIcono from "./SelectorIcono";

/**
 * jsdom no calcula layout: cada sección queda en `offsetTop` 0 y la lista no
 * tiene alto. Para probar el scroll le damos a cada sección una altura fija de
 * 1000 px según su orden, que es todo lo que el selector mira.
 */
const ALTO_SECCION = 1000;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
const scrollToOriginal = HTMLElement.prototype.scrollTo;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      const i = CATEGORIAS_ICONO.findIndex((c) => c.clave === this.dataset.categoria);
      return i < 0 ? 0 : i * ALTO_SECCION;
    },
  });
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo;
});

afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
  HTMLElement.prototype.scrollTo = scrollToOriginal;
  vi.restoreAllMocks();
});

function abrir(props: Partial<Parameters<typeof SelectorIcono>[0]> = {}) {
  const onElegir = vi.fn();
  render(
    <SelectorIcono actual={null} rubro="RESTAURANTE" onElegir={onElegir} onCerrar={() => {}} {...props} />,
  );
  return { onElegir, lista: screen.getByTestId("lista-iconos") };
}

const pestana = (nombre: string) =>
  screen.getByRole("navigation", { name: "Secciones de íconos" }).querySelector(`[aria-label="${nombre}"]`);

describe("SelectorIcono", () => {
  it("muestra todas las secciones, no sólo la del rubro", () => {
    abrir({ rubro: "FARMACIA" });
    for (const c of CATEGORIAS_ICONO) {
      expect(screen.getByRole("heading", { name: c.nombre })).toBeInTheDocument();
    }
    // Una farmacia que vende agua tiene que poder elegirla.
    expect(screen.getByRole("button", { name: "Agua" })).toBeInTheDocument();
  });

  it.each([
    ["FARMACIA", "Farmacia", 5],
    ["FERRETERIA", "Ferretería", 6],
    ["BARBERIA", "Belleza y spa", 8],
    ["BILLAR", "Licorería y kiosco", 10],
  ])("con rubro %s abre en la sección %s", (rubro, nombre, indice) => {
    const { lista } = abrir({ rubro });
    expect(pestana(nombre)).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(indice * ALTO_SECCION);
  });

  it("con un ícono ya puesto abre en la sección de ese ícono, no en la del rubro", () => {
    // Una pollería que le puso el martillo a algo: al editar tiene que verlo.
    const { lista } = abrir({ rubro: "RESTAURANTE", actual: "martillo" });
    expect(pestana("Ferretería")).toHaveAttribute("aria-current", "true");
    expect(pestana("Pollería")).not.toHaveAttribute("aria-current");
    expect(lista.scrollTop).toBe(6 * ALTO_SECCION);
  });

  it("con un ícono puesto que ya no existe abre en la del rubro", () => {
    const { lista } = abrir({ rubro: "FARMACIA", actual: "icono_de_una_version_nueva" });
    expect(pestana("Farmacia")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(5 * ALTO_SECCION);
  });

  it("sin rubro conocido abre en la primera sección", () => {
    const { lista } = abrir({ rubro: undefined });
    expect(pestana("Pollería")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(0);
  });

  it("tocar una pestaña la marca y desliza la lista hasta su sección", () => {
    const { lista } = abrir();
    fireEvent.click(pestana("Ferretería")!);
    expect(pestana("Ferretería")).toHaveAttribute("aria-current", "true");
    expect(pestana("Pollería")).not.toHaveAttribute("aria-current");
    expect(lista.scrollTo).toHaveBeenCalledWith({ top: 6 * ALTO_SECCION, behavior: "smooth" });
  });

  it("al desplazar a mano se marca sola la pestaña de la sección visible", () => {
    const { lista } = abrir();
    Object.defineProperty(lista, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(lista, "scrollHeight", { configurable: true, value: 12 * ALTO_SECCION });
    // Pasada la pausa que sigue al salto inicial.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);

    lista.scrollTop = 3 * ALTO_SECCION + 120;
    fireEvent.scroll(lista);
    expect(pestana("Almacén")).toHaveAttribute("aria-current", "true");

    // Al fondo se marca la última aunque no llegue arriba de todo.
    lista.scrollTop = 12 * ALTO_SECCION - 400;
    fireEvent.scroll(lista);
    expect(pestana("Educación")).toHaveAttribute("aria-current", "true");
  });

  it("buscar filtra por etiqueta sin tildes ni mayúsculas y esconde las pestañas", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "CAFE" } });
    expect(screen.getByRole("button", { name: "Café" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Martillo" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Secciones de íconos" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bebidas" })).toBeNull();
  });

  it("una búsqueda sin coincidencias lo dice", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "xyzw" } });
    expect(screen.getByText(/No hay íconos con «xyzw»/)).toBeInTheDocument();
  });

  it("al borrar la búsqueda vuelven las secciones en la que estaba marcada", () => {
    const { lista } = abrir({ rubro: "MINIMARKET" });
    const buscador = screen.getByPlaceholderText("Buscar ícono…");
    fireEvent.change(buscador, { target: { value: "pan" } });
    fireEvent.change(buscador, { target: { value: "" } });
    expect(pestana("Almacén")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(3 * ALTO_SECCION);
  });

  it("elegir un ícono devuelve su llave, también desde la búsqueda", () => {
    const { onElegir } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Martillo" }));
    expect(onElegir).toHaveBeenLastCalledWith("martillo");

    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "termó" } });
    fireEvent.click(screen.getByRole("button", { name: "Termómetro" }));
    expect(onElegir).toHaveBeenLastCalledWith("termometro");
  });

  it("los íconos viejos de pollería se siguen pudiendo elegir con su llave", () => {
    const { onElegir } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Broaster medio" }));
    expect(onElegir).toHaveBeenLastCalledWith("medio_pollo_broaster");
  });

  it("'Sin ícono' vuelve al monograma", () => {
    const { onElegir } = abrir({ actual: "pan" });
    fireEvent.click(screen.getByRole("button", { name: /Sin ícono/ }));
    expect(onElegir).toHaveBeenLastCalledWith(null);
  });

  it("el ícono elegido se ve marcado", () => {
    abrir({ actual: "pan" });
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Leche" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Sin ícono/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("sin ícono puesto, 'Sin ícono' es el marcado", () => {
    abrir({ actual: null });
    expect(screen.getByRole("button", { name: /Sin ícono/ })).toHaveAttribute("aria-pressed", "true");
  });
});
