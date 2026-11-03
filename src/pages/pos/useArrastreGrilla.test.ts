import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desplazamientoAutomatico, moverEnLista, useArrastreGrilla } from "./useArrastreGrilla";

/**
 * El arrastre de la grilla del POS. Los casos salen de lo que pasaba en la PC
 * y en la tablet hasta el 28-oct: con el mouse había que mantener apretado
 * medio segundo (apretar y mover no hacía nada), con el dedo la card no se
 * movía nunca, y soltar una card la agregaba al carrito.
 */

const IDS = [1, 2, 3, 4];

/** Lo que el puntero tiene debajo: una card con su id, o nada. */
function debajo(id: number | null) {
  const el = id === null ? null : Object.assign(document.createElement("li"), {});
  el?.setAttribute("data-arrastre-id", String(id));
  document.elementFromPoint = vi.fn(() => el);
}

function puntero(tipo: string, x = 0, y = 0) {
  return { pointerType: tipo, button: 0, clientX: x, clientY: y } as unknown as React.PointerEvent;
}

function mover(x: number, y = 0) {
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
}

function soltar() {
  window.dispatchEvent(new MouseEvent("pointerup"));
}

function montar(onReordenar = vi.fn()) {
  const hook = renderHook(() => useArrastreGrilla({ ids: IDS, onReordenar }));
  return { hook, onReordenar };
}

