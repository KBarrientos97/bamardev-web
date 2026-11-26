import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HojaGrande from "./HojaGrande";

/**
 * El marco de «Semana N» con el teclado de la pantalla abierto (Kevin, 26-nov:
 * en Android la cabecera quedaba cortada arriba y no se podía volver a subir).
 * Con el teclado, la hoja ocupa justo lo que se ve; con poco alto, se compacta
 * (sin la franja); sin teclado, como siempre. No hay teclado en las pruebas:
 * un `visualViewport` de mentira.
 */

class VistaDeMentira extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;
  scale = 1;
  mover(cambios: Partial<Pick<VistaDeMentira, "height" | "offsetTop" | "scale">>, evento: "resize" | "scroll" = "resize") {
    Object.assign(this, cambios);
    act(() => {
      this.dispatchEvent(new Event(evento));
    });
  }
}

function conVista(cambios: Partial<Pick<VistaDeMentira, "height" | "offsetTop" | "scale">> = {}) {
  const vv = Object.assign(new VistaDeMentira(), cambios);
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  return vv;
}

afterEach(() => {
  delete (window as { visualViewport?: unknown }).visualViewport;
});

function abrir() {
  const onClose = vi.fn();
  render(
    <HojaGrande
      titulo="Semana 5"
      cabecera={<h2>Semana 5</h2>}
      franja={<div>La semana pasada: 124,7 kg</div>}
      pie={<button type="button">Guardar la semana 5</button>}
      onClose={onClose}
    >
      <label>
        Peso de hoy
        <input />
      </label>
    </HojaGrande>,
  );
  const hoja = screen.getByRole("dialog", { name: "Semana 5" });
  // El contenedor fijo: el que se pone encima de lo que se ve.
  return { hoja, marco: hoja.parentElement!, onClose };
}

describe("HojaGrande y el teclado de la pantalla", () => {
  it("sin teclado (la PC): sin estilos de alto ni de arriba, con la franja; `Esc` cierra", () => {
    conVista();
    const { hoja, marco, onClose } = abrir();
    expect(marco).not.toHaveAttribute("style");
    expect(hoja).not.toHaveAttribute("data-teclado");
    expect(screen.getByText(/^La semana pasada/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sin `visualViewport` tampoco pone estilos", () => {
    const { hoja, marco } = abrir();
    expect(marco).not.toHaveAttribute("style");
    expect(hoja).not.toHaveAttribute("data-teclado");
  });

  it("con el teclado y alto de sobra (560 px o más): ocupa justo lo que se ve, con la franja", () => {
    // La ventana de jsdom es de 768 px: el teclado tapa 148.
    conVista({ height: 620 });
    const { hoja, marco } = abrir();
    expect(marco.style.top).toBe("0px");
    expect(marco.style.height).toBe("620px");
    expect(marco.style.bottom).toBe("auto");
    expect(hoja).toHaveAttribute("data-teclado", "abierto");
    expect(screen.getByText(/^La semana pasada/)).toBeInTheDocument();
  });

  it("con el teclado y poco alto (el teléfono): compacta y sin la franja; la parte visible se corre: la hoja la sigue; al cerrar el teclado, como siempre", async () => {
    const vv = conVista();
    const { hoja, marco } = abrir();
    vv.mover({ height: window.innerHeight - 380 });
    await waitFor(() => expect(hoja).toHaveAttribute("data-teclado", "compacto"));
    expect(marco.style.top).toBe("0px");
    expect(marco.style.height).toBe(`${window.innerHeight - 380}px`);
    expect(screen.queryByText(/^La semana pasada/)).not.toBeInTheDocument();
    // Lo de adentro y el pie, siempre.
    expect(screen.getByLabelText("Peso de hoy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar la semana 5" })).toBeInTheDocument();
    // Android corre la parte visible hacia abajo al enfocar: la cabecera no queda afuera.
    vv.mover({ offsetTop: 150 }, "scroll");
    await waitFor(() => expect(marco.style.top).toBe("150px"));
    vv.mover({ height: window.innerHeight, offsetTop: 0 });
    await waitFor(() => expect(hoja).not.toHaveAttribute("data-teclado"));
    expect([marco.style.top, marco.style.height, marco.style.bottom]).toEqual(["", "", ""]);
    expect(screen.getByText(/^La semana pasada/)).toBeInTheDocument();
  });

  it("cuando la hoja se achica, el campo que se escribe vuelve al centro, sin animación", async () => {
    const vv = conVista();
    abrir();
    const peso = screen.getByLabelText("Peso de hoy");
    const centrar = vi.fn();
    peso.scrollIntoView = centrar;
    peso.focus();
    vv.mover({ height: window.innerHeight - 380 });
    await waitFor(() => expect(centrar).toHaveBeenCalledWith({ block: "center" }));
    // Sólo se corre la parte visible: la hoja va con ella y el campo no se toca
    // (centrarlo de nuevo podría volver a correrla: un vaivén).
    centrar.mockClear();
    vv.mover({ offsetTop: 90 }, "scroll");
    await waitFor(() => expect(screen.getByRole("dialog").parentElement).toHaveStyle({ top: "90px" }));
    expect(centrar).not.toHaveBeenCalled();
  });

  it("el foco afuera de la hoja (o en un botón) no se mueve", async () => {
    const vv = conVista();
    abrir();
    const guardar = screen.getByRole("button", { name: "Guardar la semana 5" });
    const peso = screen.getByLabelText("Peso de hoy");
    const centrar = vi.fn();
    guardar.scrollIntoView = centrar;
    peso.scrollIntoView = centrar;
    guardar.focus();
    vv.mover({ height: window.innerHeight - 380 });
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-teclado", "compacto"));
    expect(centrar).not.toHaveBeenCalled();
  });
});
