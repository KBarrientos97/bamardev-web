import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 13-nov: el selector de sucursal de Supervisión era un `<select>` nativo y
 * en el celular abría el diálogo del sistema, oscuro y con botones de radio,
 * ajeno a la app (Kevin, con captura). La lista ahora es de la app: pegada al
 * botón en la compu, hoja inferior en el celular.
 */

const pantalla = vi.hoisted(() => ({ celular: false }));
vi.mock("../lib/agenda/useEsCelular", () => ({ useConsultaMedia: () => pantalla.celular }));

import { Desplegable } from "./Desplegable";

const SUCURSALES = [
  { id: 1, etiqueta: "Principal" },
  { id: 2, etiqueta: "Villa 1ro de mayo" },
  { id: 3, etiqueta: "Norte", detalle: "cerró ayer 19:55" },
];

/** Como en Supervisión: la pastilla dentro de un encabezado que recorta. */
function montar(valor: number | null = 1, props: { ancho?: "fijo" | "boton"; titulo?: string } = {}) {
  const onElegir = vi.fn();
  render(
    <section aria-label="Encabezado" style={{ overflow: "hidden" }}>
      <Desplegable etiqueta="Sucursal" valor={valor} opciones={SUCURSALES} onElegir={onElegir} className="pastilla" {...props}>
        <span>{SUCURSALES.find((s) => s.id === valor)?.etiqueta ?? "Elegí la sucursal"}</span>
      </Desplegable>
    </section>,
  );
  return { boton: screen.getByRole("button", { name: /^Sucursal/ }), onElegir };
}

