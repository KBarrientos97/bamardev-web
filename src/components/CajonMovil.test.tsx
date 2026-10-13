import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CajonMovil from "./CajonMovil";
import { Modal } from "./ui";

/**
 * Los gestos de iOS (PLAN-IOS): el menú sigue al dedo y la hoja se baja
 * arrastrándola. Se simulan los toques con sus tiempos: lo que decide es la
 * distancia y la velocidad, como en iOS.
 */

let ahora = 0;
beforeEach(() => {
  vi.useFakeTimers();
  ahora = 0;
  vi.spyOn(performance, "now").mockImplementation(() => ahora);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const toque = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

/** Un arrastre de (x0,y0) a (x1,y1) que dura `ms`, en pasos. */
function arrastrar(el: Element | Document, x0: number, y0: number, x1: number, y1: number, ms: number) {
  fireEvent.touchStart(el, toque(x0, y0));
  for (let i = 1; i <= 5; i++) {
    ahora += ms / 5;
    fireEvent.touchMove(el, toque(x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5));
  }
  fireEvent.touchEnd(el, { touches: [] });
}

function Cajon(props: { abierto: boolean; onAbrir?: () => void; onCerrar?: () => void; desdeElBorde?: boolean }) {
  return (
    <CajonMovil
      abierto={props.abierto}
      onAbrir={props.onAbrir ?? (() => {})}
      onCerrar={props.onCerrar ?? (() => {})}
      desdeElBorde={props.desdeElBorde ?? true}
    >
      <p>Menú</p>
    </CajonMovil>
  );
}

describe("CajonMovil", () => {
  it("cerrado no dibuja nada", () => {
    render(<Cajon abierto={false} />);
    expect(screen.queryByText("Menú")).toBeNull();
  });

  it("deslizar desde el borde izquierdo lo abre", () => {
    const onAbrir = vi.fn();
    render(<Cajon abierto={false} onAbrir={onAbrir} />);
    act(() => arrastrar(document, 5, 300, 200, 305, 300));
    expect(onAbrir).toHaveBeenCalledOnce();
  });

  it("mientras el dedo arrastra desde el borde, el menú ya se ve y lo sigue", () => {
    render(<Cajon abierto={false} />);
    act(() => {
      fireEvent.touchStart(document, toque(5, 300));
      ahora += 50;
      fireEvent.touchMove(document, toque(105, 302));
    });
    const cajon = screen.getByTestId("cajon-movil");
    // 100 px de dedo: el cajón (288) asoma 100.
    expect(cajon.style.transform).toBe("translateX(-188px)");
  });

  it("lejos del borde, o en Safari sin instalar (es 'volver'), no abre", () => {
    const onAbrir = vi.fn();
    const { rerender } = render(<Cajon abierto={false} onAbrir={onAbrir} />);
    act(() => arrastrar(document, 120, 300, 320, 300, 300));
    rerender(<Cajon abierto={false} onAbrir={onAbrir} desdeElBorde={false} />);
    act(() => arrastrar(document, 5, 300, 220, 300, 300));
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it("un deslizamiento vertical desde el borde es scroll, no abre", () => {
    const onAbrir = vi.fn();
    render(<Cajon abierto={false} onAbrir={onAbrir} />);
    act(() => arrastrar(document, 5, 100, 40, 400, 300));
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it("abierto, empujarlo a la izquierda lo cierra con la animación", () => {
    const onCerrar = vi.fn();
    render(<Cajon abierto onCerrar={onCerrar} />);
    act(() => arrastrar(screen.getByTestId("cajon-movil"), 250, 300, 80, 305, 300));
    expect(onCerrar).not.toHaveBeenCalled(); // primero se va con la curva
    act(() => vi.advanceTimersByTime(300));
    expect(onCerrar).toHaveBeenCalledOnce();
  });

  it("un empujón corto y lento vuelve a su lugar", () => {
    const onCerrar = vi.fn();
    render(<Cajon abierto onCerrar={onCerrar} />);
    act(() => arrastrar(screen.getByTestId("cajon-movil"), 250, 300, 210, 300, 900));
    act(() => vi.advanceTimersByTime(300));
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe("Modal en el celular: la hoja se baja con el dedo", () => {
  const cabecera = () => screen.getByText("Detalle").closest("div[class*='border-b']")!;

  it("bajarla desde la cabecera la cierra", () => {
    const onClose = vi.fn();
    render(
      <Modal abierto titulo="Detalle" onClose={onClose}>
        <p>contenido</p>
      </Modal>,
    );
    act(() => arrastrar(cabecera(), 200, 100, 205, 400, 300));
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("un formulario (no se cierra con clic afuera) tampoco se cierra arrastrando", () => {
    const onClose = vi.fn();
    render(
      <Modal abierto titulo="Detalle" onClose={onClose} cerrarAlClicAfuera={false}>
        <p>contenido</p>
      </Modal>,
    );
    act(() => arrastrar(cabecera(), 200, 100, 205, 400, 300));
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
  });
});
