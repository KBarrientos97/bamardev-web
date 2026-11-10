import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CabeceraHoja, Hoja } from "./HojaMesa";

/**
 * La hoja de la mesa se baja con el dedo desde cualquier lado (también desde
 * el contenido, no sólo la cabecera), sin trabarse y sin robarle el toque a
 * los botones (dueño, 10-nov).
 */

function montar() {
  const onCerrar = vi.fn();
  const onBoton = vi.fn();
  render(
    <Hoja etiqueta="Mesa M1" onCerrar={onCerrar}>
      <CabeceraHoja titulo="Mesa M1" />
      <div>
        <button onClick={onBoton}>Agregar pedido</button>
      </div>
    </Hoja>,
  );
  return { onCerrar, onBoton };
}

/** Un dedo que baja `dy` px arrancando sobre `el`. */
function arrastrar(el: Element, dy: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 300 }] });
  for (const paso of [10, dy / 2, dy]) {
    fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 300 + paso }] });
  }
  fireEvent.touchEnd(el, { touches: [] });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("bajar la hoja con el dedo", () => {
  it("desde el contenido, bien abajo, la cierra", () => {
    const { onCerrar } = montar();
    arrastrar(screen.getByRole("button", { name: "Agregar pedido" }), 320);
    act(() => vi.advanceTimersByTime(400));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("un arrastre corto no la cierra: vuelve a su lugar", () => {
    const { onCerrar } = montar();
    arrastrar(screen.getByRole("dialog"), 40);
    act(() => vi.advanceTimersByTime(400));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").style.transform).toBe("");
  });

  it("para arriba no hace nada", () => {
    const { onCerrar } = montar();
    arrastrar(screen.getByRole("dialog"), -300);
    act(() => vi.advanceTimersByTime(400));
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("un toque en un botón sigue siendo un toque", () => {
    const { onCerrar, onBoton } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar pedido" }));
    expect(onBoton).toHaveBeenCalledTimes(1);
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("la cruz la cierra con la misma animación", () => {
    const { onCerrar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCerrar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