/** Pone el botón en un lugar de la pantalla (jsdom no hace layout). */
function ubicarBoton(boton: HTMLElement, r: { top: number; bottom: number; left: number; width: number }) {
  vi.spyOn(boton, "getBoundingClientRect").mockReturnValue({
    ...r,
    right: r.left + r.width,
    height: r.bottom - r.top,
    x: r.left,
    y: r.top,
    toJSON: () => ({}),
  } as DOMRect);
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

describe("Desplegable en la compu", () => {
  it("se llama por la etiqueta y lo elegido, y abre la lista en el body, pegada al borde izquierdo del botón", () => {
    const { boton } = montar();
    expect(boton).toHaveAccessibleName("Sucursal Principal");
    expect(boton).toHaveAttribute("aria-haspopup", "listbox");
    expect(screen.queryByRole("listbox")).toBeNull();
    ubicarBoton(boton, { top: 100, bottom: 132, left: 150, width: 120 });
    fireEvent.click(boton);
    const lista = screen.getByRole("listbox", { name: "Sucursal" });
    // Fuera del encabezado que recorta, como el menú "⋯" (L8).
    expect(screen.getByRole("region", { name: "Encabezado" })).not.toContainElement(lista);
    expect(lista.parentElement).toBe(document.body);
    expect(lista).toHaveAttribute("data-lado", "abajo");
    expect(lista.style.position).toBe("fixed");
    expect(lista.style.top).toBe("138px");
    expect(lista.style.left).toBe("150px");
    expect(lista.style.width).toBe("272px");
    expect(boton).toHaveAttribute("aria-expanded", "true");
  });

  it("la elegida va marcada y con el foco; elegir otra avisa y cierra; elegir la misma cierra sin avisar", () => {
    const { boton, onElegir } = montar();
    fireEvent.click(boton);
    const principal = screen.getByRole("option", { name: "Principal" });
    expect(principal).toHaveAttribute("aria-selected", "true");
    expect(principal).toHaveFocus();
    expect(screen.getByRole("option", { name: "Villa 1ro de mayo" })).toHaveAttribute("aria-selected", "false");
    fireEvent.click(screen.getByRole("option", { name: "Villa 1ro de mayo" }));
    expect(onElegir).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("listbox")).toBeNull();

    // Como el <select>: elegir lo que ya está no dispara nada (volvería a pedir lo mismo).
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole("option", { name: "Principal" }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sin nada elegido ninguna va marcada y el foco arranca en la primera", () => {
    const { boton } = montar(null);
    expect(boton).toHaveAccessibleName("Sucursal Elegí la sucursal");
    fireEvent.click(boton);
    expect(screen.queryByRole("option", { selected: true })).toBeNull();
    expect(screen.getByRole("option", { name: "Principal" })).toHaveFocus();
  });

  it("el detalle de una opción se lee debajo de su nombre", () => {
    const { boton } = montar();
    fireEvent.click(boton);
    expect(screen.getByRole("option", { name: /Norte/ })).toHaveTextContent("cerró ayer 19:55");
  });

  it("Escape la cierra y devuelve el foco al botón; un clic afuera también la cierra", () => {
    const { boton } = montar();
    fireEvent.click(boton);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(boton).toHaveFocus();

    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("un mousedown sobre una opción no la cierra antes del clic: la lista vive en el body", () => {
    const { boton, onElegir } = montar();
    fireEvent.click(boton);
    const opcion = screen.getByRole("option", { name: "Villa 1ro de mayo" });
    fireEvent.mouseDown(opcion);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.click(opcion);
    expect(onElegir).toHaveBeenCalledWith(2);
  });

  it("abre hacia arriba si abajo no entra, y no se sale de la pantalla por la derecha", () => {
    const { boton } = montar();
    ubicarBoton(boton, { top: 740, bottom: 772, left: 1200, width: 60 });
    // jsdom no mide: la lista "mide" 120 px, más de los 28 que quedan abajo.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
    fireEvent.click(boton);
    const lista = screen.getByRole("listbox");
    expect(lista).toHaveAttribute("data-lado", "arriba");
    expect(lista.style.bottom).toBe(`${800 - 740 + 6}px`);
    expect(lista.style.top).toBe("");
    expect(lista.style.left).toBe(`${1280 - 272 - 8}px`);
  });

  it('con ancho "boton" la lista mide lo que el botón (el selector del turno, a lo ancho)', () => {
    const { boton } = montar(1, { ancho: "boton" });
    ubicarBoton(boton, { top: 100, bottom: 144, left: 16, width: 600 });
    fireEvent.click(boton);
    expect(screen.getByRole("listbox").style.width).toBe("600px");
    expect(screen.getByRole("listbox").style.left).toBe("16px");
  });

  it("un scroll afuera la cierra (quedaría flotando lejos del botón); el de la propia lista, no", () => {
    const { boton } = montar();
    fireEvent.click(boton);
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("Desplegable en el celular", () => {
  beforeEach(() => {
    pantalla.celular = true;
  });

  it("abre la hoja de la app con el título y la elegida marcada; tocar otra avisa y la cierra", () => {
    const { boton, onElegir } = montar();
    expect(boton).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(boton);
    const hoja = screen.getByRole("dialog", { name: "Sucursal" });
    expect(within(hoja).getByRole("heading", { name: "Sucursal" })).toBeInTheDocument();
    expect(within(hoja).getByRole("option", { name: "Principal" })).toHaveAttribute("aria-selected", "true");
    expect(within(hoja).getByRole("option", { name: "Villa 1ro de mayo" })).toHaveAttribute("aria-selected", "false");
    fireEvent.click(within(hoja).getByRole("option", { name: "Villa 1ro de mayo" }));
    expect(onElegir).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("la hoja puede llevar un título distinto de la etiqueta, y la cruz la cierra sin elegir", () => {
    const { boton, onElegir } = montar(1, { titulo: "¿Qué sucursal querés ver?" });
    fireEvent.click(boton);
    const hoja = screen.getByRole("dialog", { name: "¿Qué sucursal querés ver?" });
    fireEvent.click(within(hoja).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onElegir).not.toHaveBeenCalled();
  });
});