beforeEach(() => {
  vi.useFakeTimers();
  debajo(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("moverEnLista", () => {
  it("lleva la card al lugar de la otra y corre las del medio", () => {
    expect(moverEnLista([1, 2, 3, 4], 4, 1)).toEqual([4, 1, 2, 3]);
    expect(moverEnLista([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it("sobre sí misma o con un id que no está, no cambia nada", () => {
    expect(moverEnLista([1, 2, 3], 2, 2)).toBeNull();
    expect(moverEnLista([1, 2, 3], 9, 1)).toBeNull();
  });
});

describe("con el mouse", () => {
  it("apretar y mover levanta la card sin esperar, y al soltar guarda el orden", () => {
    // Lo natural en una PC. Antes había que quedarse quieto medio segundo, y
    // moverse antes de tiempo cancelaba: en la PC parecía que no se podía.
    const { hook, onReordenar } = montar();
    act(() => hook.result.current.props(4).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    expect(hook.result.current.arrastrando).toBe(4);

    debajo(1);
    act(() => mover(200));
    expect(hook.result.current.orden).toEqual([4, 1, 2, 3]);

    act(() => soltar());
    expect(onReordenar).toHaveBeenCalledWith([4, 1, 2, 3]);
    expect(hook.result.current.arrastrando).toBeNull();
  });

  it("el click que llega al soltar no cuenta como agregar al carrito", () => {
    // Soltar la card disparaba su click y el producto entraba a la venta.
    const { hook } = montar();
    act(() => hook.result.current.props(2).onPointerDown(puntero("mouse")));
    act(() => mover(30));
    act(() => soltar());
    expect(hook.result.current.ignorarClic()).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(hook.result.current.ignorarClic()).toBe(false);
  });

  it("un click con pulso (menos de 8 px) es un click, no un arrastre", () => {
    const { hook, onReordenar } = montar();
    act(() => hook.result.current.props(2).onPointerDown(puntero("mouse")));
    act(() => mover(5, 3));
    act(() => soltar());
    expect(hook.result.current.arrastrando).toBeNull();
    expect(onReordenar).not.toHaveBeenCalled();
    expect(hook.result.current.ignorarClic()).toBe(false);
  });

  it("el botón derecho no levanta nada", () => {
    const { hook } = montar();
    act(() => hook.result.current.props(2).onPointerDown({ ...puntero("mouse"), button: 2 } as React.PointerEvent));
    act(() => mover(40));
    expect(hook.result.current.arrastrando).toBeNull();
  });
});

describe("con el dedo", () => {
  it("mantener presionado levanta la card y sigue al dedo aunque el toque esté capturado", () => {
    // Con el dedo el navegador captura el puntero en la card donde arrancó:
    // las demás nunca recibían el "pasó por encima" y la card no se movía.
    const { hook, onReordenar } = montar();
    act(() => hook.result.current.props(3).onPointerDown(puntero("touch")));
    act(() => vi.advanceTimersByTime(500));
    expect(hook.result.current.arrastrando).toBe(3);

    debajo(1);
    act(() => mover(150, 10));
    act(() => soltar());
    expect(onReordenar).toHaveBeenCalledWith([3, 1, 2, 4]);
  });

  it("deslizar antes del medio segundo es un scroll de la grilla", () => {
    const { hook, onReordenar } = montar();
    act(() => hook.result.current.props(3).onPointerDown(puntero("touch")));
    act(() => mover(0, 40));
    act(() => vi.advanceTimersByTime(600));
    expect(hook.result.current.arrastrando).toBeNull();
    act(() => soltar());
    expect(onReordenar).not.toHaveBeenCalled();
  });

  it("con la card levantada, el dedo no desplaza la grilla", () => {
    const { hook } = montar();
    act(() => hook.result.current.props(3).onPointerDown(puntero("touch")));
    act(() => vi.advanceTimersByTime(500));
    const ev = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("la grilla se desplaza sola en el borde", () => {
  /** Una grilla de 400 px de alto con 1000 px de contenido. */
  function grilla() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
    let scroll = 0;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => scroll,
      set: (v: number) => {
        scroll = Math.max(0, Math.min(1000, v));
      },
    });
    return el;
  }

  it("más rápido cuanto más adentro del borde, y nada lejos de los bordes", () => {
    expect(desplazamientoAutomatico(200, 0, 400)).toBe(0);
    expect(desplazamientoAutomatico(390, 0, 400)).toBeGreaterThan(0);
    expect(desplazamientoAutomatico(399, 0, 400)).toBeGreaterThan(desplazamientoAutomatico(360, 0, 400));
    expect(desplazamientoAutomatico(5, 0, 400)).toBeLessThan(0);
    // Con el puntero fuera de la grilla no se dispara al fondo de golpe.
    expect(desplazamientoAutomatico(2000, 0, 400)).toBe(18);
  });

  it("con la card cerca del borde de abajo baja, y al soltar se detiene", () => {
    // En la tablet, llevar un producto de la última fila a la primera obligaba
    // a soltarlo, scrollear y volver a levantarlo.
    const el = grilla();
    const hook = renderHook(() =>
      useArrastreGrilla({ ids: IDS, onReordenar: vi.fn(), contenedor: { current: el } }),
    );
    act(() => hook.result.current.props(4).onPointerDown(puntero("mouse", 100, 100)));
    act(() => mover(100, 395));
    act(() => vi.advanceTimersByTime(200));
    expect(el.scrollTop).toBeGreaterThan(0);

    act(() => soltar());
    const quieto = el.scrollTop;
    act(() => vi.advanceTimersByTime(200));
    expect(el.scrollTop).toBe(quieto);
  });

  it("el dedo queda frenado dentro de la grilla y el resto de la pantalla scrollea", () => {
    // El listener que frena el scroll iba en window: cada scroll con el dedo
    // de toda la pantalla esperaba a la grilla.
    const el = grilla();
    const hook = renderHook(() =>
      useArrastreGrilla({ ids: IDS, onReordenar: vi.fn(), contenedor: { current: el } }),
    );
    act(() => hook.result.current.props(3).onPointerDown(puntero("touch")));
    act(() => vi.advanceTimersByTime(500));

    const enLaGrilla = new Event("touchmove", { cancelable: true, bubbles: true });
    el.dispatchEvent(enLaGrilla);
    expect(enLaGrilla.defaultPrevented).toBe(true);

    const afuera = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(afuera);
    expect(afuera.defaultPrevented).toBe(false);
  });
});

it("Escape suelta la card sin guardar el orden", () => {
  const { hook, onReordenar } = montar();
  act(() => hook.result.current.props(4).onPointerDown(puntero("mouse")));
  act(() => mover(20));
  debajo(1);
  act(() => mover(200));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(hook.result.current.arrastrando).toBeNull();
  expect(hook.result.current.orden).toEqual(IDS);
  act(() => soltar());
  expect(onReordenar).not.toHaveBeenCalled();
});
