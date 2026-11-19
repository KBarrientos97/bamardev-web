import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desplazamientoAutomatico, moverEnGrupo, moverEnLista, useArrastreGrilla } from "./useArrastreGrilla";

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

describe("sólo dentro de su grupo (la lista en columnas, 17-nov)", () => {
  // Del 1 al 9 son pollos; del 10 en adelante, bebidas. Mezclados, como en el
  // orden del cajero, que es el mismo de las tarjetas.
  const delGrupo = (a: number, b: number) => (a < 10) === (b < 10);

  it("moverEnGrupo reacomoda los lugares del grupo y deja los demás donde estaban", () => {
    expect(moverEnGrupo([1, 10, 2, 20, 3], 1, 3, (id) => id < 10)).toEqual([2, 10, 3, 20, 1]);
    expect(moverEnGrupo([1, 10, 2, 20, 3], 3, 1, (id) => id < 10)).toEqual([3, 10, 1, 20, 2]);
    expect(moverEnGrupo([1, 10, 2], 2, 2, (id) => id < 10)).toBeNull();
  });

  it("pasar por encima de una de otro grupo no la lleva para allá: se queda en el último lugar que valía", () => {
    const onReordenar = vi.fn();
    const hook = renderHook(() =>
      useArrastreGrilla({ ids: [1, 2, 10, 3, 20], onReordenar, aceptaDestino: delGrupo }),
    );
    act(() => hook.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    debajo(10);
    act(() => mover(60));
    expect(hook.result.current.orden).toEqual([1, 2, 10, 3, 20]);

    debajo(3);
    act(() => mover(100));
    expect(hook.result.current.orden).toEqual([2, 3, 10, 1, 20]);

    // De vuelta por la bebida y fuera de la lista: no se mueve de donde quedó.
    debajo(20);
    act(() => mover(140));
    debajo(null);
    act(() => mover(400));
    expect(hook.result.current.orden).toEqual([2, 3, 10, 1, 20]);

    act(() => soltar());
    expect(onReordenar).toHaveBeenCalledWith([2, 3, 10, 1, 20]);
  });

  it("sin la regla (las tarjetas), a cualquier lugar, como siempre", () => {
    const { hook } = montar();
    act(() => hook.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    debajo(4);
    act(() => mover(200));
    expect(hook.result.current.orden).toEqual([2, 3, 4, 1]);
  });
});

describe("las categorías (los chips y los bloques de la lista en columnas, 18-nov)", () => {
  /** Lo que el puntero tiene debajo: un elemento con ese atributo y ese id. */
  function debajoCon(atributo: string, id: number) {
    const el = document.createElement("span");
    el.setAttribute(atributo, String(id));
    document.elementFromPoint = vi.fn(() => el);
  }

  it("con su propio atributo: una tarjeta de producto con el mismo id no es destino, ni «Todos» (que no lo lleva)", () => {
    // La categoría 3 y el producto 3 son cosas distintas: sin atributo propio,
    // pasar el chip por encima de la tarjeta del producto 3 lo movía.
    const onReordenar = vi.fn();
    const hook = renderHook(() => useArrastreGrilla({ ids: [1, 2, 3], onReordenar, atributo: "data-arrastre-chip" }));
    expect(hook.result.current.props(2)["data-arrastre-chip"]).toBe(2);
    expect(hook.result.current.props(2)).not.toHaveProperty("data-arrastre-id");

    act(() => hook.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    debajo(3);
    act(() => mover(60));
    expect(hook.result.current.orden).toEqual([1, 2, 3]);
    // «Todos»: un chip sin el atributo, ni se mueve ni es destino.
    const todos = document.createElement("button");
    document.elementFromPoint = vi.fn(() => todos);
    act(() => mover(80));
    expect(hook.result.current.orden).toEqual([1, 2, 3]);

    debajoCon("data-arrastre-chip", 3);
    act(() => mover(100));
    expect(hook.result.current.orden).toEqual([2, 3, 1]);
    act(() => soltar());
    expect(onReordenar).toHaveBeenCalledWith([2, 3, 1]);
  });

  it("anti-rebote: lo que quedó debajo después de un cambio no vuelve a cambiar hasta pasar por otro (o por ninguno)", () => {
    // El chip 2 es más ancho que el 1: después de cambiarlos, el puntero sigue
    // sobre el 2, y en cada movimiento los volvía a cambiar (parpadeo).
    const onReordenar = vi.fn();
    const hook = renderHook(() =>
      useArrastreGrilla({ ids: [1, 2, 3], onReordenar, atributo: "data-arrastre-chip", antiRebote: true }),
    );
    act(() => hook.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    debajoCon("data-arrastre-chip", 2);
    act(() => mover(60));
    expect(hook.result.current.orden).toEqual([2, 1, 3]);
    act(() => mover(62));
    act(() => mover(64));
    expect(hook.result.current.orden).toEqual([2, 1, 3]);

    // Pasa por la levantada (otro elemento) y vuelve al 2: ahí sí es un movimiento.
    debajoCon("data-arrastre-chip", 1);
    act(() => mover(100));
    debajoCon("data-arrastre-chip", 2);
    act(() => mover(30));
    expect(hook.result.current.orden).toEqual([1, 2, 3]);
    act(() => mover(32));
    expect(hook.result.current.orden).toEqual([1, 2, 3]);

    // Por el hueco entre dos chips (ninguno) también vuelve a valer.
    document.elementFromPoint = vi.fn(() => null);
    act(() => mover(45));
    debajoCon("data-arrastre-chip", 2);
    act(() => mover(60));
    expect(hook.result.current.orden).toEqual([2, 1, 3]);
    act(() => soltar());
    expect(onReordenar).toHaveBeenCalledWith([2, 1, 3]);
  });

  it("uno levantado por vez: con una categoría en la mano no se levanta un producto, ni al revés", () => {
    const chips = renderHook(() => useArrastreGrilla({ ids: [1, 2], onReordenar: vi.fn(), atributo: "data-arrastre-chip" }));
    const productos = renderHook(() => useArrastreGrilla({ ids: [1, 2], onReordenar: vi.fn() }));
    act(() => chips.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    expect(chips.result.current.arrastrando).toBe(1);
    // Otro dedo sobre una tarjeta, mientras tanto: no se levanta.
    act(() => productos.result.current.props(2).onPointerDown(puntero("touch")));
    act(() => vi.advanceTimersByTime(500));
    expect(productos.result.current.arrastrando).toBeNull();

    act(() => soltar());
    act(() => productos.result.current.props(2).onPointerDown(puntero("touch")));
    act(() => vi.advanceTimersByTime(500));
    expect(productos.result.current.arrastrando).toBe(2);
    act(() => chips.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(40));
    expect(chips.result.current.arrastrando).toBeNull();
    act(() => soltar());
  });

  it("sin el anti-rebote (las tarjetas, que miden todas lo mismo), cada movimiento vuelve a mirar, como siempre", () => {
    const hook = renderHook(() => useArrastreGrilla({ ids: [1, 2, 3], onReordenar: vi.fn() }));
    act(() => hook.result.current.props(1).onPointerDown(puntero("mouse")));
    act(() => mover(20));
    debajo(2);
    act(() => mover(60));
    expect(hook.result.current.orden).toEqual([2, 1, 3]);
    act(() => mover(62));
    expect(hook.result.current.orden).toEqual([1, 2, 3]);
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
