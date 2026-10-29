import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L8 (28-oct): el desplegable "⋯" flota sobre todo. Antes iba adentro de la
 * tarjeta (`overflow-hidden`) y se cortaba: en Inscripciones online
 * "WhatsApp" se veía a medias y "Descartar" no se veía.
 */

const pantalla = vi.hoisted(() => ({ celular: false }));
vi.mock("../lib/agenda/useEsCelular", () => ({ useConsultaMedia: () => pantalla.celular }));

import MenuMas, { type AccionMenu } from "./MenuMas";

const whatsapp = vi.fn();
const descartar = vi.fn();
const ACCIONES: AccionMenu[] = [
  { clave: "wa", etiqueta: "WhatsApp", icono: "phone", onClick: whatsapp },
  { clave: "descartar", etiqueta: "Descartar", peligrosa: true, separar: true, onClick: descartar },
];

/** Como en Preinscripciones: el menú dentro de una tarjeta que recorta. */
function montar() {
  render(
    <section aria-label="Inscripciones online" style={{ overflow: "hidden" }}>
      <MenuMas etiqueta="Más acciones de la inscripción" acciones={ACCIONES} />
    </section>,
  );
  return screen.getByRole("button", { name: "Más acciones de la inscripción" });
}

/** Pone el botón en un lugar de la pantalla (jsdom no hace layout). */
function ubicarBoton(boton: HTMLElement, r: { top: number; bottom: number; right: number }) {
  vi.spyOn(boton, "getBoundingClientRect").mockReturnValue({ ...r, left: r.right - 42, width: 42, height: r.bottom - r.top, x: r.right - 42, y: r.top, toJSON: () => ({}) } as DOMRect);
}

beforeEach(() => {
  vi.clearAllMocks();
  pantalla.celular = false;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("L8 · MenuMas en escritorio", () => {
  it("el menú se dibuja en el body (fuera de la tarjeta que recorta), fijo y debajo del botón", () => {
    const boton = montar();
    ubicarBoton(boton, { top: 100, bottom: 142, right: 1000 });
    fireEvent.click(boton);
    const menu = screen.getByRole("menu", { name: "Más acciones de la inscripción" });
    expect(screen.getByRole("region", { name: "Inscripciones online" })).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute("data-lado", "abajo");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.top).toBe("148px");
    expect(menu.style.right).toBe("280px");
    expect(boton).toHaveAttribute("aria-expanded", "true");
  });

  it("si abajo no entra, se abre hacia arriba", () => {
    const boton = montar();
    ubicarBoton(boton, { top: 740, bottom: 782, right: 1000 });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
    fireEvent.click(boton);
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("data-lado", "arriba");
    expect(menu.style.bottom).toBe(`${800 - 740 + 6}px`);
    expect(menu.style.top).toBe("");
  });

  it("tocar una opción la ejecuta (el clic afuera reconoce el menú flotante) y lo cierra", () => {
    const boton = montar();
    fireEvent.click(boton);
    const opcion = screen.getByRole("menuitem", { name: "Descartar" });
    // El orden real de un clic: mousedown (el "clic afuera") y después click.
    fireEvent.mouseDown(opcion);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(opcion);
    expect(descartar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("se cierra con un clic afuera, con Escape (y el foco vuelve al botón), con scroll y al cambiar el tamaño", () => {
    const boton = montar();
    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(boton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(boton).toHaveFocus();

    fireEvent.click(boton);
    act(() => {
      // El scroll de la app es el del <main>: no burbujea, se escucha en captura.
      const main = document.createElement("main");
      document.body.appendChild(main);
      main.dispatchEvent(new Event("scroll"));
      main.remove();
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(boton);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(whatsapp).not.toHaveBeenCalled();
  });

  it("una opción deshabilitada no hace nada", () => {
    render(<MenuMas etiqueta="Más" acciones={[{ clave: "x", etiqueta: "Nada", deshabilitada: true, onClick: whatsapp }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Más" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Nada" }));
    expect(whatsapp).not.toHaveBeenCalled();
  });

  it("sin acciones no dibuja el botón", () => {
    render(<MenuMas etiqueta="Más" acciones={[]} />);
    expect(screen.queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
  });
});

describe("L8 · MenuMas en el celular", () => {
  it("sigue siendo una hoja con las opciones, que se ejecutan al tocarlas", () => {
    pantalla.celular = true;
    const boton = montar();
    expect(boton).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(boton);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(whatsapp).toHaveBeenCalledTimes(1);
  });
});
