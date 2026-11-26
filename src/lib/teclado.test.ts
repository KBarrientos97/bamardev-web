import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAreaVisible } from "./teclado";

/**
 * `useAreaVisible` (26-nov): lo que se ve de verdad con el teclado de la
 * pantalla abierto. No hay teclado que abrir en las pruebas: un
 * `visualViewport` de mentira con el alto, el corrimiento y el zoom.
 */

/** El `visualViewport` de mentira: arranca sin teclado (se ve la ventana entera). */
class VistaDeMentira extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;
  scale = 1;
  /** Cambia lo que se ve y avisa como el navegador. */
  mover(cambios: Partial<Pick<VistaDeMentira, "height" | "offsetTop" | "scale">>, evento: "resize" | "scroll" = "resize") {
    Object.assign(this, cambios);
    act(() => {
      this.dispatchEvent(new Event(evento));
    });
  }
}

function conVista() {
  const vv = new VistaDeMentira();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  return vv;
}

/** Lo que tapa el teclado de un teléfono (≈350 px). */
const TECLADO = 350;
const conTeclado = () => window.innerHeight - TECLADO;
/** Espera un cuadro (la medida va en un `requestAnimationFrame`). */
const unCuadro = () => act(() => new Promise<void>((listo) => requestAnimationFrame(() => listo())));

afterEach(() => {
  delete (window as { visualViewport?: unknown }).visualViewport;
});

describe("useAreaVisible", () => {
  it("sin `visualViewport` (la PC de las pruebas): null", () => {
    const { result } = renderHook(() => useAreaVisible(true));
    expect(result.current).toBeNull();
  });

  it("sin teclado: null; la barra del navegador que aparece (menos de 80 px) tampoco es un teclado", async () => {
    const vv = conVista();
    const { result } = renderHook(() => useAreaVisible(true));
    expect(result.current).toBeNull();
    vv.mover({ height: window.innerHeight - 56 });
    await unCuadro();
    expect(result.current).toBeNull();
  });

  it("ya con el teclado abierto al entrar: el área, medida enseguida", () => {
    const vv = conVista();
    vv.height = conTeclado();
    const { result } = renderHook(() => useAreaVisible(true));
    expect(result.current).toEqual({ arriba: 0, alto: conTeclado() });
  });

  it("el teclado sube (resize): el área; la parte visible se corre hacia abajo (scroll): cambia `arriba`; se cierra: null", async () => {
    const vv = conVista();
    const { result } = renderHook(() => useAreaVisible(true));
    vv.mover({ height: conTeclado() + 0.4 });
    await waitFor(() => expect(result.current).toEqual({ arriba: 0, alto: conTeclado() }));
    vv.mover({ offsetTop: 119.6 }, "scroll");
    await waitFor(() => expect(result.current).toEqual({ arriba: 120, alto: conTeclado() }));
    vv.mover({ height: window.innerHeight, offsetTop: 0 });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("con zoom (la parte visible es la lupa, no el teclado): null", async () => {
    const vv = conVista();
    vv.height = conTeclado();
    const { result } = renderHook(() => useAreaVisible(true));
    expect(result.current).not.toBeNull();
    vv.mover({ scale: 2, height: window.innerHeight / 2 });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("los avisos repetidos con lo mismo no cambian el área (el teclado avisa muchas veces mientras sube)", async () => {
    const vv = conVista();
    vv.height = conTeclado();
    const { result } = renderHook(() => useAreaVisible(true));
    const antes = result.current;
    vv.mover({});
    vv.mover({}, "scroll");
    vv.mover({ height: conTeclado() + 0.2 });
    await unCuadro();
    // El mismo objeto: quien lo usa en un efecto no se entera.
    expect(result.current).toBe(antes);
  });

  it("muchos avisos en un mismo cuadro: una sola medida", async () => {
    const vv = conVista();
    const { result } = renderHook(() => useAreaVisible(true));
    const cuadro = vi.spyOn(window, "requestAnimationFrame");
    vv.mover({ height: conTeclado() + 40 });
    vv.mover({ height: conTeclado() + 20 });
    vv.mover({ height: conTeclado() });
    expect(cuadro).toHaveBeenCalledTimes(1);
    cuadro.mockRestore();
    await waitFor(() => expect(result.current).toEqual({ arriba: 0, alto: conTeclado() }));
  });

  it("apagado: null, y sin escuchar; al desmontarse deja de escuchar", () => {
    const vv = conVista();
    vv.height = conTeclado();
    const escucha = vi.spyOn(vv, "addEventListener");
    const { result, rerender, unmount } = renderHook(({ activo }) => useAreaVisible(activo), { initialProps: { activo: false } });
    expect(result.current).toBeNull();
    expect(escucha).not.toHaveBeenCalled();
    rerender({ activo: true });
    expect(result.current).toEqual({ arriba: 0, alto: conTeclado() });
    const deja = vi.spyOn(vv, "removeEventListener");
    unmount();
    expect(deja.mock.calls.map(([tipo]) => tipo).sort()).toEqual(["resize", "scroll"]);
  });
});
